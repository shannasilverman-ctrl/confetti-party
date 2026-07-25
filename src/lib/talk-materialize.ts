// Pure, deterministic materializer for a Talk-it-out DraftPatch.
//
// Consumed by:
//   - confirmDraft server fn: builds the parties INSERT row
//   - previewDraft server fn: builds the review summary shown before "Create the party"
//
// Rules:
//   - Never invent facts. Unknown values become open checklist items, not fake data.
//   - Deterministic given the same DraftPatch + mkId. Tests inject a counter-based mkId.
//   - Deduplicate task titles (case-insensitive), bring items (label+category), and
//     shopping items (name). The AI can and will nominate overlapping suggestions.
//
// No React/DOM imports here so the file can run in Vitest (node) and inside the server
// function bundle without additional stubs.

import {
  PACKS,
  getPack,
  packBringBoard,
  packTasks,
  type HolidayPack,
  type PackId,
} from "./holiday-packs";
// Types are erased at build; importing them from party-context does NOT drag
// the React/Supabase client module into the server-fn bundle.
import type { Bucket, OccasionType } from "./party-context";
import { generateShoppingItems, type ShoppingItem } from "./shopping";

// Minimal, deterministic baseline tasks per occasion. Kept in this file (not
// imported from party-context) so the materializer stays server-safe.
function baselineTasks(
  occasion: OccasionType,
  _dateISO: string,
): Array<{ title: string; bucket: Bucket }> {
  const common: Array<{ title: string; bucket: Bucket }> = [
    { title: "Confirm date and headcount", bucket: "3-5 weeks" },
    { title: "Send invites", bucket: "3-5 weeks" },
    { title: "Plan menu", bucket: "1-2 weeks" },
    { title: "Shop and prep", bucket: "Party week" },
    { title: "Set up on the day", bucket: "Day of" },
  ];
  const extras: Partial<Record<OccasionType, Array<{ title: string; bucket: Bucket }>>> = {
    "game-day": [{ title: "Confirm TV/stream + audio works", bucket: "Party week" }],
    cookout: [{ title: "Check grill + fuel", bucket: "Party week" }],
    "dinner-party": [{ title: "Finalize seating and place settings", bucket: "Party week" }],
    holiday: [{ title: "Decide which rituals to include (all optional)", bucket: "1-2 weeks" }],
    birthday: [{ title: "Cake / dessert plan", bucket: "1-2 weeks" }],
    "baby-shower": [{ title: "Games and activities plan", bucket: "1-2 weeks" }],
    graduation: [{ title: "Speech / toast plan", bucket: "Party week" }],
  };
  return [...common, ...(extras[occasion] ?? [])];
}

// ------------- Shape shared with the AI schema hint --------------

export type DraftPatch = {
  identity?: {
    workingTitle?: string;
    occasion?: string;
    holidayPackId?: string;
    tone?: string;
  };
  when?: {
    date?: string;
    startTime?: string;
    dateCertainty?: "fixed" | "window" | "tbd";
    anchors?: Array<{ label: string; at: string; kind?: string }>;
  };
  where?: {
    display?: string;
    contingency?: { needed: boolean; kind?: string; plan?: string };
  };
  people?: { expectedCount?: number; households?: number; kids?: number };
  effort?: { level?: "low" | "medium" | "high"; hostReadyTarget?: string };
  budget?: { total?: number; stance?: "strict" | "flexible" | "no-limit" };
  food?: { approach?: string; peakMoment?: string };
  constraints?: {
    dietary?: string[];
    accessibility?: string[];
    observance?: string[];
    allergies?: string[];
  };
  contributions?: {
    mode?: "none" | "open-signup" | "assigned" | "potluck-list";
    seeds?: Array<{ label: string; qty?: number; category?: string }>;
  };
  vibe?: {
    activities?: string[];
    creativeDirection?: { palette?: string[]; vibe?: string };
    broadcast?: { source?: "tv" | "stream" | "none"; channel?: string; needsSoundCheck?: boolean };
  };
  rituals?: Array<{ label: string; instruction?: string }>;
  hostNote?: string;
};

