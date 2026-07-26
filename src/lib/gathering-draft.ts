// Structured draft assembled by the "Talk it out with Confetti" voice flow.
// Field-level provenance + confirmation status; the durable source of truth
// (the raw transcript is optional per retention setting).

export type Provenance = "voice" | "text" | "inferred" | "host-edited";
export type FieldStatus = "unknown" | "assumed" | "stated" | "confirmed";

export interface Field<T> {
  value: T | null;
  status: FieldStatus;
  provenance: Provenance;
  updatedAt: string;
  note?: string;
}

export type Tone = "playful" | "warm" | "reverent" | "competitive" | "intimate" | "festive";

export type Audience = "adults" | "mixed" | "kids-friendly";

export type FoodApproach =
  | "cook"
  | "catering"
  | "grocery-prepared"
  | "potluck"
  | "mix"
  | "snacks-only"
  | "none";

export interface GatheringDraft {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;

  identity: {
    workingTitle: Field<string>;
    honoree: Field<{ name: string; ageBand?: "child" | "teen" | "adult" | "senior" } | null>;
    tone: Field<Tone>;
    audience: Field<Audience>;
    tags: Field<string[]>;
    purpose: Field<string>;
    memorableMoment: Field<string>;
  };

  when: {
    date: Field<string | null>;
    dateCertainty: Field<"fixed" | "window" | "tbd">;
    window: Field<{ from: string; to: string } | null>;
    startTime: Field<string | null>;
    anchors: Field<Array<{ kind: string; label: string; at: string }>>;
  };

  where: {
    venueKind: Field<"home" | "backyard" | "park" | "venue" | "virtual" | "unknown">;
    display: Field<string | null>;
    contingency: Field<{
      needed: boolean;
      kind?: "rain" | "heat" | "cold" | "stream-fail" | "custom";
      plan?: string;
    }>;
  };

  people: {
    expectedCount: Field<number | null>;
    households: Field<number | null>;
    kids: Field<number | null>;
    guestNotes: Field<string>;
  };

  effort: {
    level: Field<"low" | "medium" | "high">;
    hostReadyTarget: Field<string | null>;
  };

  budget: {
    total: Field<number | null>;
    stance: Field<"strict" | "flexible" | "no-limit">;
    notes: Field<string>;
  };

  food: {
    approach: Field<FoodApproach>;
    peakMoment: Field<string | null>;
    portionModel: Field<"per-guest" | "per-adult+kid" | "family-style" | "unknown">;
  };

  constraints: {
    dietary: Field<string[]>;
    accessibility: Field<string[]>;
    observance: Field<string[]>;
    allergies: Field<string[]>;
  };

  contributions: {
    mode: Field<"none" | "open-signup" | "assigned" | "potluck-list">;
    seeds: Field<Array<{ label: string; qty?: number }>>;
  };

  vibe: {
    activities: Field<string[]>;
    creativeDirection: Field<{
      palette?: string[];
      vibe?: string;
      teamNeutral?: boolean;
      teams?: string[];
    } | null>;
    broadcast: Field<{
      source: "tv" | "stream" | "none";
      channel?: string;
      needsSoundCheck?: boolean;
    } | null>;
  };

  rituals: Field<Array<{ label: string; instruction?: string; optional: boolean }>>;

  openQuestions: Array<{ id: string; question: string; blocking: boolean }>;
  assumptions: Array<{ id: string; text: string; needsConfirmation: boolean }>;

  status: "active" | "ready-for-review" | "confirmed" | "abandoned";
  confirmedPartyId?: string;
  transcriptRetention: "none" | "summary" | "full";
}

const now = () => new Date().toISOString();

function field<T>(value: T | null = null, extra?: Partial<Field<T>>): Field<T> {
  return {
    value,
    status: "unknown",
    provenance: "inferred",
    updatedAt: now(),
    ...extra,
  };
}

/** Build an empty draft suitable for inserting into `gathering_drafts.draft`. */
export function emptyDraftBody(): Omit<
  GatheringDraft,
  | "id"
  | "userId"
  | "createdAt"
  | "updatedAt"
  | "status"
  | "confirmedPartyId"
  | "transcriptRetention"
