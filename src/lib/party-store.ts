// Deterministic mutation queue for Party persistence. Wraps a PartyClient
// (Supabase adapter or fake) with:
//   - INSERT vs UPDATE split
//   - column-diffed UPDATE with optimistic concurrency
//   - refetch + 3-way merge for guest-mutated column contention
//   - bounded retry with jittered backoff and online-event flush
//   - per-party save state exposed via subscribe/getState
//
// This module deliberately owns no React state; PartyProvider adapts it.

import type { Party } from "./party-context";
import {
  type PartyClient,
  type PartyRow,
  type SaveState,
  type SaveError,
  type PendingConflict,
  type HostColumn,
  diffColumns,
  contendedColumns,
  mergeContendedColumns,
  partyToColumns,
  rowToParty,
  MERGEABLE_COLUMNS,
  MAX_ATTEMPTS,
  nextBackoff,
} from "./party-persistence";

type Entry = {
  latest: Party;
  baseline: PartyRow | null; // null = never persisted → insert
  running: boolean;
  attempts: number;
  state: SaveState;
  pendingConflict: PendingConflict | null;
  userId: string;
};

export type StoreEvent =
  | { type: "state"; id: string; state: SaveState; conflict: PendingConflict | null }
  | { type: "server-row"; id: string; party: Party }
  | { type: "toast"; kind: "error" | "info"; message: string };

export interface PartyStoreOptions {
  client: PartyClient;
  isTombstoned: (id: string) => boolean;
  sleep?: (ms: number) => Promise<void>;
  onEvent: (ev: StoreEvent) => void;
  /** For online-recovery — inject in tests. */
  isOnline?: () => boolean;
}

export class PartyStore {
  private queue = new Map<string, Entry>();
  private opts: Required<Omit<PartyStoreOptions, "onEvent" | "client" | "isTombstoned">> &
    Pick<PartyStoreOptions, "onEvent" | "client" | "isTombstoned">;

  constructor(opts: PartyStoreOptions) {
    this.opts = {
      sleep: opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      isOnline:
        opts.isOnline ?? (() => (typeof navigator === "undefined" ? true : navigator.onLine)),
      onEvent: opts.onEvent,
      client: opts.client,
      isTombstoned: opts.isTombstoned,
    };
  }

  /** Record a server snapshot (from initial load) so the first UPDATE has a baseline. */
  seedBaseline(party: Party, userId: string) {
    const row = { ...partyToColumns(party, userId), updated_at: party.updatedAt };
    const existing = this.queue.get(party.id);
    if (existing) existing.baseline = row;
    else
      this.queue.set(party.id, {
        latest: party,
        baseline: row,
        running: false,
        attempts: 0,
        state: "idle",
        pendingConflict: null,
        userId,
      });
  }

  getState(id: string): { state: SaveState; conflict: PendingConflict | null } {
    const e = this.queue.get(id);
    return { state: e?.state ?? "idle", conflict: e?.pendingConflict ?? null };
  }

  enqueueInsert(party: Party, userId: string) {
    const e = this.queue.get(party.id);
    if (e) {
      e.latest = party;
      e.userId = userId;
    } else {
      this.queue.set(party.id, {
        latest: party,
        baseline: null,
        running: false,
        attempts: 0,
        state: "idle",
        pendingConflict: null,
        userId,
      });
    }
    void this.kick(party.id);
  }

  enqueueUpdate(party: Party, userId: string) {
    const e = this.queue.get(party.id);
    if (!e) {
      // Never loaded from server (e.g. locally-created row). Treat as insert.
      this.enqueueInsert(party, userId);
      return;
    }
    e.latest = party;
    e.userId = userId;
    void this.kick(party.id);
  }

  drop(id: string) {
    this.queue.delete(id);
  }

  /** Retry a party whose last save errored. */
  retry(id: string) {
    const e = this.queue.get(id);
    if (!e) return;
    e.attempts = 0;
    void this.kick(id);
  }

  /** Flush every queued party (called on `online` event). */
  flushAll() {
    for (const id of this.queue.keys()) void this.kick(id);
  }

  private emit(ev: StoreEvent) {
    this.opts.onEvent(ev);
  }

  private setState(id: string, state: SaveState) {
    const e = this.queue.get(id);
    if (!e) return;
    e.state = state;
    this.emit({ type: "state", id, state, conflict: e.pendingConflict });
  }

  private async kick(id: string) {
    const e = this.queue.get(id);
    if (!e || e.running) return;
    if (this.opts.isTombstoned(id)) {
      this.queue.delete(id);
      return;
    }
    e.running = true;
    this.setState(id, "saving");
    try {
      await this.runOne(id);
    } finally {
      const cur = this.queue.get(id);
      if (cur) cur.running = false;
    }
  }

