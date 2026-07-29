/**
 * Strict, local-only persistence for the interactive /sample-invite showroom.
 * This module has no Supabase dependency and never shares a storage key with
 * authenticated or production party data.
 */

import { z } from "zod";

export const SAMPLE_STATE_STORAGE_KEY = "confetti:sample-invite:v2";
const LEGACY_SAMPLE_STATE_STORAGE_KEY = "confetti:sample-invite:v1";
const MAX_BYTES = 32 * 1024;
const MAX_STRING_BYTES = 512;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

const BoundedString = (maxCharacters: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maxCharacters)
    .refine((value) => utf8Bytes(value) <= MAX_STRING_BYTES, "String too large");

const ShortText = BoundedString(80);
const ChoiceSchema = z.enum(["yes", "maybe", "no"]);
const TagSchema = BoundedString(60);
const SafeIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/)
  .refine((value) => !DANGEROUS_KEYS.has(value), "Reserved identifier");

const SampleRsvpShape = {
  name: ShortText,
  household: ShortText.optional(),
  choice: ChoiceSchema,
  adults: z.number().int().min(0).max(20),
  kids: z.number().int().min(0).max(20),
  dietary: z.array(TagSchema).max(12),
  allergens: z.array(TagSchema).max(12),
  at: z
    .string()
    .max(40)
    .refine((value) => Number.isFinite(Date.parse(value)), "Invalid timestamp"),
};

type SampleRsvpRefinement = {
  choice: "yes" | "maybe" | "no";
  adults: number;
  kids: number;
  dietary: string[];
  allergens: string[];
  accessNotes?: string;
};

function refineSampleRsvp(entry: SampleRsvpRefinement, context: z.RefinementCtx): void {
  if (entry.choice === "yes" && entry.adults + entry.kids < 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Yes requires an attendee" });
  }
  if (entry.choice !== "yes" && (entry.adults !== 0 || entry.kids !== 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Non-yes counts must be zero" });
  }
  if (entry.choice === "no" && entry.accessNotes) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "No response cannot keep notes" });
  }
  if (new Set(entry.dietary).size !== entry.dietary.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate dietary tag" });
  }
  if (new Set(entry.allergens).size !== entry.allergens.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate allergen" });
  }
}

const LegacySampleRsvpSchema = z.object(SampleRsvpShape).strict().superRefine(refineSampleRsvp);

const SampleRsvpSchema = z
  .object({
    ...SampleRsvpShape,
    accessNotes: BoundedString(200).optional(),
  })
  .strict()
  .superRefine(refineSampleRsvp);

const SampleBringItemSchema = z
  .object({
    id: SafeIdSchema,
    category: BoundedString(40),
    label: BoundedString(120),
    qty: z.number().int().min(1).max(999),
    status: z.enum(["open", "claimed"]),
    claimedByMe: z.boolean().optional(),
  })
  .strict()
  .refine((item) => !item.claimedByMe || item.status === "claimed", {
    message: "Only a claimed item can belong to this sample guest",
  });

const SampleStateFields = {
  bring: z.array(SampleBringItemSchema).max(50),
  baseline: z
    .object({
      yes: z.number().int().min(0).max(10_000),
      maybe: z.number().int().min(0).max(10_000),
    })
    .strict(),
};

const uniqueBringIds = (state: { bring: SampleBringItem[] }) =>
  new Set(state.bring.map((item) => item.id)).size === state.bring.length;

const LegacySampleStateSchema = z
  .object({
    v: z.literal(1),
    rsvp: LegacySampleRsvpSchema.nullable(),
    ...SampleStateFields,
  })
  .strict()
  .refine(uniqueBringIds, {
    message: "Bring item IDs must be unique",
  });

const SampleStateSchema = z
  .object({
    v: z.literal(2),
    rsvp: SampleRsvpSchema.nullable(),
    ...SampleStateFields,
  })
  .strict()
  .refine(uniqueBringIds, {
    message: "Bring item IDs must be unique",
  });

export type SampleRSVP = z.infer<typeof ChoiceSchema>;
export type SampleBringItem = z.infer<typeof SampleBringItemSchema>;
export type SampleRsvpEntry = z.infer<typeof SampleRsvpSchema>;
export type SampleState = z.infer<typeof SampleStateSchema>;