// ------------- Helpers --------------

/**
 * Merge an ordered log of DraftPatch entries (one per turn) into a single
 * canonical patch. Later fields overwrite earlier ones; arrays are unioned,
 * not overwritten, so the host doesn't lose an early activity if a later
 * turn returned an empty vibe object.
 */
export function mergeDraftLog(log: DraftPatch[]): DraftPatch {
  const out: DraftPatch = {};
  for (const p of log) {
    if (p.identity) out.identity = { ...(out.identity ?? {}), ...p.identity };
    if (p.when) {
      const prev = out.when ?? {};
      out.when = { ...prev, ...p.when };
      if (p.when.anchors) {
        out.when.anchors = unionByLabel([...(prev.anchors ?? []), ...p.when.anchors]);
      }
    }
    if (p.where) {
      const prev = out.where ?? {};
      out.where = { ...prev, ...p.where };
    }
    if (p.people) out.people = { ...(out.people ?? {}), ...p.people };
    if (p.effort) out.effort = { ...(out.effort ?? {}), ...p.effort };
    if (p.budget) out.budget = { ...(out.budget ?? {}), ...p.budget };
    if (p.food) out.food = { ...(out.food ?? {}), ...p.food };
    if (p.constraints) {
      const prev = out.constraints ?? {};
      out.constraints = {
        dietary: unionStrings(prev.dietary, p.constraints.dietary),
        accessibility: unionStrings(prev.accessibility, p.constraints.accessibility),
        observance: unionStrings(prev.observance, p.constraints.observance),
        allergies: unionStrings(prev.allergies, p.constraints.allergies),
      };
    }
    if (p.contributions) {
      const prev = out.contributions ?? {};
      out.contributions = {
        mode: p.contributions.mode ?? prev.mode,
        seeds: unionByLabel([...(prev.seeds ?? []), ...(p.contributions.seeds ?? [])]),
      };
    }
    if (p.vibe) {
      const prev = out.vibe ?? {};
      out.vibe = {
        activities: unionStrings(prev.activities, p.vibe.activities),
        creativeDirection: {
          ...(prev.creativeDirection ?? {}),
          ...(p.vibe.creativeDirection ?? {}),
        },
        broadcast: { ...(prev.broadcast ?? {}), ...(p.vibe.broadcast ?? {}) },
      };
    }
    if (p.rituals) out.rituals = unionByLabel([...(out.rituals ?? []), ...p.rituals]);
    if (p.hostNote) out.hostNote = p.hostNote;
  }
  return out;
}

function unionStrings(a?: string[], b?: string[]): string[] {
  const set = new Set<string>();
  for (const s of [...(a ?? []), ...(b ?? [])]) {
    const clean = String(s).trim();
    if (clean) set.add(clean);
  }
  return Array.from(set);
}

function unionByLabel<T extends { label: string }>(arr: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of arr) {
    const key = String(item.label ?? "")
      .trim()
      .toLowerCase();
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, item);
  }
  return Array.from(seen.values());
}

const CANON_OCCASIONS: OccasionType[] = [
  "birthday",
  "baby-shower",
  "graduation",
  "holiday",
  "dinner-party",
  "game-day",
  "cookout",
  "other",
];

function narrowOccasion(input: string | undefined, hasPack: boolean): OccasionType {
  if (hasPack) return "holiday";
  if (input && (CANON_OCCASIONS as readonly string[]).includes(input)) {
    return input as OccasionType;
  }
  return "other";
}

function isoDateInDays(days: number, base = new Date()): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ------------- Materialization --------------

