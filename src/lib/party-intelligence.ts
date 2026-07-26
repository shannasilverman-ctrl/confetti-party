import type { Bucket, OccasionType, Party, Task, TimelineItem } from "./party-context";

export type HostEffort = "easy" | "balanced" | "all-out";
export type PartyFormat = "home" | "venue" | "help-me-choose";

/**
 * Durable facts that change Confetti's recommendations.
 *
 * This is deliberately smaller than a planning form: we persist only facts
 * that should keep influencing the checklist, quantities, timeline, RSVP
 * questions, and local recommendations after the creation moment.
 */
export type PartyPlanningProfile = {
  version: 1;
  honoreeAge?: number;
  expectedKids?: number;
  expectedAdults?: number;
  effort?: HostEffort;
  format?: PartyFormat;
};

export type PartyGuardrail = {
  id: string;
  title: string;
  detail: string;
  source:
    | "American Academy of Pediatrics"
    | "CDC"
    | "CPSC"
    | "FoodSafety.gov"
    | "Confetti planning practice";
  level: "recommendation" | "safety";
};

export type PartyPlaybook = {
  id: string;
  title: string;
  promise: string;
  ageBand?: "toddler" | "preschool" | "school-age" | "teen" | "adult";
  recommendedDurationMinutes?: number;
  recommendedKidCount?: number;
  tasks: Array<Omit<Task, "id" | "done">>;
  timeline: Array<Omit<TimelineItem, "id">>;
  rsvpQuestions: string[];
  guardrails: PartyGuardrail[];
};

function ageBand(age?: number): PartyPlaybook["ageBand"] {
  if (age == null) return undefined;
  if (age <= 3) return "toddler";
  if (age <= 5) return "preschool";
  if (age <= 12) return "school-age";
  if (age <= 17) return "teen";
  return "adult";
}

