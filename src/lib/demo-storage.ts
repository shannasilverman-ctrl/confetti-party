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
    // A date is intentionally optional during Smart Start. Keep the empty
    // string so "decide later" parties survive refresh instead of being
    // mistaken for corrupt storage.
    date: z.string(),
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

const StoredEnvelope = z.object({
  v: z.literal(2),
  samples: z.record(z.unknown()).default({}),
  custom: z.array(z.unknown()).default([]),
});

export type DemoStoreResult = {
  /** In-memory party list ready to render (seeds + valid custom). */
  parties: Party[];
  /**
   * Present only when we detected corrupt or oversize input; UI may surface
   * a non-blocking warning so the user isn't lied to.
   */
  warning?: "corrupt" | "quota" | "oversized";
};

export type DemoStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getStorage(): DemoStorageLike | null {
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
  storage: DemoStorageLike | null = getStorage(),
): DemoStoreResult {
  const seedIds = new Set(seeds.map((s) => s.id));
  if (!storage) return { parties: seeds };
  let raw: string | null = null;
  try {
    raw = storage.getItem(DEMO_STORAGE_KEY);
  } catch {
    return { parties: seeds };
  }
  if (!raw) return { parties: seeds };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { parties: seeds, warning: "corrupt" };
  }
  const outcome = StoredEnvelope.safeParse(parsed);
  if (!outcome.success) {
    return { parties: seeds, warning: "corrupt" };
  }
  const store = outcome.data;
  let droppedInvalidParty = false;

  // Merge samples: seed base, override with stored copy when the id still
  // exists in code. Orphaned overrides (deleted from code) are discarded.
  const merged = seeds.map((s) => {
    const rawOverride = store.samples[s.id];
    if (!rawOverride) return s;
    const parsedOverride = PartySchema.safeParse(rawOverride);
    if (!parsedOverride.success) {
      droppedInvalidParty = true;
      return s;
    }
    // Preserve the seed id explicitly — never let a stored blob rewrite id.
    return { ...(parsedOverride.data as unknown as Party), id: s.id };
  });

  // Custom parties: drop any whose id collides with a seed to avoid duplicate
  // ids in the list, and cap total count.
  const custom = store.custom
    .flatMap((candidate) => {
      const parsedParty = PartySchema.safeParse(candidate);
      if (!parsedParty.success) {
        droppedInvalidParty = true;
        return [];
      }
      return [parsedParty.data as unknown as Party];
    })
    .filter((party) => !seedIds.has(party.id))
    .slice(0, DEMO_MAX_PARTIES);

  return {
    parties: [...merged, ...custom],
    ...(droppedInvalidParty ? { warning: "corrupt" as const } : {}),
  };
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
  storage: DemoStorageLike | null = getStorage(),
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

export type DemoCustomStoreResult = {
  parties: Party[];
  warning?: "corrupt";
};

/**
 * Read only user-created browser parties. Seed samples and their local
 * overrides are deliberately excluded so account claiming can never turn
 * Confetti's examples into a user's cloud data.
 */
export function loadDemoCustomParties(
  storage: DemoStorageLike | null = getStorage(),
): DemoCustomStoreResult {
  if (!storage) return { parties: [] };
  let raw: string | null;
  try {
    raw = storage.getItem(DEMO_STORAGE_KEY);
  } catch {
    return { parties: [] };
  }
  if (!raw) return { parties: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { parties: [], warning: "corrupt" };
  }
  const outcome = StoredEnvelope.safeParse(parsed);
  if (!outcome.success) return { parties: [], warning: "corrupt" };

  let droppedInvalidParty = false;
  const parties = outcome.data.custom
    .flatMap((candidate) => {
      const parsedParty = PartySchema.safeParse(candidate);
      if (!parsedParty.success) {
        droppedInvalidParty = true;
        return [];
      }
      return [parsedParty.data as unknown as Party];
    })
    .slice(0, DEMO_MAX_PARTIES);

  return {
    parties,
    ...(droppedInvalidParty ? { warning: "corrupt" as const } : {}),
  };
}

/**
 * Remove only custom parties that have been acknowledged by the cloud.
 * Unknown/corrupt entries and sample overrides are preserved rather than
 * being collateral damage. A failed cleanup is safe to retry because account
 * claiming preserves ids and verifies existing owned rows first.
 */
export function removeDemoCustomParties(
  ids: Iterable<string>,
  storage: DemoStorageLike | null = getStorage(),
): { ok: boolean; reason?: "corrupt" | "quota" | "oversized" } {
  if (!storage) return { ok: false, reason: "quota" };
  const selected = new Set(ids);
  if (selected.size === 0) return { ok: true };

  let raw: string | null;
  try {
    raw = storage.getItem(DEMO_STORAGE_KEY);
  } catch {
    return { ok: false, reason: "quota" };
  }
  if (!raw) return { ok: true };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "corrupt" };
  }
  const outcome = StoredEnvelope.safeParse(parsed);
  if (!outcome.success) return { ok: false, reason: "corrupt" };

  const next = {
    v: 2 as const,
    samples: outcome.data.samples,
    custom: outcome.data.custom.filter((candidate) => {
      const party = PartySchema.safeParse(candidate);
      return !party.success || !selected.has(party.data.id);
    }),
  };
  const json = JSON.stringify(next);
  if (utf8Bytes(json) > DEMO_MAX_BYTES) return { ok: false, reason: "oversized" };
  try {
    storage.setItem(DEMO_STORAGE_KEY, json);
    return { ok: true };
  } catch {
    return { ok: false, reason: "quota" };
  }
}

export function clearDemoState(storage: DemoStorageLike | null = getStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(DEMO_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
