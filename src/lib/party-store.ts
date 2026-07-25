// Deterministic mutation queue for Party persistence. Wraps a PartyClient
// (Supabase adapter or fake) with:
//   - INSERT vs UPDATE split
//   - column-diffed UPDATE with optimistic concurrency
//   - refetch + 3-way merge for guest-mutated column contention
//   - explicit conflict resolution API (Use mine / Keep theirs)
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
  HOST_COLUMNS,
  diffColumns,
  contendedColumns,
  mergeContendedColumns,
  partyToColumns,
  rowToParty,
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
  /** Insert has hit a permanent (non-retriable) failure. UI shows a
   * "Not saved" recovery card until the user retries or discards. */
  insertRejected: boolean;
  userId: string;
  /** Monotonic epoch stamped from the store at entry creation. Used to
   *  discard writes/events after an identity reset so a pending write from
   *  account A cannot flush after account B signs in. */
  epoch: number;
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
  /** Redacted logger (defaults to console.warn). */
  logError?: (event: string, meta: Record<string, unknown>) => void;
}

// Generic, user-safe copy — never interpolate raw provider messages.
const GENERIC_SAVE_ERROR = "Couldn't save your changes. Tap retry.";
const GENERIC_OFFLINE = "You're offline. We'll retry when you're back.";
const GENERIC_CONFLICT = "This party changed elsewhere. Choose which to keep.";
const GENERIC_REJECTED = "This party couldn't be saved to the cloud. It's kept on this device.";

export class PartyStore {
  private queue = new Map<string, Entry>();
  /** Monotonic identity epoch. Bumped by reset() so async continuations
   *  from a prior identity can detect they are stale and abort. */
  private epoch = 0;
  /** Owner user id for the queue. null = not established yet (e.g. demo/
   *  signed-out) or just after reset(null). Enqueue/seed calls that don't
   *  match will be refused. */
  private currentUserId: string | null = null;
  private opts: Required<
    Omit<PartyStoreOptions, "onEvent" | "client" | "isTombstoned" | "logError">
  > &
    Pick<PartyStoreOptions, "onEvent" | "client" | "isTombstoned"> & {
      logError: NonNullable<PartyStoreOptions["logError"]>;
    };

  constructor(opts: PartyStoreOptions) {
    this.opts = {
      sleep: opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      isOnline:
        opts.isOnline ?? (() => (typeof navigator === "undefined" ? true : navigator.onLine)),
      onEvent: opts.onEvent,
      client: opts.client,
      isTombstoned: opts.isTombstoned,
      logError:
        opts.logError ??
        ((event, meta) => {
          console.warn(`[party-store] ${event}`, meta);
        }),
    };
  }

  /** Reset the store on auth identity change. Drops every queued entry
   *  (pending inserts, updates, conflicts, offline retries) and bumps the
   *  epoch so any in-flight network continuation aborts silently instead of
   *  emitting state/toasts or persisting into the wrong account. */
  reset(nextUserId: string | null) {
    this.epoch += 1;
    this.queue.clear();
    this.currentUserId = nextUserId;
  }

  /** Read the current owner user id (test helper / diagnostics). */
  getCurrentUserId(): string | null {
    return this.currentUserId;
  }

  /** True when writes from `userId` are welcome — i.e. queue is unclaimed
   *  or already claimed by that user. */
  private acceptsUser(userId: string): boolean {
    if (this.currentUserId === null) {
      this.currentUserId = userId;
      return true;
    }
    return this.currentUserId === userId;
  }

  private refuseCrossUser(op: string, id: string, userId: string) {
    this.opts.logError("cross_user_write_refused", {
      op,
      id,
      // Never log the raw ids — only lengths — to avoid painting auth ids
      // into error surfaces.
      currentUserIdLen: this.currentUserId?.length ?? 0,
      incomingUserIdLen: userId.length,
    });
  }