function addMinutes(time: string, minutes: number): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return "";
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return "";
  const total = (hours * 60 + mins + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function timedTimeline(
  startTime: string | undefined,
  entries: Array<{ offset: number; activity: string }>,
): Array<Omit<TimelineItem, "id">> {
  return entries.map(({ offset, activity }) => ({
    time: startTime ? addMinutes(startTime, offset) : offset === 0 ? "Start" : `+${offset} min`,
    activity,
  }));
}

const PRESCHOOL_TASKS: Array<{ title: string; bucket: Bucket }> = [
  {
    title: "Ask about allergies, sibling attendance, and whether an adult is staying",
    bucket: "3-5 weeks",
  },
  {
    title: "Choose one main activity plus a flexible arrival activity",
    bucket: "1-2 weeks",
  },
  {
    title: "Confirm bathrooms, handwashing, parking, and the weather backup",
    bucket: "1-2 weeks",
  },
  {
    title: "Check every favor and activity for small-part or balloon hazards",
    bucket: "Party week",
  },
  {
    title: "Label allergy-aware food and keep ingredient details available",
    bucket: "Party week",
  },
  {
    title: "Assign arrival, food, photos, and door-watching to specific adults",
    bucket: "Party week",
  },
  {
    title: "Pack the host kit: candles, lighter, cake knife, wipes, trash bags, and tape",
    bucket: "Day of",
  },
  {
    title: "Collect broken balloons immediately and keep uninflated balloons out of reach",
    bucket: "Day of",
  },
];

/**
 * Returns the opinionated knowledge layer for a party. Generic occasions may
 * return no playbook yet; callers then retain the existing occasion defaults.
 */
export function partyPlaybook(input: {
  occasion: OccasionType;
  profile?: PartyPlanningProfile;
  startTime?: string;
}): PartyPlaybook | null {
  const age = input.profile?.honoreeAge;
  const band = ageBand(age);

  if (input.occasion === "birthday" && band === "preschool") {
    const turning = age ? `turning ${age}` : "preschool";
    return {
      id: "birthday-preschool-v1",
      title: `A low-stress ${turning} birthday`,
      promise:
        "A short, active party with simple transitions, parent-ready details, and the easy-to-forget safety work already in the plan.",
      ageBand: band,
      recommendedDurationMinutes: 90,
      // AAP/HealthyChildren's young-child rule of thumb is age + one.
      recommendedKidCount: age ? age + 1 : 5,
      tasks: PRESCHOOL_TASKS,
      timeline: timedTimeline(input.startTime, [
        { offset: 0, activity: "Easy arrival play while families settle in" },
        { offset: 15, activity: "Main active or pretend-play activity" },
        { offset: 35, activity: "Food and water" },
        { offset: 55, activity: "Candles, cake, and the birthday moment" },
        { offset: 70, activity: "Flexible play, photos, and calm pickup" },
        { offset: 90, activity: "Party ends before the room runs out of steam" },
      ]),
      rsvpQuestions: [
        "How many children and adults are attending?",
        "Any food allergies or dietary needs we should plan around?",
        "Will an adult stay, or is this a drop-off party?",
        "Are siblings joining?",
        "Anything that would help your child feel comfortable or included?",
      ],
      guardrails: [
        {
          id: "preschool-duration",
          title: "Keep the plan compact",
          detail:
            "Use roughly 10–15 minute activity blocks and aim for about 90 minutes, with permission to stay longer on an activity the children love.",
          source: "American Academy of Pediatrics",
          level: "recommendation",
        },
        {
          id: "preschool-play",
          title: "Plan for how four-year-olds actually play",
          detail:
            "Favor active, pretend, music, drawing, matching, and follow-the-leader play over long instructions or elimination games.",
          source: "CDC",
          level: "recommendation",
        },
        {
          id: "balloon-safety",
          title: "Treat balloons as décor, not loose toys",
          detail:
            "Keep uninflated balloons away from children under eight and discard broken pieces immediately.",
          source: "CPSC",
          level: "safety",
        },
        {
          id: "food-safety",
          title: "Protect the youngest guests",
          detail:
            "Children under five are at higher risk from foodborne illness. Keep perishable food chilled and discard it after two hours at room temperature.",
          source: "FoodSafety.gov",
          level: "safety",
        },
      ],
    };
  }

  return null;
}

export function materializePlaybook(
  playbook: PartyPlaybook | null,
  mkId: () => string,
): { tasks: Array<Task & { done: false }>; timeline: TimelineItem[] } {
  if (!playbook) return { tasks: [], timeline: [] };
  return {
    tasks: playbook.tasks.map((task) => ({
      ...task,
      id: mkId(),
      done: false as const,
      source: "confetti-playbook" as const,
      playbookId: playbook.id,
    })),
    timeline: playbook.timeline.map((item) => ({
      ...item,
      id: mkId(),
      source: "confetti-playbook" as const,
      playbookId: playbook.id,
    })),
  };
}

/**
 * Rebuild only Confetti-owned recommendations after a meaningful profile
 * change. Host-created work is untouched, and completion/id state is retained
 * when the same recommended item still exists.
 */
export function reconcilePartyPlaybook(
  party: Party,
  planningProfile: PartyPlanningProfile,
  mkId: () => string,
): Party {
  const nextPlaybook = partyPlaybook({
    occasion: party.occasion,
    profile: planningProfile,
    startTime: party.startTime,
  });
  const next = materializePlaybook(nextPlaybook, mkId);
  const oldTasks = new Map(
    party.tasks
      .filter((task) => task.source === "confetti-playbook")
      .map((task) => [task.title.toLowerCase(), task]),
  );
  const oldTimeline = new Map(
    party.timeline
      .filter((item) => item.source === "confetti-playbook")
      .map((item) => [item.activity.toLowerCase(), item]),
  );

  const tasks = next.tasks.map((task) => {
    const previous = oldTasks.get(task.title.toLowerCase());
    return previous ? { ...task, id: previous.id, done: previous.done } : task;
  });
  const timeline = next.timeline.map((item) => {
    const previous = oldTimeline.get(item.activity.toLowerCase());
    return previous ? { ...item, id: previous.id } : item;
  });

  return {
    ...party,
    planningProfile,
    tasks: [...party.tasks.filter((task) => task.source !== "confetti-playbook"), ...tasks],
    timeline: [
      ...party.timeline.filter((item) => item.source !== "confetti-playbook"),
      ...timeline,
    ],
  };
}
