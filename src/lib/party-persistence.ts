// Party persistence: column-diffed writes, optimistic concurrency, and
// id/key-aware three-way merges for guest-mutated columns. Pure and
// testable — the Supabase surface is abstracted behind PartyClient.
//
// Motivation: PartyProvider previously upserted the whole row on every
// host edit, which could clobber concurrent guest RPC writes to guests,
// bring_board, checkins, and host_updates. This module:
//   1) diffs top-level columns between baseline and next, sending only
//      what actually changed (no unrelated column can be overwritten);
//   2) uses optimistic concurrency via WHERE updated_at = baseline;
//   3) on conflict, refetches and 3-way merges guest-mutated columns
//      deterministically by id/key rather than blindly replacing them.

import type {
  Party,
  Guest,
  BringItem,
  HostUpdate,
  Task,
  BudgetCategory,
  TimelineItem,
  Household,
  PartyRetrospective,
} from "./party-context";
import type { ShoppingItem } from "./shopping";
import type { PartyPlanningProfile } from "./party-intelligence";
import { withTaskGuidance } from "./task-guidance";

// ----- Row shape used by the Supabase adapter -----

export type PartyRow = {
  id: string;
  user_id: string;
  name: string;
  occasion: string;
  date: string;
  start_time: string | null;
  location: string | null;
  guest_estimate: number;
  budget: number;
  theme: string;
  theme_id: string | null;
  tasks: unknown;
  guests: unknown;
  budget_categories: unknown;
  shopping_items: unknown;
  timeline: unknown;
  pinned_inspiration: unknown;
  host_note: string | null;
  households: unknown;
  bring_board: unknown;
  host_updates: unknown;
  holiday_pack_id: string | null;
  planning_profile: unknown;
  photo_drop: unknown;
  checkins: unknown;
  retrospective: unknown;
  rsvp_token?: string | null;
  updated_at?: string;
  created_at?: string;
};

/** All host-writable top-level columns, in stable order for deterministic diffs. */
export const HOST_COLUMNS = [
  "name",
  "occasion",
  "date",
  "start_time",
  "location",
  "guest_estimate",
  "budget",
  "theme",
  "theme_id",
  "tasks",
  "guests",
  "budget_categories",
  "shopping_items",
  "timeline",
  "pinned_inspiration",
  "host_note",
  "households",
  "bring_board",
  "host_updates",
  "holiday_pack_id",
  "planning_profile",
  "photo_drop",
  "checkins",
  "retrospective",
] as const;
export type HostColumn = (typeof HOST_COLUMNS)[number];

/** Columns that guest RPCs also write to. Contention on these gets merged. */
export const MERGEABLE_COLUMNS: ReadonlySet<HostColumn> = new Set<HostColumn>([
  "guests",
  "bring_board",
  "checkins",
  "host_updates",
]);

// ----- Party <-> row (kept in this module so tests can share it) -----

export function partyToColumns(p: Party, userId: string): PartyRow {
  return {
    id: p.id,
    user_id: userId,
    name: p.name,
    occasion: p.occasion,
    date: p.date,
    start_time: p.startTime ?? null,
    location: p.location ?? null,
    guest_estimate: p.guestEstimate,
    budget: p.budget,
    theme: p.theme,
    theme_id: p.themeId ?? null,
    tasks: p.tasks,
    guests: p.guests,
    budget_categories: p.budgetCategories,
    shopping_items: p.shoppingItems,
    timeline: p.timeline,
    pinned_inspiration: p.pinnedInspiration,
    host_note: p.hostNote ?? null,
    households: p.households ?? [],
    bring_board: p.bringBoard ?? [],
    host_updates: p.hostUpdates ?? [],
    holiday_pack_id: p.holidayPackId ?? null,
    planning_profile: p.planningProfile ?? {},
    photo_drop: p.photoDrop ?? null,
    checkins: p.checkins ?? {},
    retrospective: p.retrospective ?? null,
  };
}

export function rowToParty(r: PartyRow): Party {
  return {
    id: r.id,
    name: r.name,
    occasion: r.occasion as Party["occasion"],
    date: r.date,
    startTime: r.start_time ?? undefined,
    location: r.location ?? undefined,
    guestEstimate: r.guest_estimate,
    budget: Number(r.budget),
    theme: r.theme,
    themeId: r.theme_id ?? undefined,
    rsvpToken: r.rsvp_token ?? undefined,
    tasks: ((r.tasks as Task[]) ?? []).map(withTaskGuidance),
    guests: (r.guests as Guest[]) ?? [],
    budgetCategories: (r.budget_categories as BudgetCategory[]) ?? [],
    shoppingItems: (r.shopping_items as ShoppingItem[]) ?? [],
    timeline: (r.timeline as TimelineItem[]) ?? [],
    pinnedInspiration: (r.pinned_inspiration as string[]) ?? [],
    hostNote: r.host_note ?? undefined,
    households: (r.households as Household[]) ?? [],
    bringBoard: (r.bring_board as BringItem[]) ?? [],
    hostUpdates: (r.host_updates as HostUpdate[]) ?? [],
    holidayPackId: r.holiday_pack_id ?? undefined,
    planningProfile: (r.planning_profile as PartyPlanningProfile | null) ?? undefined,
    photoDrop: (r.photo_drop as Party["photoDrop"]) ?? null,
    checkins: (r.checkins as Record<string, string>) ?? {},
    retrospective: (r.retrospective as PartyRetrospective | null) ?? null,
    updatedAt: r.updated_at,
  };
}

