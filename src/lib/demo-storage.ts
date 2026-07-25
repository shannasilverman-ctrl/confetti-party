// Versioned, validated localStorage for signed-out ("demo") party state.
//
// Contract:
//  - We NEVER trust the raw JSON blob as `Party[]`. Everything is parsed with
//    zod; items that fail validation are dropped, and if the top-level shape
//    is corrupt the store returns `null` and reports a warning.
//  - Seeded samples (shipped in code) and user-created demo parties are stored
//    separately. Seeds are always the fresh code version; only user *edits* to
//    a seed are persisted in an overrides map. This prevents a stale seed
//    snapshot from permanently shadowing later app updates to that seed.
//  - Size is enforced by UTF-8 byte length, not JS UTF-16 code units.

import { z } from "zod";
import type { Party } from "./party-context";

export const DEMO_STORAGE_KEY = "confetti:demo:v2";
export const DEMO_MAX_BYTES = 512 * 1024; // 512 KB
export const DEMO_MAX_PARTIES = 20;
export const DEMO_MAX_SAMPLES = 12;

const StringArray = z.array(z.string()).default([]);
const AnyArray = z.array(z.any()).default([]);
const AnyRecord = z.record(z.any()).default({});

// Permissive Party schema: we require the small set of fields the UI cannot
// render without, defensively coerce the rest, and drop unknown top-level
// junk. Any object failing this schema is skipped, not persisted, and not
// rendered.
const PartySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    occasion: z.string().min(1),
    date: z.string().min(1),
    startTime: z.string().optional(),
    location: z.string().optional(),
    guestEstimate: z.coerce.number().finite().nonnegative().default(0),
    budget: z.coerce.number().finite().nonnegative().default(0),
    theme: z.string().default(""),
    themeId: z.string().optional(),
    rsvpToken: z.string().optional(),
    tasks: AnyArray,
    guests: AnyArray,
    budgetCategories: AnyArray,
    timeline: AnyArray,
    shoppingItems: AnyArray,
    pinnedInspiration: StringArray,
    hostNote: z.string().optional(),
    households: AnyArray.optional(),
    bringBoard: AnyArray.optional(),
    hostUpdates: AnyArray.optional(),
    holidayPackId: z.string().optional(),
    photoDrop: z.any().optional(),
    checkins: AnyRecord.optional(),
    retrospective: z.any().optional(),
    heroImageUrl: z.string().optional(),
  })
  // Allow additional keys we haven't listed (forward-compat), just don't
  // rely on them.
  .passthrough();

const OriginZ = z.object({
  origin: z.enum(["curated", "user"]),
  edited: z.boolean().default(false),
});

const StoredShape = z.object({
  v: z.literal(2),
  samples: z.record(PartySchema).default({}),
  custom: z.array(PartySchema).default([]),
  /**
   * Per-party origin metadata used by the post-signup Import Review.
   * Curated seeds must never appear in the import list, so we track which
   * ids were shipped as samples vs. created by the user, plus whether the
   * user has edited a curated sample in a meaningful way. Missing entries
   * are inferred from the seed set at load time (forward-compat with v2
   * data written before this field existed).
   */
  origins: z.record(OriginZ).default({}),
});

export type PartyOrigin = z.infer<typeof OriginZ>;

export type DemoStoreResult = {
  /** In-memory party list ready to render (seeds + valid custom). */
  parties: Party[];
  /** Origin/edited flag per party id — for the post-signup import review. */
  origins: Record<string, PartyOrigin>;
  /**
   * Present only when we detected corrupt or oversize input; UI may surface
   * a non-blocking warning so the user isn't lied to.
   */
  warning?: "corrupt" | "quota" | "oversized";
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    // Access can throw in private mode.
    const s = window.localStorage;
    return s;
  } catch {
    return null;
  }
}

function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).byteLength;
}

/**
 * Load and validate demo state. Seeds are ALWAYS the fresh code copies,
 * possibly with user overrides layered on top. Custom (user-created) parties
 * are appended after seeds, preserving insertion order.
 */