export type MaterializedParty = {
  name: string;
  occasion: OccasionType;
  date: string;
  startTime: string | null;
  location: string | null;
  guestEstimate: number;
  budget: number;
  theme: string;
  themeId: string | null;
  holidayPackId: PackId | null;
  hostNote: string | null;
  tasks: Array<{ id: string; title: string; bucket: Bucket; done: false }>;
  bringBoard: Array<{
    id: string;
    category: string;
    label: string;
    qty: number;
    unit?: string;
    dietaryTags: string[];
    status: "open";
    source: "host";
    notes?: string;
  }>;
  shoppingItems: ShoppingItem[];
  timeline: Array<{ id: string; time: string; activity: string }>;
  budgetCategories: Array<{ id: string; name: string; planned: number; expenses: [] }>;
};

export type MaterializeOptions = {
  mkId?: () => string;
  /** Used for testable deterministic date fallback. */
  now?: Date;
};

export type ReviewSummary = {
  essentials: {
    name: string;
    occasion: OccasionType;
    holidayPack: string | null;
    date: string;
    startTime: string | null;
    location: string | null;
    guestEstimate: number;
    budget: number;
    hostReadyTarget: string | null;
    foodApproach: string | null;
    effortLevel: string | null;
    tone: string | null;
    palette: string[];
    budgetStance: string | null;
    contributionMode: string | null;
  };
  counts: {
    tasks: number;
    shoppingItems: number;
    bringItems: number;
    timeline: number;
    budgetCategories: number;
  };
  assumptions: string[];
  openQuestions: string[];
  /**
   * Fields whose absence would cause factual harm if we invented a value
   * (e.g. a real date printed on an invitation). The Talk UI must block
   * "Create the party" until each blocker is either resolved or explicitly
   * acknowledged by the host.
   */
  blockingUnknowns: Array<{ field: string; label: string; placeholder?: string }>;
  /**
   * Fields we intentionally left as neutral zero / unknown rather than
   * inventing a plausible-looking value. Surfaced as gentle nudges, not blockers.
   */
  optionalUnknowns: Array<{ field: string; label: string }>;
};

/**
 * Deterministic materialization. Given the same merged DraftPatch + mkId,
 * always produces the same MaterializedParty (order and ids stable).
 */