// ----- Column diffing -----

/** Deterministic deep-equality good enough for our JSON-serializable shapes. */
function eq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** Returns only the columns whose value differs between baseline and next. */
export function diffColumns(
  baseline: PartyRow,
  next: PartyRow,
): { patch: Partial<PartyRow>; changed: HostColumn[] } {
  const patch: Partial<PartyRow> = {};
  const changed: HostColumn[] = [];
  for (const col of HOST_COLUMNS) {
    if (!eq(baseline[col], next[col])) {
      (patch as Record<string, unknown>)[col] = next[col];
      changed.push(col);
    }
  }
  return { patch, changed };
}

// ----- 3-way merges for guest-mutated columns -----

/** Guest-domain fields that indicate a real guest write on an item. */
function guestDomainDiffersGuest(a: Guest, b: Guest): boolean {
  return a.rsvp !== b.rsvp;
}
function guestDomainDiffersBring(a: BringItem, b: BringItem): boolean {
  return (
    a.status !== b.status ||
    a.assigneeName !== b.assigneeName ||
    a.assigneeHousehold !== b.assigneeHousehold ||
    a.claimedAt !== b.claimedAt
  );
}

/** Union by id: for items present in both local and server, prefer server
 * for guest-domain fields whenever the server value differs from baseline
 * (indicating a real guest write); otherwise prefer local.
 * Removals: honoring a local removal is UNSAFE when the server has a
 * concurrent guest-domain change on that same id (e.g. host removed a
 * guest whose RSVP just flipped to yes). Preserve the server row in that
 * case and report a semantic conflict for the host to resolve. */
export function mergeGuests(
  baseline: Guest[],
  local: Guest[],
  server: Guest[],
): { items: Guest[]; hadRemoveVsServerChange: boolean } {
  const bmap = new Map(baseline.map((g) => [g.id, g]));
  const lmap = new Map(local.map((g) => [g.id, g]));
  const smap = new Map(server.map((g) => [g.id, g]));
  const ids = new Set<string>([...lmap.keys(), ...smap.keys()]);
  const items: Guest[] = [];
  let hadRemoveVsServerChange = false;
  for (const id of ids) {
    const b = bmap.get(id);
    const l = lmap.get(id);
    const s = smap.get(id);
    if (b && !l) {
      if (s && guestDomainDiffersGuest(s, b)) {
        hadRemoveVsServerChange = true;
        items.push(s);
        continue;
      }
      continue;
    }
    if (b && !s) continue;
    if (l && s) {
      const rsvp = b && s.rsvp !== b.rsvp ? s.rsvp : l.rsvp;
      items.push({ ...l, rsvp });
      continue;
    }
    items.push((l ?? s) as Guest);
  }
  return { items, hadRemoveVsServerChange };
}

export function mergeBringBoard(
  baseline: BringItem[],
  local: BringItem[],
  server: BringItem[],
): { items: BringItem[]; hadRemoveVsServerChange: boolean } {
  const bmap = new Map(baseline.map((i) => [i.id, i]));
  const lmap = new Map(local.map((i) => [i.id, i]));
  const smap = new Map(server.map((i) => [i.id, i]));
  const ids = new Set<string>([...lmap.keys(), ...smap.keys()]);
  const items: BringItem[] = [];
  let hadRemoveVsServerChange = false;
  for (const id of ids) {
    const b = bmap.get(id);
    const l = lmap.get(id);
    const s = smap.get(id);
    if (b && !l) {
      if (s && guestDomainDiffersBring(s, b)) {
        hadRemoveVsServerChange = true;
        items.push(s);
        continue;
      }
      continue;
    }
    if (b && !s) continue;
    if (l && s) {
      const serverClaimed = b
        ? s.status !== b.status ||
          s.assigneeName !== b.assigneeName ||
          s.assigneeHousehold !== b.assigneeHousehold ||
          s.claimedAt !== b.claimedAt
        : false;
      const claim = serverClaimed
        ? {
            status: s.status,
            assigneeName: s.assigneeName,
            assigneeHousehold: s.assigneeHousehold,
            claimedAt: s.claimedAt,
          }
        : {
            status: l.status,
            assigneeName: l.assigneeName,
            assigneeHousehold: l.assigneeHousehold,
            claimedAt: l.claimedAt,
          };
      items.push({
        ...l,
        status: claim.status,
        assigneeName: claim.assigneeName,
        assigneeHousehold: claim.assigneeHousehold,
        claimedAt: claim.claimedAt,
      });
      continue;
    }
    items.push((l ?? s) as BringItem);
  }
  return { items, hadRemoveVsServerChange };
}

