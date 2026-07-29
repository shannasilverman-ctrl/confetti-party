import type { Guest, Party } from "./party-context";
import { birthdayLifeStage } from "./party-intelligence";

export type AttendanceBreakdown = {
  adults: number;
  kids: number;
  total: number;
};

export type GuestPlanImpact = {
  id: "headcount" | "allergens" | "dietary" | "access" | "arrival" | "supervision";
  title: string;
  summary: string;
  reason: string;
  action: "guests" | "shopping" | "timeline" | "checklist";
  actionLabel: string;
  priority: "action" | "watch";
  applied: boolean;
};

export type GuestCountSuggestion = AttendanceBreakdown & {
  rationale: string;
};

export type GuestPlanSnapshot = {
  confirmed: AttendanceBreakdown;
  maybe: AttendanceBreakdown;
  pending: AttendanceBreakdown;
  planned: AttendanceBreakdown | null;
  likely: AttendanceBreakdown;
  allergens: string[];
  dietary: string[];
  laterArrivals: number;
  accessNotes: number;
  countSuggestion: GuestCountSuggestion | null;
  impacts: GuestPlanImpact[];
};

/**
 * Deterministic bridge between RSVP data and the host's actual plan.
 *
 * It deliberately does not diagnose allergies, interpret private notes, or
 * silently rewrite the party. It summarizes known replies, identifies the
 * downstream planning consequence, and offers one explicit host action.
 */
export function guestPlanSnapshot(party: Party): GuestPlanSnapshot | null {
  const activeGuests = party.guests.filter((guest) => guest.rsvp !== "no");
  const confirmed = countByKind(party.guests.filter((guest) => guest.rsvp === "yes"));
  const maybe = countByKind(party.guests.filter((guest) => guest.rsvp === "maybe"));
  const pending = countByKind(party.guests.filter((guest) => guest.rsvp === "invited"));
  const likely = addCounts(confirmed, maybe);
  const planned = plannedCounts(party);
  const allergens = uniqueTags(activeGuests.flatMap((guest) => guest.allergens ?? []));
  const dietary = uniqueTags(activeGuests.flatMap((guest) => guest.dietary ?? []));
  const laterArrivals = activeGuests.filter(
    (guest) => guest.responseDetails?.arrivalPlan === "arriving-later",
  ).length;
  const accessNotes = activeGuests.filter((guest) =>
    Boolean(guest.responseDetails?.accessNotes?.trim()),
  ).length;
  const hasReply = party.guests.some((guest) => guest.rsvp !== "invited");
  const hasPlanChangingAnswer =
    allergens.length > 0 || dietary.length > 0 || laterArrivals > 0 || accessNotes > 0;

  if (!hasReply && !hasPlanChangingAnswer) return null;

  const countSuggestion = suggestCounts(planned, likely, pending);
  const impacts: GuestPlanImpact[] = [
    headcountImpact(planned, confirmed, maybe, pending, countSuggestion),
  ];

  if (allergens.length > 0) {
    const applied = hasAppliedImpact(party, "allergens");
    impacts.push({
      id: "allergens",
      title: `${allergens.length} allergen ${allergens.length === 1 ? "signal" : "signals"} to plan around`,
      summary: humanList(allergens),
      reason:
        "Confirm ingredients, preparation boundaries, and labels with the guest and food provider before ordering.",
      action: "checklist",
      actionLabel: applied ? "Open food check" : "Add food check",
      priority: "action",
      applied,
    });
  }

  if (dietary.length > 0) {
    const applied = hasAppliedImpact(party, "dietary");
    impacts.push({
      id: "dietary",
      title: `${dietary.length} dietary ${dietary.length === 1 ? "need" : "needs"} in the current replies`,
      summary: humanList(dietary),
      reason:
        "Make sure each attending guest has a real main option, not only a side dish or an assumption.",
      action: "checklist",
      actionLabel: applied ? "Open menu check" : "Add menu check",
      priority: "action",
      applied,
    });
  }

  if (accessNotes > 0) {
    const applied = hasAppliedImpact(party, "access");
    impacts.push({
      id: "access",
      title: `${accessNotes} private comfort/access ${accessNotes === 1 ? "note" : "notes"} to review`,
      summary: "The notes stay in the host guest list.",
      reason:
        "Review the guest's own words before finalizing seating, sound, access, or participation details.",
      action: "checklist",
      actionLabel: applied ? "Open private review" : "Add private review",
      priority: "action",
      applied,
    });
  }

  if (laterArrivals > 0) {
    const applied = hasAppliedImpact(party, "arrival");
    impacts.push({
      id: "arrival",
      title: `${laterArrivals} ${laterArrivals === 1 ? "guest expects" : "guests expect"} to arrive later`,
      summary: "Protect a flexible welcome, first bite, or activity transition.",
      reason:
        "A late-arrival path keeps one delayed group from interrupting the shared moment or holding the meal.",
      action: "timeline",
      actionLabel: applied ? "Open arrival plan" : "Add arrival plan",
      priority: "watch",
      applied,
    });
  }

  if (isChildBirthday(party) && confirmed.kids > 0 && confirmed.adults === 0) {
    const applied = hasAppliedImpact(party, "supervision");
    impacts.push({
      id: "supervision",
      title: "Confirm the grown-up and pickup plan",
      summary: `${confirmed.kids} ${confirmed.kids === 1 ? "child is" : "children are"} confirmed and no guest adults are marked as staying.`,
      reason:
        "The host may already have helpers; Confetti is flagging the handoff so supervision and pickup do not live only in someone's head.",
      action: "checklist",
      actionLabel: applied ? "Open responsibility" : "Add responsibility",
      priority: "action",
      applied,
    });
  }

  return {
    confirmed,
    maybe,
    pending,
    planned,
    likely,
    allergens,
    dietary,
    laterArrivals,
    accessNotes,
    countSuggestion,
    impacts,
  };
}