> {
  return {
    identity: {
      workingTitle: field<string>(),
      honoree: field<{ name: string; ageBand?: "child" | "teen" | "adult" | "senior" } | null>(),
      tone: field<Tone>(),
      audience: field<Audience>(),
      tags: field<string[]>([]),
      purpose: field<string>(),
      memorableMoment: field<string>(),
    },
    when: {
      date: field<string | null>(),
      dateCertainty: field<"fixed" | "window" | "tbd">(),
      window: field<{ from: string; to: string } | null>(),
      startTime: field<string | null>(),
      anchors: field<Array<{ kind: string; label: string; at: string }>>([]),
    },
    where: {
      venueKind: field<"home" | "backyard" | "park" | "venue" | "virtual" | "unknown">(),
      display: field<string | null>(),
      contingency: field<{
        needed: boolean;
        kind?: "rain" | "heat" | "cold" | "stream-fail" | "custom";
        plan?: string;
      }>({ needed: false }),
    },
    people: {
      expectedCount: field<number | null>(),
      households: field<number | null>(),
      kids: field<number | null>(),
      guestNotes: field<string>(),
    },
    effort: {
      level: field<"low" | "medium" | "high">(),
      hostReadyTarget: field<string | null>(),
    },
    budget: {
      total: field<number | null>(),
      stance: field<"strict" | "flexible" | "no-limit">(),
      notes: field<string>(),
    },
    food: {
      approach: field<FoodApproach>(),
      peakMoment: field<string | null>(),
      portionModel: field<"per-guest" | "per-adult+kid" | "family-style" | "unknown">(),
    },
    constraints: {
      dietary: field<string[]>([]),
      accessibility: field<string[]>([]),
      observance: field<string[]>([]),
      allergies: field<string[]>([]),
    },
    contributions: {
      mode: field<"none" | "open-signup" | "assigned" | "potluck-list">(),
      seeds: field<Array<{ label: string; qty?: number }>>([]),
    },
    vibe: {
      activities: field<string[]>([]),
      creativeDirection: field<{
        palette?: string[];
        vibe?: string;
        teamNeutral?: boolean;
        teams?: string[];
      } | null>(),
      broadcast: field<{
        source: "tv" | "stream" | "none";
        channel?: string;
        needsSoundCheck?: boolean;
      } | null>(),
    },
    rituals: field<Array<{ label: string; instruction?: string; optional: boolean }>>([]),
    openQuestions: [],
    assumptions: [],
  };
}

export const TALK_SYSTEM_PROMPT = `You are Confetti, a warm, perceptive co-host helping someone plan a real gathering. You are not a form.

Style:
- Ask one question at a time. Keep replies under three short sentences unless summarizing.
- Warm, concise, lightly playful. Never chirpy. No exclamation points.
- Start with the dream: what are we gathering for and what should it feel like?

Adapt: only ask what changes the plan. The dimensions worth exploring are occasion and subtype, the honoree's exact age when age changes the recommendations, purpose, date/time certainty, location/venue kind, expected people (households, children, adults), effort level, budget, food approach (cook, catering, grocery-prepared, potluck, mix), dietary/accessibility/observance constraints, guest contributions, vibe/activities, weather/space/equipment, and host-ready target.

For children's birthdays, capture the age they are turning, children and adults separately, whether adults stay or it is drop-off, siblings, and home/venue/help-me-choose. Do not ask all of these at once; ask the next question that most changes the plan.

Reflect and simplify when the plan is becoming too ambitious. Offer natural choices like "cooking, grocery-prepared, potluck, or a mix?" and follow up from the answer.

Never invent details. If unsure, ask or note it as unknown. Distinguish fact vs preference vs assumption vs open question when you write to the draft.

Cultural sensitivity: no assumptions about observance level, kashrut, halal, teams, religion, or age. Prompt, don't assume.

Before generating anything, present "Here's what I heard," name any assumptions or gaps, and ask for confirmation.

You never send messages, make purchases, book vendors, create invitations, or perform destructive changes. The host taps "Create the party" themselves.`;