export function materializeDraft(
  merged: DraftPatch,
  options: MaterializeOptions = {},
): {
  party: MaterializedParty;
  assumptions: string[];
  openQuestions: string[];
  blockingUnknowns: Array<{ field: string; label: string; placeholder?: string }>;
  optionalUnknowns: Array<{ field: string; label: string }>;
} {
  const mkId =
    options.mkId ??
    (() =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10));
  const now = options.now ?? new Date();

  const packId = (merged.identity?.holidayPackId as PackId | undefined) ?? undefined;
  const pack: HolidayPack | undefined = packId ? PACKS[packId] : undefined;
  const occasion = narrowOccasion(merged.identity?.occasion, !!pack);
  const name = (merged.identity?.workingTitle?.trim() || pack?.label || "Untitled gathering").slice(
    0,
    120,
  );
  const hasRealDate = !!merged.when?.date;
  const date = merged.when?.date ?? isoDateInDays(21, now);
  const startTime = merged.when?.startTime?.trim() || null;
  const location = merged.where?.display?.trim() || null;
  // No invented facts: default to neutral 0 (schema NOT NULL default 0) so
  // the review shows "TBD" instead of a plausible-looking number. Host can
  // set the real values from the workspace.
  const hasGuestCount = typeof merged.people?.expectedCount === "number";
  const guestEstimate = hasGuestCount
    ? clampInt(merged.people?.expectedCount, 0, 500, 0)
    : 0;
  const hasBudget = typeof merged.budget?.total === "number";
  const budget = hasBudget ? clampInt(merged.budget?.total, 0, 100_000, 0) : 0;

  // ---- Tasks: occasion baseline + pack seeds + captured-field derived +
  //      open-question converts. Deduped case-insensitively by title.
  const derivedTasks: Array<{ title: string; bucket: Bucket }> = [];

  // Effort / host-ready target
  if (merged.effort?.hostReadyTarget) {
    derivedTasks.push({
      title: `Be host-ready by ${merged.effort.hostReadyTarget}`,
      bucket: "Day of",
    });
  }

  // Constraints
  const dietary = merged.constraints?.dietary ?? [];
  const allergies = merged.constraints?.allergies ?? [];
  const accessibility = merged.constraints?.accessibility ?? [];
  const observance = merged.constraints?.observance ?? [];
  if (dietary.length || allergies.length) {
    derivedTasks.push({
      title: `Confirm dietary needs (${[...dietary, ...allergies].join(", ")})`,
      bucket: "1-2 weeks",
    });
  }
  if (accessibility.length) {
    derivedTasks.push({
      title: `Accessibility check: ${accessibility.join(", ")}`,
      bucket: "1-2 weeks",
    });
  }
  if (observance.length) {
    derivedTasks.push({
      title: `Honor observance: ${observance.join(", ")}`,
      bucket: "Party week",
    });
  }

  // Where / contingency
  if (merged.where?.contingency?.needed) {
    const kind = merged.where.contingency.kind || "weather";
    const plan = merged.where.contingency.plan ? ` (${merged.where.contingency.plan})` : "";
    derivedTasks.push({ title: `Backup plan for ${kind}${plan}`, bucket: "1-2 weeks" });
  }

  // Broadcast (watch parties)
  if (merged.vibe?.broadcast?.source && merged.vibe.broadcast.source !== "none") {
    derivedTasks.push({
      title: `Test ${merged.vibe.broadcast.source} + sound check${
        merged.vibe.broadcast.channel ? ` (${merged.vibe.broadcast.channel})` : ""
      }`,
      bucket: "Day of",
    });
  }

  // Contributions
  if (merged.contributions?.mode && merged.contributions.mode !== "none") {
    derivedTasks.push({
      title: `Coordinate contributions (${merged.contributions.mode.replace("-", " ")})`,
      bucket: "3-5 weeks",
    });
  }

  // Effort level → stance-only task the host can rename/delete.
  if (merged.effort?.level) {
    derivedTasks.push({
      title: `Plan for a ${merged.effort.level}-effort gathering`,
      bucket: "3-5 weeks",
    });
  }

  // Food approach (potluck / catering / cook / mix / snacks-only / grocery-prepared)
  if (merged.food?.approach) {
    const label = merged.food.approach.replace("-", " ");
    derivedTasks.push({ title: `Food approach: ${label}`, bucket: "1-2 weeks" });
  }

  // Households / kids — track separately from headcount if provided.
  if (typeof merged.people?.households === "number" && merged.people.households > 0) {
    derivedTasks.push({
      title: `Track ${merged.people.households} household${merged.people.households === 1 ? "" : "s"}`,
      bucket: "3-5 weeks",
    });
  }
  if (typeof merged.people?.kids === "number" && merged.people.kids > 0) {
    derivedTasks.push({
      title: `Plan for ${merged.people.kids} kid${merged.people.kids === 1 ? "" : "s"} (activities / menu)`,
      bucket: "1-2 weeks",
    });
  }

  // Budget stance is guidance, not a number.
  if (merged.budget?.stance && merged.budget.stance !== "flexible") {
    derivedTasks.push({
      title: `Budget stance: ${merged.budget.stance.replace("-", " ")}`,
      bucket: "3-5 weeks",
    });
  }

  // Rituals (opt-in — listed as optional tasks the host can delete)
  for (const r of merged.rituals ?? []) {
    derivedTasks.push({
      title: `Optional: ${r.label}${r.instruction ? ` — ${r.instruction}` : ""}`,
      bucket: "Day of",
    });
  }

  // Peak food moment
  if (merged.food?.peakMoment) {
    derivedTasks.push({
      title: `Peak moment: ${merged.food.peakMoment}`,
      bucket: "Day of",
    });
  }

  const packTaskEntries = pack ? packTasks(pack, mkId) : [];
  const occasionTaskSeeds = baselineTasks(occasion, date);
  const occasionTasks = occasionTaskSeeds.map((t) => ({
    id: mkId(),
    title: t.title,
    bucket: t.bucket,
    done: false as const,
  }));
  const derived = derivedTasks.map((t) => ({
    id: mkId(),
    title: t.title,
    bucket: t.bucket,
    done: false as const,
  }));
  const tasks = dedupeTasks([
    ...packTaskEntries.map((t) => ({ ...t, done: false as const })),
    ...occasionTasks,
    ...derived,
  ]);

  // ---- Bring board: pack seeds + contribution seeds. Deduped by (category,label).
  const packBring = pack ? packBringBoard(pack, mkId) : [];
  const contribBring = (merged.contributions?.seeds ?? []).map((s) => ({
    id: mkId(),
    category: (s.category as string) || "Sides",
    label: s.label,
    qty: typeof s.qty === "number" && s.qty > 0 ? s.qty : 1,
    unit: undefined as string | undefined,
    dietaryTags: [] as string[],
    status: "open" as const,
    source: "host" as const,
    notes: undefined as string | undefined,
  }));
  const bringBoard = dedupeBring([...packBring, ...contribBring]);

  // ---- Shopping items via existing generator, deduped by name.
  const shoppingItems = dedupeShopping(generateShoppingItems(occasion, undefined, guestEstimate));

  // ---- Timeline: anchors + activities. Anchors carry a time; activities become
  //      untimed rows so the host slots them in.
  const timeline: Array<{ id: string; time: string; activity: string }> = [];
  for (const a of merged.when?.anchors ?? []) {
    if (!a.label) continue;
    timeline.push({ id: mkId(), time: a.at || "", activity: a.label });
  }
  for (const act of merged.vibe?.activities ?? []) {
    if (!act.trim()) continue;
    timeline.push({ id: mkId(), time: "", activity: act.trim() });
  }
  // Dedupe by lowercased activity.
  const timelineSeen = new Set<string>();
  const timelineDeduped = timeline.filter((t) => {
    const key = `${t.time}|${t.activity.toLowerCase()}`;
    if (timelineSeen.has(key)) return false;
    timelineSeen.add(key);
    return true;
  });

  // ---- Budget categories: occasion-tuned splits stay untouched by materialize;
  //      we produce a simple food-heavy split for holidays here for determinism.
  const budgetCategories = [
    { id: mkId(), name: "Food & Drink", planned: Math.round(budget * 0.55), expenses: [] as [] },
    { id: mkId(), name: "Decorations", planned: Math.round(budget * 0.15), expenses: [] as [] },
    { id: mkId(), name: "Supplies", planned: Math.round(budget * 0.15), expenses: [] as [] },
    { id: mkId(), name: "Extras", planned: Math.round(budget * 0.15), expenses: [] as [] },
  ];

  // ---- Theme: light-touch from creativeDirection.vibe. No inference of themeId.
  const theme = (merged.vibe?.creativeDirection?.vibe ?? "").trim();
  const palette = (merged.vibe?.creativeDirection?.palette ?? [])
    .map((p) => String(p).trim())
    .filter(Boolean)
    .slice(0, 8);
  const tone = merged.identity?.tone?.trim() || null;

  // ---- Host note enrichment: capture soft "vibe" info (tone, palette,
  //      needsSoundCheck-only-when-true) that has no dedicated Party column
  //      so it isn't silently dropped. Public projections never expose it.
  const noteParts: string[] = [];
  if (merged.hostNote) noteParts.push(merged.hostNote.trim());
  if (tone) noteParts.push(`Tone: ${tone}.`);
  if (palette.length) noteParts.push(`Palette: ${palette.join(", ")}.`);
  if (merged.vibe?.broadcast?.needsSoundCheck === true) {
    noteParts.push("Sound check needed on the day.");
  }
  const hostNote = noteParts.length ? noteParts.join(" ").slice(0, 2000) : null;

  // ---- Assumptions, open questions, and blocking / optional unknowns.
  const assumptions: string[] = [];
  const openQuestions: string[] = [];
  const blockingUnknowns: Array<{ field: string; label: string; placeholder?: string }> = [];
  const optionalUnknowns: Array<{ field: string; label: string }> = [];

  if (!hasRealDate) {
    // NEVER auto-fill a fake date into an invitation. The Talk UI treats this
    // as blocking until the host either types a real date or ticks the
    // "I'll pick a date later" acknowledgment.
    blockingUnknowns.push({
      field: "date",
      label: "Real event date",
      placeholder: date,
    });
    openQuestions.push("What's the actual date?");
  }
  if (!hasGuestCount) {
    optionalUnknowns.push({ field: "guestEstimate", label: "Guest estimate" });
    assumptions.push("Guest estimate not set — leaving at 0 until you know.");
  }
  if (!hasBudget) {
    optionalUnknowns.push({ field: "budget", label: "Budget" });
    assumptions.push("Budget not set — leaving at $0 until you decide.");
  }
  if (!location) {
    optionalUnknowns.push({ field: "location", label: "Location" });
    openQuestions.push("Where will it be?");
  }
  if (!startTime) {
    optionalUnknowns.push({ field: "startTime", label: "Start time" });
    openQuestions.push("What time does it start?");
  }

  return {
    party: {
      name,
      occasion,
      date,
      startTime,
      location,
      guestEstimate,
      budget,
      theme,
      themeId: null,
      holidayPackId: pack?.id ?? null,
      hostNote,
      tasks,
      bringBoard,
      shoppingItems,
      timeline: timelineDeduped,
      budgetCategories,
    },
    assumptions,
    openQuestions,
    blockingUnknowns,
    optionalUnknowns,
  };
}