const DEFAULT_BRING: SampleBringItem[] = [
  { id: "b-app", category: "Sides", label: "Antipasti platter", qty: 1, status: "open" },
  { id: "b-pie", category: "Dessert", label: "Tiramisu", qty: 1, status: "claimed" },
  { id: "b-wine", category: "Drinks", label: "Bottle of Chianti", qty: 3, status: "open" },
  { id: "b-ice", category: "Drinks", label: "Bag of ice", qty: 2, status: "open" },
];

export function defaultSampleState(): SampleState {
  return {
    v: 2,
    rsvp: null,
    bring: DEFAULT_BRING.map((item) => ({ ...item })),
    baseline: { yes: 14, maybe: 3 },
  };
}

type SampleStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): SampleStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function removeInvalid(storage: SampleStorage, key = SAMPLE_STATE_STORAGE_KEY): void {
  try {
    storage.removeItem(key);
  } catch {
    // A blocked store is equivalent to a fresh, non-persistent sample.
  }
}

export type SampleStateCorruption = "oversize" | "invalid" | "parse";
export type LoadSampleStateResult = {
  state: SampleState;
  corruption?: SampleStateCorruption;
};

function parseStoredState<T>(
  raw: string,
  schema: z.ZodType<T>,
): { data: T } | { corruption: SampleStateCorruption } {
  if (utf8Bytes(raw) > MAX_BYTES) return { corruption: "oversize" };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { corruption: "parse" };
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? { data: parsed.data } : { corruption: "invalid" };
}

export function loadSampleState(
  storage: SampleStorage | null = browserStorage(),
): LoadSampleStateResult {
  if (!storage) return { state: defaultSampleState() };
  let raw: string | null;
  let legacyRaw: string | null;
  try {
    raw = storage.getItem(SAMPLE_STATE_STORAGE_KEY);
    legacyRaw = raw ? null : storage.getItem(LEGACY_SAMPLE_STATE_STORAGE_KEY);
  } catch {
    return { state: defaultSampleState() };
  }
  if (raw) {
    const parsed = parseStoredState(raw, SampleStateSchema);
    if ("corruption" in parsed) {
      removeInvalid(storage);
      return { state: defaultSampleState(), corruption: parsed.corruption };
    }
    return { state: parsed.data };
  }
  if (!legacyRaw) return { state: defaultSampleState() };

  const legacy = parseStoredState(legacyRaw, LegacySampleStateSchema);
  if ("corruption" in legacy) {
    removeInvalid(storage, LEGACY_SAMPLE_STATE_STORAGE_KEY);
    return { state: defaultSampleState(), corruption: legacy.corruption };
  }
  const migrated: SampleState = {
    ...legacy.data,
    v: 2,
    rsvp: legacy.data.rsvp ? { ...legacy.data.rsvp } : null,
  };
  if (saveSampleState(migrated, storage).ok) {
    removeInvalid(storage, LEGACY_SAMPLE_STATE_STORAGE_KEY);
  }
  return { state: migrated };
}

export function saveSampleState(
  state: SampleState,
  storage: SampleStorage | null = browserStorage(),
): { ok: true } | { ok: false; reason: "unavailable" | "invalid" | "oversized" | "quota" } {
  const validated = SampleStateSchema.safeParse(state);
  if (!validated.success) return { ok: false, reason: "invalid" };
  if (!storage) return { ok: false, reason: "unavailable" };
  const payload = JSON.stringify(validated.data);
  if (utf8Bytes(payload) > MAX_BYTES) return { ok: false, reason: "oversized" };
  try {
    storage.setItem(SAMPLE_STATE_STORAGE_KEY, payload);
    return { ok: true };
  } catch {
    return { ok: false, reason: "quota" };
  }
}

export function resetSampleState(storage: SampleStorage | null = browserStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(SAMPLE_STATE_STORAGE_KEY);
    storage.removeItem(LEGACY_SAMPLE_STATE_STORAGE_KEY);
  } catch {
    // The UI still resets its in-memory state.
  }
}

export function derivedCounts(state: SampleState): { yes: number; maybe: number } {
  const yesPeople =
    state.rsvp?.choice === "yes" ? Math.max(1, state.rsvp.adults + state.rsvp.kids) : 0;
  return {
    yes: state.baseline.yes + yesPeople,
    maybe: state.baseline.maybe + (state.rsvp?.choice === "maybe" ? 1 : 0),
  };
}
