// Runtime validation schemas for anything the AI produces.
//
// TypeScript types are erased at compile time, so we cannot rely on the
// DraftPatch/openQuestions/assumptions type annotations to reject garbage
// JSON that the text-planning model returns. These Zod schemas enforce
// per-field caps and reject/drop unknown or oversized values BEFORE they
// reach persistence or the materializer.
//
// Design rules:
//   - Every string has a max length.
//   - Every array has a max length.
//   - `.catch(undefined)` on optional leaf fields drops individual bad
//     values without failing the whole patch (partial payloads are still
//     useful).
//   - No `.passthrough()` — unknown keys are stripped.

import { z } from "zod";
import type { DraftPatch } from "./talk-materialize";

const SHORT = z.string().trim().min(1).max(200);
const MED = z.string().trim().min(1).max(1000);
const LABEL = z.string().trim().min(1).max(80);

export const StringListZ = z.array(SHORT).max(20).default([]);

const IdentityZ = z
  .object({
    workingTitle: SHORT.optional(),
    occasion: z
      .enum([
        "birthday",
        "baby-shower",
        "graduation",
        "holiday",
        "dinner-party",
        "game-day",
        "cookout",
        "other",
      ])
      .optional(),
    holidayPackId: SHORT.optional(),
    tone: SHORT.optional(),
    honoreeAge: z.number().int().min(1).max(120).optional(),
  })
  .strict();

const WhenZ = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
      .optional(),
    startTime: SHORT.optional(),
    dateCertainty: z.enum(["fixed", "window", "tbd"]).optional(),
    anchors: z
      .array(
        z
          .object({
            label: LABEL,
            at: z.string().trim().max(40).optional().default(""),
            kind: z.string().trim().max(40).optional(),
          })
          .strict(),
      )
      .max(20)
      .optional(),
  })
  .strict();

const WhereZ = z
  .object({
    display: SHORT.optional(),
    venueKind: z.enum(["home", "backyard", "park", "venue", "virtual", "unknown"]).optional(),
    contingency: z
      .object({
        needed: z.boolean(),
        kind: z.string().trim().max(40).optional(),
        plan: MED.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const PeopleZ = z
  .object({
    expectedCount: z.number().int().min(0).max(2000).optional(),
    households: z.number().int().min(0).max(500).optional(),
    kids: z.number().int().min(0).max(500).optional(),
    adults: z.number().int().min(0).max(500).optional(),
  })
  .strict();

const EffortZ = z
  .object({
    level: z.enum(["low", "medium", "high"]).optional(),
    hostReadyTarget: SHORT.optional(),
  })
  .strict();

const BudgetZ = z
  .object({
    total: z.number().min(0).max(1_000_000).optional(),
    stance: z.enum(["strict", "flexible", "no-limit"]).optional(),
  })
  .strict();

const FoodZ = z
  .object({
    approach: z
      .enum(["cook", "catering", "grocery-prepared", "potluck", "mix", "snacks-only"])
      .optional(),
    peakMoment: SHORT.optional(),
    portionModel: z.enum(["per-guest", "per-adult+kid", "family-style", "unknown"]).optional(),
  })
  .strict();

const ConstraintsZ = z
  .object({
    dietary: StringListZ.optional(),
    accessibility: StringListZ.optional(),
    observance: StringListZ.optional(),
    allergies: StringListZ.optional(),
  })
  .strict();

const ContributionsZ = z
  .object({
    mode: z.enum(["none", "open-signup", "assigned", "potluck-list"]).optional(),
    seeds: z
      .array(
        z
          .object({
            label: LABEL,
            qty: z.number().min(0).max(999).optional(),
            category: z.string().trim().max(40).optional(),
          })
          .strict(),
      )
      .max(50)
      .optional(),
  })
  .strict();

const VibeZ = z
  .object({
    activities: StringListZ.optional(),
    creativeDirection: z
      .object({
        palette: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
        vibe: SHORT.optional(),
      })
      .strict()
      .optional(),
    broadcast: z
      .object({
        source: z.enum(["tv", "stream", "none"]).optional(),
        channel: z.string().trim().max(80).optional(),
        needsSoundCheck: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const DraftPatchZ = z
  .object({
    identity: IdentityZ.optional(),
    when: WhenZ.optional(),
    where: WhereZ.optional(),
    people: PeopleZ.optional(),
    effort: EffortZ.optional(),
    budget: BudgetZ.optional(),
    food: FoodZ.optional(),
    constraints: ConstraintsZ.optional(),
    contributions: ContributionsZ.optional(),
    vibe: VibeZ.optional(),
    rituals: z
      .array(
        z
          .object({
            label: LABEL,
            instruction: MED.optional(),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    hostNote: z.string().trim().max(2000).optional(),
  })
  .strict();

/**
 * Best-effort validate an AI-produced patch. Never throws to the caller —
 * returns a clean patch (possibly empty) plus a redacted issue log the
 * server can console.warn without leaking user content.
 */
export function safeParseDraftPatch(input: unknown): { patch: DraftPatch; issues: string[] } {
  const res = DraftPatchZ.safeParse(input);
  if (res.success) return { patch: res.data as DraftPatch, issues: [] };
  // Redact: keep paths + codes only.
  const issues = res.error.issues
    .slice(0, 10)
    .map((i) => `${i.path.join(".") || "<root>"}:${i.code}`);
  return { patch: {}, issues };
}

/**
 * Sanitize a free-form list of strings to at most `cap` deduped, trimmed
 * strings of at most `maxLen` chars each. Returns [] on non-arrays.
 */
export function sanitizeStringList(input: unknown, cap = 8, maxLen = 200): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const clean = raw.trim().slice(0, maxLen);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= cap) break;
  }
  return out;
}