  /** Record a server snapshot (from initial load) so the first UPDATE has a baseline. */
  seedBaseline(party: Party, userId: string) {
    if (!this.acceptsUser(userId)) {
      this.refuseCrossUser("seedBaseline", party.id, userId);
      return;
    }
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
        insertRejected: false,
        userId,
        epoch: this.epoch,
      });
  }

  getState(id: string): {
    state: SaveState;
    conflict: PendingConflict | null;
    insertRejected: boolean;
  } {
    const e = this.queue.get(id);
    return {
      state: e?.state ?? "idle",
      conflict: e?.pendingConflict ?? null,
      insertRejected: e?.insertRejected ?? false,
    };
  }

  enqueueInsert(party: Party, userId: string) {
    if (!this.acceptsUser(userId)) {
      this.refuseCrossUser("enqueueInsert", party.id, userId);
      return;
    }
    const e = this.queue.get(party.id);
    if (e) {
      e.latest = party;
      e.userId = userId;
      e.insertRejected = false;
    } else {
      this.queue.set(party.id, {
        latest: party,
        baseline: null,
        running: false,
        attempts: 0,
        state: "idle",
        pendingConflict: null,
        insertRejected: false,
        userId,
        epoch: this.epoch,
      });
    }
    void this.kick(party.id);
  }

  enqueueUpdate(party: Party, userId: string) {
    if (!this.acceptsUser(userId)) {
      this.refuseCrossUser("enqueueUpdate", party.id, userId);
      return;
    }
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

  /** Retry a party stuck in transient error/offline (NOT a semantic conflict). */
  retry(id: string) {
    const e = this.queue.get(id);
    if (!e) return;
    if (e.state === "conflict") {
      // Semantic conflicts require an explicit Use mine / Keep theirs choice.
      return;
    }
    e.attempts = 0;
    e.insertRejected = false;
    void this.kick(id);
  }

  /** Resolve a semantic (non-mergeable) conflict.
   *  - "mine": overlay preserved local values onto the fresh baseline and enqueue.
   *  - "theirs": discard local values; server state (already merged) becomes canonical.
   */
  resolveConflict(id: string, choice: "mine" | "theirs") {
    const e = this.queue.get(id);
    if (!e || !e.pendingConflict || !e.baseline) return;
    if (choice === "theirs") {
      // Server values already sit on `latest` and `baseline` from handleConflict.
      e.pendingConflict = null;
      e.attempts = 0;
      this.setState(id, "saved");
      return;
    }
    // "mine": overlay local values from the pending conflict record onto the
    // fresh server baseline. This is deterministic — no dependency on React state.
    const overlay = e.pendingConflict.localValues;
    const merged: Party = rowToParty({
      ...(e.baseline as PartyRow),
      ...overlay,
    } as PartyRow);
    // Preserve local-only client fields carried on the current latest.
    merged.heroImageUrl = e.latest.heroImageUrl;
    e.latest = merged;
    e.pendingConflict = null;
    e.attempts = 0;
    // Clear conflict state so kick() proceeds.
    this.setState(id, "idle");
    void this.kick(id);
  }

  /** Discard a locally-recoverable draft that failed permanent insert.
   *  Removes from queue; caller should also remove local state and tombstone. */
  discardLocalDraft(id: string) {
    this.queue.delete(id);
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
    // Conflict must be resolved explicitly by the user.
    if (e.state === "conflict") return;
    e.running = true;
    this.setState(id, "saving");
    try {
      await this.runOne(id);
    } finally {
      const cur = this.queue.get(id);
      if (cur) cur.running = false;
    }
  }

  /** True when the entry still exists AND its epoch matches the value
   *  captured before an async await. Any mismatch means an identity reset
   *  happened while we were awaiting network I/O — abort silently. */
  private aliveAt(id: string, epoch: number): boolean {
    const cur = this.queue.get(id);
    return !!cur && cur.epoch === epoch;
  }

  private async runOne(id: string) {
    const startEntry = this.queue.get(id);
    if (!startEntry) return;
    const startEpoch = startEntry.epoch;
    while (true) {
      const e = this.queue.get(id);
      if (!e || e.epoch !== startEpoch) return;
      if (this.opts.isTombstoned(id)) {
        this.queue.delete(id);
        return;
      }

      const snapshot = e.latest;
      const userId = e.userId;

      // INSERT path.
      if (!e.baseline) {
        const row = partyToColumns(snapshot, userId);
        const { data, error } = await this.opts.client.insert(row);
        // Identity may have changed while awaiting I/O. If so, discard the
        // result — do NOT persist server-row events into the new account.
        if (!this.aliveAt(id, startEpoch)) return;
        if (error) {
          const done = await this.handleInsertError(id, error);
          if (!this.aliveAt(id, startEpoch)) return;
          if (done) return;
          continue;
        }
        const eNow = this.queue.get(id)!;
        if (data) {
          eNow.baseline = data;
          eNow.insertRejected = false;
          const merged: Party = { ...rowToParty(data), ...localOnlyFields(snapshot) };
          this.emit({ type: "server-row", id, party: merged });
        }
        if (this.queue.get(id)?.latest !== snapshot) continue;
        this.done(id);
        return;
      }

      // UPDATE path.
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
      if (!this.aliveAt(id, startEpoch)) return;
      if (error) {
        const done = await this.handleError(id, error);
        if (!this.aliveAt(id, startEpoch)) return;
        if (done) return;
        continue;
      }
      if (conflict) {
        const handled = await this.handleConflict(id, snapshot, nextRow, changed);
        if (!this.aliveAt(id, startEpoch)) return;
        if (!handled) return; // conflict awaits user resolution
        continue;
      }
      const eNow = this.queue.get(id)!;
      if (data) {
        eNow.baseline = data;
        const merged: Party = {
          ...rowToParty(data),
          ...localOnlyFields(snapshot),
        };
        this.emit({ type: "server-row", id, party: merged });
      }
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
    e.insertRejected = false;
    this.setState(id, "saved");
  }

  private async handleError(id: string, error: SaveError): Promise<boolean> {
    const e = this.queue.get(id);
    if (!e) return true;
    e.attempts += 1;
    this.opts.logError("save_error", {
      id,
      kind: error.kind,
      attempts: e.attempts,
      // Only structural info — never emails/tokens/full payloads.
      messagePreview: error.message.slice(0, 80),
    });
    if (error.kind === "network" && !this.opts.isOnline()) {
      this.setState(id, "offline");
      this.emit({ type: "toast", kind: "error", message: GENERIC_OFFLINE });
      return true;
    }
    if (error.kind === "permission" || e.attempts >= MAX_ATTEMPTS) {
      this.setState(id, "error");
      this.emit({ type: "toast", kind: "error", message: GENERIC_SAVE_ERROR });
      return true;
    }
    await this.opts.sleep(nextBackoff(e.attempts));
    return false;
  }

  private async handleInsertError(id: string, error: SaveError): Promise<boolean> {
    const e = this.queue.get(id);
    if (!e) return true;
    e.attempts += 1;
    this.opts.logError("insert_error", {
      id,
      kind: error.kind,
      attempts: e.attempts,
      messagePreview: error.message.slice(0, 80),
    });
    if (error.kind === "network" && !this.opts.isOnline()) {
      this.setState(id, "offline");
      this.emit({ type: "toast", kind: "error", message: GENERIC_OFFLINE });
      return true;
    }
    if (error.kind === "permission" || e.attempts >= MAX_ATTEMPTS) {
      e.insertRejected = true;
      this.setState(id, "error");
      this.emit({ type: "toast", kind: "error", message: GENERIC_REJECTED });
      return true;
    }
    await this.opts.sleep(nextBackoff(e.attempts));
    return false;
  }

  private async handleConflict(
    id: string,
    snapshot: Party,
    nextRow: PartyRow,
    changedCols: HostColumn[],
  ): Promise<boolean> {
    const e = this.queue.get(id);
    if (!e || !e.baseline) return false;
    const startEpoch = e.epoch;
    const { data: fresh, error } = await this.opts.client.fetch(id);
    // Identity may have reset while awaiting the fresh row — drop silently.
    if (!this.aliveAt(id, startEpoch)) return false;
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

    const { merged, unresolvedNonMergeable } = mergeContendedColumns(
      e.baseline,
      nextRow,
      fresh,
      contended,
    );
    // Adopt server value for columns we didn't touch.
    for (const col of HOST_COLUMNS) {
      if (!changedCols.includes(col)) {
        (merged as Record<string, unknown>)[col] = (fresh as Record<string, unknown>)[col];
      }
    }

    // New baseline is the fresh server row (with server metadata).
    e.baseline = fresh;
    (merged as Record<string, unknown>).updated_at = fresh.updated_at;
    (merged as Record<string, unknown>).rsvp_token = fresh.rsvp_token;
    (merged as Record<string, unknown>).created_at = fresh.created_at;
    const mergedFull: Party = {
      ...rowToParty(merged),
      ...localOnlyFields(snapshot),
    };
    this.emit({ type: "server-row", id, party: mergedFull });
    e.latest = mergedFull;

    if (unresolvedNonMergeable.length > 0) {
      const localValues: Partial<PartyRow> = {};
      const serverValues: Partial<PartyRow> = {};
      for (const col of unresolvedNonMergeable) {
        (localValues as Record<string, unknown>)[col] = (nextRow as Record<string, unknown>)[col];
        (serverValues as Record<string, unknown>)[col] = (fresh as Record<string, unknown>)[col];
      }
      e.pendingConflict = {
        columns: unresolvedNonMergeable,
        localValues,
        serverValues,
        at: new Date().toISOString(),
      };
      this.setState(id, "conflict");
      this.emit({ type: "toast", kind: "error", message: GENERIC_CONFLICT });
      return false;
    }
    e.attempts += 1;
    if (e.attempts >= MAX_ATTEMPTS) {
      this.setState(id, "error");
      this.emit({ type: "toast", kind: "error", message: GENERIC_SAVE_ERROR });
      return false;
    }
    return true;
  }
}

// Fields that live only on the client-side Party but never on the row shape.
function localOnlyFields(snapshot: Party): Partial<Party> {
  return { heroImageUrl: snapshot.heroImageUrl };
}
