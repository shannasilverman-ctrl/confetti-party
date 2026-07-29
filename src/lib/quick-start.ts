import type { HolidayStarterId } from "./holiday-packs";
import type { OccasionType } from "./party-context";
import type { HostEffort, PartyFormat } from "./party-intelligence";
import { analyzePlanningIdea } from "./talk-demo";
import { mergeDraftLog, type DraftPatch } from "./talk-materialize";

export type QuickStartInput = {
  idea: string;
  occasion: OccasionType | null;
  date: string;
  startTime: string;
  location: string;
  guestEstimate: string;
  budget: string;
  holidayStarter: HolidayStarterId | null;
  honoreeAge: string;
  expectedKids: string;
  expectedAdults: string;
  effort: HostEffort;
  partyFormat: PartyFormat;
};

export type QuickStartResolution = {
  patch: DraftPatch;
  capturedFacts: string[];
};

function optionalCount(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function titleFromIdea(idea: string, patch: DraftPatch): string {
  const clean = idea.trim().replace(/\s+/g, " ");
  const looksLikeTitle =
    clean.length <= 60 &&
    clean.split(" ").length <= 9 &&
    !/[.!?]/.test(clean) &&
    !/\b(?:in \d+ (?:days?|weeks?)|for (?:about )?\d+|with \d+|budget(?: of| is)? \$?\d+)\b/i.test(
      clean,
    );
  if (looksLikeTitle) return clean;
  return patch.identity?.workingTitle?.trim() || "Gathering";
}

/**
 * Resolves quick-start input without a network request. Facts extracted from
 * the idea are only a starting point; dedicated fields always win.
 */
export function resolveQuickStart(input: QuickStartInput, options: { now?: Date } = {}) {
  const analysis = analyzePlanningIdea(input.idea, options);
  const extracted = analysis.draftPatch;
  const explicit: DraftPatch = {
    identity: {
      ...extracted.identity,
      workingTitle: titleFromIdea(input.idea, extracted),
      ...(input.occasion ? { occasion: input.occasion } : {}),
      ...(input.occasion === "holiday" && input.holidayStarter
        ? { holidayPackId: input.holidayStarter }
        : {}),
      ...(input.occasion === "birthday" && Number(input.honoreeAge) > 0
        ? { honoreeAge: Number(input.honoreeAge) }
        : {}),
    },
  };

  if (input.date || input.startTime.trim()) {
    explicit.when = {
      ...(input.date ? { date: input.date, dateCertainty: "fixed" as const } : {}),
      ...(input.startTime.trim() ? { startTime: input.startTime.trim() } : {}),
    };
  }
  if (input.location.trim()) {
    explicit.where = { ...(extracted.where ?? {}), display: input.location.trim() };
  }

  const explicitGuests = optionalCount(input.guestEstimate);
  const kids = optionalCount(input.expectedKids);
  const adults = optionalCount(input.expectedAdults);
  const audienceTouched = kids != null || adults != null;
  if (explicitGuests != null || audienceTouched) {
    explicit.people = {
      ...(extracted.people ?? {}),
      expectedCount: explicitGuests ?? (kids ?? 0) + (adults ?? 0),
      ...(kids != null ? { kids } : {}),
      ...(adults != null ? { adults } : {}),
    };
  }

  const explicitBudget = optionalCount(input.budget);
  if (explicitBudget != null) explicit.budget = { total: explicitBudget, stance: "flexible" };

  if (input.occasion) {
    explicit.effort = {
      level: input.effort === "easy" ? "low" : input.effort === "all-out" ? "high" : "medium",
    };
    if (input.partyFormat === "home") {
      explicit.where = { ...(extracted.where ?? {}), ...(explicit.where ?? {}), venueKind: "home" };
    } else if (input.partyFormat === "venue") {
      explicit.where = {
        ...(extracted.where ?? {}),
        ...(explicit.where ?? {}),
        venueKind: "venue",
      };
    }
  }

  return {
    patch: mergeDraftLog([extracted, explicit]),
    capturedFacts: analysis.capturedFacts,
  } satisfies QuickStartResolution;
}
