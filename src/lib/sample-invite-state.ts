/**
 * Strict, local-only persistence for the interactive /sample-invite showroom.
 * This module has no Supabase dependency and never shares a storage key with
 * authenticated or production party data.
 */

import { z } from "zod";

export const SAMPLE_STATE_STORAGE_KEY = "confetti:sample-invite:v1";
const MAX_BYTES = 32 * 1024;

const ShortText = z.string().trim().min(1).max(80);
const ChoiceSchema = z.enum(["yes", "maybe", "no"]);
const TagSchema = z.string().trim().min(1).max(60);

const SampleRsvpSchema = z
  .object({
    name: ShortText,
    choice: ChoiceSchema,
    adults: z.number().int().min(0).max(20),
    kids: z.number().int().min(0).max(20),
    dietary: z.array(TagSchema).max(12),
    allergens: z.array(TagSchema).max(12),
    at: z
      .string()
      .max(40)
      .refine((value) => Number.isFinite(Date.parse(value)), "Invalid timestamp"),
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.choice === "yes" && entry.adults + entry.kids < 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Yes requires an attendee" });
    }
    if (entry.choice !== "yes" && (entry.adults !== 0 || entry.kids !== 0)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Non-yes counts must be zero" });
    }
  });

const SampleBringItemSchema = z
  .object({
    id: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-zA-Z0-9_-]+$/)
      .refine((value) => !["__proto__", "prototype", "constructor"].includes(value)),
    category: z.string().trim().min(1).max(40),
    label: z.string().trim().min(1).max(120),
    qty: z.number().int().min(1).max(999),
    status: z.enum(["open", "claimed"]),
    claimedByMe: z.boolean().optional(),
  })
  .strict()
  .refine((item) => !item.claimedByMe || item.status === "claimed", {
    message: "Only a claimed item can belong to this sample guest",
  });

const SampleStateSchema = z
  .object({
    v: z.literal(1),
    rsvp: SampleRsvpSchema.nullable(),
    bring: z.array(SampleBringItemSchema).max(50),
    baseline: z
      .object({
        yes: z.number().int().min(0).max(10_000),
        maybe: z.number().int().min(0).max(10_000),
      })
      .strict(),
  })
  .strict()
  .refine((state) => new Set(state.bring.map((item) => item.id)).size === state.bring.length, {
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
    v: 1,
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

function bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

function removeInvalid(storage: SampleStorage): void {
  try {
    storage.removeItem(SAMPLE_STATE_STORAGE_KEY);
  } catch {
    // A blocked store is equivalent to a fresh, non-persistent sample.
  }
}

export function loadSampleState(storage: SampleStorage | null = browserStorage()): SampleState {
  if (!storage) return defaultSampleState();
  try {
    const raw = storage.getItem(SAMPLE_STATE_STORAGE_KEY);
    if (!raw) return defaultSampleState();
    if (bytes(raw) > MAX_BYTES) {
      removeInvalid(storage);
      return defaultSampleState();
    }
    const parsed = SampleStateSchema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success) {
      removeInvalid(storage);
      return defaultSampleState();
    }
    return parsed.data;
  } catch {
    removeInvalid(storage);
    return defaultSampleState();
  }
}

export function saveSampleState(
  state: SampleState,
  storage: SampleStorage | null = browserStorage(),
): { ok: true } | { ok: false; reason: "unavailable" | "invalid" | "oversized" | "quota" } {
  const validated = SampleStateSchema.safeParse(state);
  if (!validated.success) return { ok: false, reason: "invalid" };
  if (!storage) return { ok: false, reason: "unavailable" };
  const payload = JSON.stringify(validated.data);
  if (bytes(payload) > MAX_BYTES) return { ok: false, reason: "oversized" };
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