function headcountImpact(
  planned: AttendanceBreakdown | null,
  confirmed: AttendanceBreakdown,
  maybe: AttendanceBreakdown,
  pending: AttendanceBreakdown,
  suggestion: GuestCountSuggestion | null,
): GuestPlanImpact {
  const replySummary = `${confirmed.total} confirmed · ${maybe.total} maybe · ${pending.total} waiting`;
  if (suggestion) {
    return {
      id: "headcount",
      title: `Plan quantities for ${suggestion.total} current yes/maybe ${
        suggestion.total === 1 ? "reply" : "replies"
      }`,
      summary: replySummary,
      reason: suggestion.rationale,
      action: "guests",
      actionLabel: "Use current replies",
      priority: "action",
      applied: false,
    };
  }
  return {
    id: "headcount",
    title:
      pending.total > 0 && planned
        ? `Keep the ${planned.total}-person estimate while replies are open`
        : "Current replies match the working headcount",
    summary: replySummary,
    reason:
      pending.total > 0
        ? "Confetti will not lower quantities while invited guests can still respond."
        : "No quantity adjustment is needed from the current RSVP status.",
    action: "guests",
    actionLabel: "Review replies",
    priority: "watch",
    applied: false,
  };
}

export type MaterializedGuestImpact = {
  party: Party;
  created: boolean;
  destination: GuestPlanImpact["action"];
};

/**
 * Turns one visible consequence into durable, editable host work. Repeated
 * clicks are idempotent, and private note contents never leave the guest list.
 */
export function materializeGuestImpact(
  party: Party,
  impact: GuestPlanImpact,
  idFactory: () => string,
): MaterializedGuestImpact {
  if (impact.id === "headcount" || impact.applied || hasAppliedImpact(party, impact.id)) {
    return { party, created: false, destination: impact.action };
  }
  const snapshot = guestPlanSnapshot(party);
  if (!snapshot) return { party, created: false, destination: impact.action };

  if (impact.id === "arrival") {
    return {
      party: {
        ...party,
        timeline: [
          ...party.timeline,
          {
            id: idFactory(),
            time: "Arrival window",
            activity: `Flexible welcome and first-plate plan for ${snapshot.laterArrivals} ${
              snapshot.laterArrivals === 1 ? "later guest" : "later guests"
            }`,
            source: "guest-impact",
            guestImpactId: "arrival",
          },
        ],
      },
      created: true,
      destination: "timeline",
    };
  }

  const task = taskForImpact(impact.id, snapshot, idFactory());
  if (!task) return { party, created: false, destination: impact.action };
  return {
    party: { ...party, tasks: [...party.tasks, task] },
    created: true,
    destination: "checklist",
  };
}

function hasAppliedImpact(party: Party, id: Exclude<GuestPlanImpact["id"], "headcount">): boolean {
  if (id === "arrival") {
    return party.timeline.some(
      (item) => item.source === "guest-impact" && item.guestImpactId === "arrival",
    );
  }
  return party.tasks.some((task) => task.source === "guest-impact" && task.guestImpactId === id);
}