export function loadDemoState(
  seeds: Party[],
  storage: StorageLike | null = getStorage(),
): DemoStoreResult {
  const seedIds = new Set(seeds.map((s) => s.id));
  const baseOrigins = (extra: Party[] = []): Record<string, PartyOrigin> => {
    const o: Record<string, PartyOrigin> = {};
    for (const s of seeds) o[s.id] = { origin: "curated", edited: false };
    for (const p of extra) o[p.id] = { origin: "user", edited: false };
    return o;
  };
  if (!storage) return { parties: seeds, origins: baseOrigins() };
  let raw: string | null = null;
  try {
    raw = storage.getItem(DEMO_STORAGE_KEY);
  } catch {
    return { parties: seeds, origins: baseOrigins() };
  }
  if (!raw) return { parties: seeds, origins: baseOrigins() };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { parties: seeds, origins: baseOrigins(), warning: "corrupt" };
  }
  const outcome = StoredShape.safeParse(parsed);
  if (!outcome.success) {
    return { parties: seeds, origins: baseOrigins(), warning: "corrupt" };
  }
  const store = outcome.data;

  // Merge samples: seed base, override with stored copy when the id still
  // exists in code. Orphaned overrides (deleted from code) are discarded.
  const merged = seeds.map((s) => {
    const override = store.samples[s.id];
    if (!override) return s;
    // Preserve the seed id explicitly — never let a stored blob rewrite id.
    return { ...(override as unknown as Party), id: s.id };
  });

  // Custom parties: drop any whose id collides with a seed to avoid duplicate
  // ids in the list, and cap total count.
  const custom = (store.custom as unknown as Party[])
    .filter((p) => !seedIds.has(p.id))
    .slice(0, DEMO_MAX_PARTIES);

  // Origins: start from seed-inferred defaults, then overlay stored entries
  // if present. Any stored id that is NOT a curated seed id is forced to
  // origin: "user" (defense against tampering).
  const origins: Record<string, PartyOrigin> = baseOrigins(custom);
  for (const [id, o] of Object.entries(store.origins ?? {})) {
    if (seedIds.has(id)) {
      origins[id] = { origin: "curated", edited: !!o.edited };
    } else {
      origins[id] = { origin: "user", edited: !!o.edited };
    }
  }

  return { parties: [...merged, ...custom], origins };
}

/**
 * Persist demo state. Splits the current in-memory list into seed-overrides
 * and user-created parties, then writes them with a byte-based size cap.
 * Returns a warning code if the write could not complete so callers may
 * surface a truthful non-blocking message.
 */
export function saveDemoState(
  parties: Party[],
  seeds: Party[],
  storage: StorageLike | null = getStorage(),
): { ok: boolean; reason?: "quota" | "oversized" } {
  if (!storage) return { ok: false, reason: "quota" };
  const seedIds = new Set(seeds.map((s) => s.id));
  const samples: Record<string, Party> = {};
  const custom: Party[] = [];
  for (const p of parties) {
    if (seedIds.has(p.id)) samples[p.id] = p;
    else custom.push(p);
  }
  const cappedSamples: Record<string, Party> = {};
  let i = 0;
  for (const [id, p] of Object.entries(samples)) {
    if (i >= DEMO_MAX_SAMPLES) break;
    cappedSamples[id] = p;
    i++;
  }
  const payload = {
    v: 2 as const,
    samples: cappedSamples,
    custom: custom.slice(0, DEMO_MAX_PARTIES),
  };
  const json = JSON.stringify(payload);
  if (utf8Bytes(json) > DEMO_MAX_BYTES) {
    return { ok: false, reason: "oversized" };
  }
  try {
    storage.setItem(DEMO_STORAGE_KEY, json);
    return { ok: true };
  } catch {
    return { ok: false, reason: "quota" };
  }
}

export function clearDemoState(storage: StorageLike | null = getStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(DEMO_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