  private async runOne(id: string) {
    while (true) {
      const e = this.queue.get(id);
      if (!e) return;
      if (this.opts.isTombstoned(id)) {
        this.queue.delete(id);
        return;
      }

      // Capture snapshot at start of this cycle for coalescing.
      const snapshot = e.latest;
      const userId = e.userId;

      // INSERT path.
      if (!e.baseline) {
        const row = partyToColumns(snapshot, userId);
        const { data, error } = await this.opts.client.insert(row);
        if (error) {
          const done = await this.handleError(id, error);
          if (done) return;
          continue;
        }
        if (data) {
          e.baseline = data;
          const merged: Party = { ...rowToParty(data), ...localOnlyFields(snapshot, data) };
          this.emit({ type: "server-row", id, party: merged });
        }
        // If more edits came in during the insert, they land as updates now.
        if (this.queue.get(id)?.latest !== snapshot) continue;
        this.done(id);
        return;
      }

      // UPDATE path — diff against baseline.
      const nextRow = partyToColumns(snapshot, userId);
      const { patch, changed } = diffColumns(e.baseline, nextRow);
      if (changed.length === 0) {
        this.done(id);
        return;
      }
      const expectedUpdatedAt = e.baseline.updated_at ?? "";
      const { data, error, conflict } = await this.opts.client.updateWithConcurrency(
        id,
        patch,
        expectedUpdatedAt,
      );
      if (error) {
        const done = await this.handleError(id, error);
        if (done) return;
        continue;
      }
      if (conflict) {
        const handled = await this.handleConflict(id, snapshot, nextRow, changed);
        if (!handled) return; // gave up; state already set
        continue;
      }
      if (data) {
        e.baseline = data;
        const merged: Party = {
          ...rowToParty(data),
          ...localOnlyFields(snapshot, data),
        };
        this.emit({ type: "server-row", id, party: merged });
      }
      // If more edits arrived during the roundtrip, loop and diff again.
      if (this.queue.get(id)?.latest !== snapshot) continue;
      this.done(id);
      return;
    }
  }

  private done(id: string) {
    const e = this.queue.get(id);
    if (!e) return;
    e.attempts = 0;
    e.pendingConflict = null;
    this.setState(id, "saved");
  }

  private async handleError(id: string, error: SaveError): Promise<boolean> {
    const e = this.queue.get(id);
    if (!e) return true;
    e.attempts += 1;
    if (error.kind === "network" && !this.opts.isOnline()) {
      this.setState(id, "offline");
      this.emit({
        type: "toast",
        kind: "error",
        message: "You're offline. We'll retry when you're back.",
      });
      return true;
    }
    if (e.attempts >= MAX_ATTEMPTS) {
      this.setState(id, "error");
      this.emit({
        type: "toast",
        kind: "error",
        message: `Couldn't save changes: ${error.message}. Tap retry.`,
      });
      return true;
    }
    await this.opts.sleep(nextBackoff(e.attempts));
    return false; // keep looping
  }

  private async handleConflict(
    id: string,
    _snapshot: Party,
    nextRow: PartyRow,
    changedCols: HostColumn[],
  ): Promise<boolean> {
    const e = this.queue.get(id);
    if (!e || !e.baseline) return false;
    const { data: fresh, error } = await this.opts.client.fetch(id);
    if (error || !fresh) {
      const done = await this.handleError(
        id,
        error ?? { message: "Row vanished", kind: "unknown" },
      );
      return !done ? true : false;
    }
    const contended = contendedColumns(e.baseline, nextRow, fresh).filter((c) =>
      changedCols.includes(c),
    );
    const nonMergeable = contended.filter((c) => !MERGEABLE_COLUMNS.has(c));

    const { merged } = mergeContendedColumns(e.baseline, nextRow, fresh, contended);
    // Adopt server's value for columns we didn't touch — the diff on the
    // next loop will only re-send our (merged) mergeable changes.
    for (const col of HOST_COLUMNS_ALL) {
      if (!changedCols.includes(col)) {
        (merged as Record<string, unknown>)[col] = (fresh as Record<string, unknown>)[col];
      }
    }

    // New baseline is the fresh server row.
    e.baseline = fresh;
    // `merged` is the authoritative post-conflict row: it has local values
    // for columns we changed, server values for columns we didn't, and
    // three-way merges for mergeable-column contention. Carry over the
    // server's row metadata so the next update diffs against the fresh
    // updated_at / rsvp_token / created_at.
    (merged as Record<string, unknown>).updated_at = fresh.updated_at;
    (merged as Record<string, unknown>).rsvp_token = fresh.rsvp_token;
    (merged as Record<string, unknown>).created_at = fresh.created_at;
    const mergedFull: Party = {
      ...rowToParty(merged),
      ...localOnlyFields(_snapshot, fresh),
    };
    this.emit({ type: "server-row", id, party: mergedFull });
    // The queue's latest becomes the merged local target so the next loop's
    // diff sends only the still-pending host-owned changes.
    e.latest = mergedFull;

    if (nonMergeable.length > 0) {
      // Preserve BOTH: server data is already displayed; local edit lives on
      // in the pending-conflict record and can be retried by the user.
      const localValues: Partial<PartyRow> = {};
      const serverValues: Partial<PartyRow> = {};
      for (const col of nonMergeable) {
        (localValues as Record<string, unknown>)[col] = (nextRow as Record<string, unknown>)[col];
        (serverValues as Record<string, unknown>)[col] = (fresh as Record<string, unknown>)[col];
      }
      e.pendingConflict = {
        columns: nonMergeable,
        localValues,
        serverValues,
        at: new Date().toISOString(),
      };
      this.setState(id, "conflict");
      this.emit({
        type: "toast",
        kind: "error",
        message: `Another change to ${nonMergeable.join(", ")} was saved elsewhere. Yours is preserved for retry.`,
      });
      return false;
    }
    e.attempts += 1;
    if (e.attempts >= MAX_ATTEMPTS) {
      this.setState(id, "error");
      return false;
    }
    return true;
  }
}

// Fields that live only on the client-side Party but never on the row shape
// (e.g. heroImageUrl is seeded on demo parties, not stored server-side).
function localOnlyFields(snapshot: Party, _row: PartyRow): Partial<Party> {
  return { heroImageUrl: snapshot.heroImageUrl };
}
function localOnlyFieldsFromMerged(_merged: PartyRow, _row: PartyRow): Partial<Party> {
  return {};
}

// Import at bottom to avoid cycle noise.
import { HOST_COLUMNS as HOST_COLUMNS_ALL } from "./party-persistence";