function taskForImpact(
  id: Exclude<GuestPlanImpact["id"], "headcount" | "arrival">,
  snapshot: GuestPlanSnapshot,
  taskId: string,
): Party["tasks"][number] | null {
  if (id === "allergens") {
    return {
      id: taskId,
      title: "Confirm the allergen-safe food plan",
      bucket: "Party week",
      done: false,
      reason: `Review ${humanList(snapshot.allergens)} with the affected guests and food provider; confirm ingredients, preparation boundaries, and labels.`,
      action: "shopping",
      guidanceSource: "curated",
      source: "guest-impact",
      guestImpactId: "allergens",
    };
  }
  if (id === "dietary") {
    return {
      id: taskId,
      title: "Confirm complete dietary options",
      bucket: "Party week",
      done: false,
      reason: `Make sure ${humanList(snapshot.dietary)} guests have a real main option, not only sides or an assumption.`,
      action: "shopping",
      guidanceSource: "curated",
      source: "guest-impact",
      guestImpactId: "dietary",
    };
  }
  if (id === "access") {
    return {
      id: taskId,
      title: "Review private comfort and access notes",
      bucket: "1-2 weeks",
      done: false,
      reason: `Review ${snapshot.accessNotes} private ${
        snapshot.accessNotes === 1 ? "note" : "notes"
      } in the guest list before finalizing seating, sound, access, or participation.`,
      action: "guests",
      guidanceSource: "curated",
      source: "guest-impact",
      guestImpactId: "access",
    };
  }
  if (id === "supervision") {
    return {
      id: taskId,
      title: "Assign supervision, handoff, and pickup",
      bucket: "Party week",
      done: false,
      reason:
        "Name the host helper covering active supervision, guest handoff, and pickup so the responsibility is visible.",
      action: "guests",
      guidanceSource: "curated",
      source: "guest-impact",
      guestImpactId: "supervision",
    };
  }
  return null;
}

function suggestCounts(
  planned: AttendanceBreakdown | null,
  likely: AttendanceBreakdown,
  pending: AttendanceBreakdown,
): GuestCountSuggestion | null {
  if (likely.total < 1) return null;
  if (!planned) {
    return {
      ...likely,
      rationale:
        "This creates an editable quantity baseline from known yes/maybe replies; pending guests remain visible.",
    };
  }
  if (planned.adults === likely.adults && planned.kids === likely.kids) return null;
  const exceedsPlan = likely.adults > planned.adults || likely.kids > planned.kids;
  if (exceedsPlan) {
    return {
      ...likely,
      rationale:
        "Current yes/maybe replies exceed at least one planned audience count, so the existing quantities may run short.",
    };
  }
  if (pending.total === 0) {
    return {
      ...likely,
      rationale:
        "Everyone has replied, so the working quantities can be aligned to the current yes/maybe mix.",
    };
  }
  return null;
}

function plannedCounts(party: Party): AttendanceBreakdown | null {
  const adults = party.planningProfile?.expectedAdults;
  const kids = party.planningProfile?.expectedKids;
  if (adults == null && kids == null) return null;
  const safeAdults = safeCount(adults);
  const safeKids = safeCount(kids);
  return { adults: safeAdults, kids: safeKids, total: safeAdults + safeKids };
}

function countByKind(guests: Guest[]): AttendanceBreakdown {
  const adults = guests.filter((guest) => guest.kind === "adult").length;
  const kids = guests.filter((guest) => guest.kind === "kid").length;
  return { adults, kids, total: adults + kids };
}

function addCounts(a: AttendanceBreakdown, b: AttendanceBreakdown): AttendanceBreakdown {
  return {
    adults: a.adults + b.adults,
    kids: a.kids + b.kids,
    total: a.total + b.total,
  };
}

function uniqueTags(values: string[]): string[] {
  const byNormalized = new Map<string, string>();
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const normalized = value.toLocaleLowerCase();
    if (!byNormalized.has(normalized)) byNormalized.set(normalized, value);
  }
  return [...byNormalized.values()].sort((a, b) => a.localeCompare(b));
}

function humanList(values: string[]): string {
  if (values.length <= 2) return values.join(" and ");
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function isChildBirthday(party: Party): boolean {
  return (
    party.occasion === "birthday" &&
    birthdayLifeStage(
      party.planningProfile?.honoreeAge,
      party.planningProfile?.honoreeLifeStage,
    ) === "child"
  );
}

function safeCount(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(500, Math.floor(value ?? 0)));
}