/** Key-union: keep the max ISO timestamp per key. */
export function mergeCheckins(
  _baseline: Record<string, string>,
  local: Record<string, string>,
  server: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = { ...server };
  for (const [k, v] of Object.entries(local)) {
    if (!out[k] || v > out[k]) out[k] = v;
  }
  return out;
}

/** Union by id, preserving order (server appended first, then any local-only). */
export function mergeHostUpdates(
  _baseline: HostUpdate[],
  local: HostUpdate[],
  server: HostUpdate[],
): HostUpdate[] {
  const seen = new Set<string>();
  const out: HostUpdate[] = [];
  for (const u of [...server, ...local]) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    out.push(u);
  }
  return out;
}

/** Apply 3-way merge for mergeable columns. Non-mergeable contended columns
 * and remove-vs-server-change semantic conflicts are surfaced in
 * `unresolvedNonMergeable` so the caller can hold the local edit for
 * explicit resolution while preserving server state on the merged row. */
export function mergeContendedColumns(
  baseline: PartyRow,
  local: PartyRow,
  server: PartyRow,
  contended: HostColumn[],
): { merged: PartyRow; unresolvedNonMergeable: HostColumn[] } {
  const merged: PartyRow = { ...local };
  const unresolved: HostColumn[] = [];
  for (const col of contended) {
    if (col === "guests") {
      const { items, hadRemoveVsServerChange } = mergeGuests(
        (baseline.guests as Guest[]) ?? [],
        (local.guests as Guest[]) ?? [],
        (server.guests as Guest[]) ?? [],
      );
      merged.guests = items;
      if (hadRemoveVsServerChange) unresolved.push(col);
    } else if (col === "bring_board") {
      const { items, hadRemoveVsServerChange } = mergeBringBoard(
        (baseline.bring_board as BringItem[]) ?? [],
        (local.bring_board as BringItem[]) ?? [],
        (server.bring_board as BringItem[]) ?? [],
      );
      merged.bring_board = items;
      if (hadRemoveVsServerChange) unresolved.push(col);
    } else if (col === "checkins") {
      merged.checkins = mergeCheckins(
        (baseline.checkins as Record<string, string>) ?? {},
        (local.checkins as Record<string, string>) ?? {},
        (server.checkins as Record<string, string>) ?? {},
      );
    } else if (col === "host_updates") {
      merged.host_updates = mergeHostUpdates(
        (baseline.host_updates as HostUpdate[]) ?? [],
        (local.host_updates as HostUpdate[]) ?? [],
        (server.host_updates as HostUpdate[]) ?? [],
      );
    } else {
      unresolved.push(col);
    }
  }
  for (const col of unresolved) {
    (merged as Record<string, unknown>)[col] = (server as Record<string, unknown>)[col];
  }
  return { merged, unresolvedNonMergeable: unresolved };
}

/** Which contended columns changed on both local and server vs baseline. */
export function contendedColumns(
  baseline: PartyRow,
  local: PartyRow,
  server: PartyRow,
): HostColumn[] {
  const out: HostColumn[] = [];
  for (const col of HOST_COLUMNS) {
    const localChanged = !eq(baseline[col], local[col]);
    const serverChanged = !eq(baseline[col], server[col]);
    if (localChanged && serverChanged && !eq(local[col], server[col])) out.push(col);
  }
  return out;
}

// ----- Save state & queue -----

export type SaveState = "idle" | "saving" | "saved" | "offline" | "error" | "conflict";

export type PendingConflict = {
  columns: HostColumn[];
  localValues: Partial<PartyRow>;
  serverValues: Partial<PartyRow>;
  /** Non-conflicting local edits and deterministic auto-merges that still
   * need to be written after the user resolves the semantic columns. */
  safeMergedValues: Partial<PartyRow>;
  at: string;
};

export interface PartyClient {
  insert(row: PartyRow): Promise<{ data: PartyRow | null; error: SaveError | null }>;
  /** UPDATE ... WHERE id AND updated_at = expectedUpdatedAt RETURNING *.
   * Returns { conflict: true } when no row matched updated_at (row exists but stale). */
  updateWithConcurrency(
    id: string,
    patch: Partial<PartyRow>,
    expectedUpdatedAt: string,
  ): Promise<{ data: PartyRow | null; error: SaveError | null; conflict: boolean }>;
  fetch(id: string): Promise<{ data: PartyRow | null; error: SaveError | null }>;
}

export type SaveError = { message: string; kind: "network" | "permission" | "unknown" };

// Bounded retry schedule with jitter (ms).
export function nextBackoff(attempt: number, jitter = () => Math.random()): number {
  const base = Math.min(200 * 2 ** attempt, 4000);
  return Math.floor(base * (0.5 + jitter() * 0.5));
}

export const MAX_ATTEMPTS = 4;