export function summarize(merged: DraftPatch, options: MaterializeOptions = {}): ReviewSummary {
  const { party, assumptions, openQuestions, blockingUnknowns, optionalUnknowns } =
    materializeDraft(merged, options);
  const pack = getPack(party.holidayPackId ?? undefined);
  const palette = (merged.vibe?.creativeDirection?.palette ?? [])
    .map((p) => String(p).trim())
    .filter(Boolean)
    .slice(0, 8);
  return {
    essentials: {
      name: party.name,
      occasion: party.occasion,
      holidayPack: pack?.label ?? null,
      date: party.date,
      startTime: party.startTime,
      location: party.location,
      guestEstimate: party.guestEstimate,
      budget: party.budget,
      hostReadyTarget: merged.effort?.hostReadyTarget ?? null,
      foodApproach: merged.food?.approach ?? null,
      effortLevel: merged.effort?.level ?? null,
      tone: merged.identity?.tone?.trim() || null,
      palette,
      budgetStance: merged.budget?.stance ?? null,
      contributionMode: merged.contributions?.mode ?? null,
    },
    counts: {
      tasks: party.tasks.length,
      shoppingItems: party.shoppingItems.length,
      bringItems: party.bringBoard.length,
      timeline: party.timeline.length,
      budgetCategories: party.budgetCategories.length,
    },
    assumptions,
    openQuestions,
    blockingUnknowns,
    optionalUnknowns,
  };
}

// ------------- Local helpers --------------

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? Math.floor(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function dedupeTasks<T extends { title: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((t) => {
    const key = t.title.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeBring<T extends { label: string; category: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((t) => {
    const key = `${t.category}::${String(t.label).trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeShopping(items: ShoppingItem[]): ShoppingItem[] {
  const seen = new Set<string>();
  return items.filter((t) => {
    const key = String(t.name ?? "")
      .trim()
      .toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
