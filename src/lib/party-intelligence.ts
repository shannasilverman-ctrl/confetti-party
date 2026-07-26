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
    | "USDA"
    | "NFPA"
    | "Jewish community practice"
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
  const day = 24 * 60;
  const total = (((hours * 60 + mins + minutes) % day) + day) % day;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function timedTimeline(
  startTime: string | undefined,
  entries: Array<{ offset: number; activity: string }>,
): Array<Omit<TimelineItem, "id">> {
  return entries.map(({ offset, activity }) => ({
    time: startTime
      ? addMinutes(startTime, offset)
      : offset === 0
        ? "Start"
        : `${offset > 0 ? "+" : ""}${offset} min`,
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

const SHABBAT_TASKS: Array<{ title: string; bucket: Bucket }> = [
  {
    title: "Ask the host which Shabbat practices, timing, and level of observance fit this table",
    bucket: "1-2 weeks",
  },
  {
    title: "Confirm dietary needs and whether the kitchen or menu needs kosher accommodations",
    bucket: "1-2 weeks",
  },
  {
    title:
      "Tell guests the arrival window and whether it is important to arrive before candle lighting",
    bucket: "Party week",
  },
  {
    title: "Choose what is homemade, ordered, and assigned on the Bring Board",
    bucket: "Party week",
  },
  {
    title: "Set out candles, matches, wine or grape juice, challah, cover, and salt if using them",
    bucket: "Day of",
  },
  {
    title: "Finish the cooking and warming plan before the host's chosen Shabbat start",
    bucket: "Day of",
  },
  {
    title: "Put water, a non-alcoholic option, and dietary labels where guests can find them",
    bucket: "Day of",
  },
];

const DINNER_TASKS: Array<{ title: string; bucket: Bucket }> = [
  {
    title: "Ask about allergies, dietary needs, and foods guests strongly avoid",
    bucket: "1-2 weeks",
  },
  {
    title: "Choose one menu path: cook, prepared food, potluck, or a deliberate mix",
    bucket: "1-2 weeks",
  },
  {
    title: "Write a backwards prep plan for every dish, including oven and burner conflicts",
    bucket: "Party week",
  },
  {
    title: "Decide seating, serving style, and where coats, bags, and drinks land",
    bucket: "Party week",
  },
  {
    title: "Set out an arrival drink and one no-cook bite before guests arrive",
    bucket: "Day of",
  },
  {
    title: "Clear the sink, empty the dishwasher, and stage leftover containers",
    bucket: "Day of",
  },
];

const HOLIDAY_TASKS: Array<{ title: string; bucket: Bucket }> = [
  {
    title: "Confirm the real headcount by household, including children and accessibility needs",
    bucket: "3-5 weeks",
  },
  {
    title: "Ask which traditions matter to this group and mark every ritual as optional",
    bucket: "1-2 weeks",
  },
  {
    title: "Assign exact dishes and quantities on the Bring Board so nothing doubles up",
    bucket: "1-2 weeks",
  },
  {
    title: "Map oven, stovetop, refrigerator, serving, and reheat space before finalizing the menu",
    bucket: "Party week",
  },
  {
    title: "Plan a kid landing zone and one low-effort activity if children are coming",
    bucket: "Party week",
  },
  {
    title: "Stage labels, serving utensils, leftover containers, and a cleanup owner",
    bucket: "Day of",
  },
];

const GAME_DAY_TASKS: Array<{ title: string; bucket: Bucket }> = [
  {
    title: "Confirm kickoff, stream, subscription, blackout rules, and a backup way to watch",
    bucket: "1-2 weeks",
  },
  {
    title: "Check every main seat for a clear view and understandable sound",
    bucket: "Party week",
  },
  {
    title:
      "Split food into pregame, during-play, and halftime waves instead of serving everything at once",
    bucket: "Party week",
  },
  {
    title: "Create separate drink, trash, and refill stations away from the screen",
    bucket: "Day of",
  },
  {
    title:
      "Put out a quieter side activity for children and guests who are not watching every play",
    bucket: "Day of",
  },
  {
    title: "Test the stream, sound, remotes, charging, and Wi-Fi before doors open",
    bucket: "Day of",
  },
];

const COOKOUT_TASKS: Array<{ title: string; bucket: Bucket }> = [
  {
    title: "Choose the weather decision time and reserve a rain, heat, or smoke backup",
    bucket: "1-2 weeks",
  },
  {
    title: "Assign grill, cold food, drinks, greeting, and kid-watching to named adults",
    bucket: "Party week",
  },
  {
    title: "Separate raw-food tools and trays from ready-to-eat food and serving tools",
    bucket: "Party week",
  },
  {
    title: "Plan shade, water, seating, handwashing, bug control, and bathroom access",
    bucket: "Party week",
  },
  {
    title: "Stage a food thermometer, clean platters, cooler ice, and a discard-time marker",
    bucket: "Day of",
  },
  {
    title: "Place the grill outdoors, away from structures and the main guest path",
    bucket: "Day of",
  },
];

function standardGuardrails(): PartyGuardrail[] {
  return [
    {
      id: "dietary-first",
      title: "Ask before you menu-plan",
      detail:
        "Collect allergies, dietary needs, and accessibility needs early enough that guests are not treated as exceptions later.",
      source: "Confetti planning practice",
      level: "recommendation",
    },
    {
      id: "two-hour-food-window",
      title: "Protect the buffet window",
      detail:
        "Refrigerate perishable food within two hours, or within one hour when outdoor temperatures are above 90°F.",
      source: "FoodSafety.gov",
      level: "safety",
    },
  ];
}

/**
 * Returns the opinionated knowledge layer for a party. Generic occasions may
 * return no playbook yet; callers then retain the existing occasion defaults.
 */
export function partyPlaybook(input: {
  occasion: OccasionType;
  profile?: PartyPlanningProfile;
  startTime?: string;
  holidayPackId?: string;
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

  if (input.occasion === "holiday" && input.holidayPackId === "shabbat") {
    return {
      id: "shabbat-dinner-v1",
      title: "A Shabbat dinner that protects the pause",
      promise:
        "The food, timing, guest expectations, and optional ritual setup are handled before the table gathers—without assuming every household observes in the same way.",
      recommendedDurationMinutes: 150,
      tasks: SHABBAT_TASKS,
      timeline: timedTimeline(input.startTime, [
        { offset: 0, activity: "Guests arrive and settle before the host's chosen start" },
        { offset: 20, activity: "Optional candle lighting and welcome rituals" },
        { offset: 35, activity: "Challah, first course, and everyone lands at the table" },
        { offset: 70, activity: "Main meal and unhurried conversation" },
        { offset: 120, activity: "Dessert, singing, stories, or the host's own tradition" },
        { offset: 150, activity: "A natural close—no rushed clearing while people linger" },
      ]),
      rsvpQuestions: [
        "How many adults and children are joining?",
        "Any allergies, dietary needs, or kosher accommodations we should plan for?",
        "Will you arrive before candle lighting, if our gathering includes it?",
        "Would you like to bring a dish, wine, grape juice, or challah?",
        "Anything that would make the evening more comfortable or accessible?",
      ],
      guardrails: [
        {
          id: "shabbat-varies",
          title: "Let this household define Shabbat",
          detail:
            "Observance, ritual, food, technology, and timing vary. Ask the host and keep every suggested practice editable and optional.",
          source: "Jewish community practice",
          level: "recommendation",
        },
        {
          id: "shabbat-before-sunset",
          title: "Clarify the arrival window",
          detail:
            "Shabbat begins before sunset on Friday in traditional practice. If that timing matters here, state it plainly instead of listing only a dinner time.",
          source: "Jewish community practice",
          level: "recommendation",
        },
        ...standardGuardrails(),
      ],
    };
  }

  if (input.occasion === "holiday") {
    const title =
      input.holidayPackId === "thanksgiving"
        ? "Thanksgiving without the oven traffic jam"
        : input.holidayPackId === "friendsgiving"
          ? "A Friendsgiving where every dish has an owner"
          : "A holiday table without the invisible labor";
    return {
      id: `holiday-${input.holidayPackId ?? "generic"}-v1`,
      title,
      promise:
        "Confetti turns the guest list into a menu, ownership plan, kitchen schedule, kid plan, and cleanup handoff—while keeping every tradition optional.",
      recommendedDurationMinutes: 210,
      tasks: HOLIDAY_TASKS,
      timeline: timedTimeline(input.startTime, [
        { offset: 0, activity: "Arrival drinks, coats, and contributions land in assigned places" },
        { offset: 30, activity: "Welcome, optional tradition, and final food warm-up" },
        { offset: 60, activity: "Meal begins with dietary labels and serving tools ready" },
        { offset: 135, activity: "Clear mains, reset drinks, and bring out dessert" },
        { offset: 180, activity: "Leftovers, games, stories, or a post-meal walk" },
        { offset: 210, activity: "Cleanup owners close the kitchen without ending the gathering" },
      ]),
      rsvpQuestions: [
        "How many adults and children are coming from your household?",
        "Any allergies, dietary needs, or accessibility needs?",
        "What would you genuinely enjoy bringing?",
        "Do you need oven, refrigerator, or serving space when you arrive?",
        "Which traditions or moments matter most to you?",
      ],
      guardrails: [
        {
          id: "holiday-oven-map",
          title: "Capacity is part of the menu",
          detail:
            "A dish is not planned until its refrigerator, oven, burner, serving, and reheat needs fit the kitchen schedule.",
          source: "Confetti planning practice",
          level: "recommendation",
        },
        {
          id: "holiday-ownership",
          title: "Every contribution gets an owner",
          detail:
            "Assign the exact dish, quantity, arrival state, and serving needs so 'bring a side' never produces four salads and no ice.",
          source: "Confetti planning practice",
          level: "recommendation",
        },
        ...standardGuardrails(),
      ],
    };
  }

  if (input.occasion === "dinner-party") {
    return {
      id: "dinner-party-v1",
      title: "A dinner where the host is actually at the table",
      promise:
        "The menu is chosen backwards from effort, equipment, dietary needs, and serving time—so the final hour is assembly, not panic.",
      recommendedDurationMinutes: 180,
      tasks: DINNER_TASKS,
      timeline: timedTimeline(input.startTime, [
        { offset: 0, activity: "Arrival drink and one ready-to-eat bite" },
        { offset: 30, activity: "Guests settle; host finishes only the last hot step" },
        { offset: 50, activity: "Dinner lands together at the chosen table or buffet" },
        { offset: 120, activity: "Dessert and a clean drink reset" },
        { offset: 165, activity: "Coffee, tea, or a natural last round" },
        { offset: 180, activity: "Leftovers are packed; only the easy cleanup remains" },
      ]),
      rsvpQuestions: [
        "Any allergies, dietary needs, or foods you strongly avoid?",
        "Are you bringing a guest?",
        "Would you prefer wine, a non-alcoholic drink, or either?",
        "Anything that would make seating or the space more comfortable?",
      ],
      guardrails: [
        {
          id: "dinner-one-last-step",
          title: "Protect the final hour",
          detail:
            "Choose a menu with no more than one attention-heavy last-minute step, then outsource or prep the rest ahead.",
          source: "Confetti planning practice",
          level: "recommendation",
        },
        {
          id: "dinner-arrival-buffer",
          title: "Make late arrivals survivable",
          detail:
            "Use an arrival window and a first bite that can wait, so one delayed guest does not derail the whole meal.",
          source: "Confetti planning practice",
          level: "recommendation",
        },
        ...standardGuardrails(),
      ],
    };
  }

  if (input.occasion === "game-day") {
    return {
      id: "game-day-v1",
      title: "A watch party built around the actual game",
      promise:
        "Kickoff drives arrival, food waves, seating, sound, screen backup, and the people who want to socialize without blocking the play.",
      recommendedDurationMinutes: 240,
      tasks: GAME_DAY_TASKS,
      timeline: timedTimeline(input.startTime, [
        { offset: -60, activity: "Doors open; drinks and cold snacks are ready" },
        { offset: -30, activity: "Hot pregame food lands and everyone finds a sightline" },
        { offset: 0, activity: "Kickoff—stream, sound, and backup are confirmed" },
        { offset: 60, activity: "Halftime food wave and fast trash reset" },
        { offset: 150, activity: "Late-game snack and drink refill" },
        { offset: 210, activity: "Final whistle, dessert, recap, and rides home" },
      ]),
      rsvpQuestions: [
        "How many adults and children are coming?",
        "Are you here to watch closely, socialize, or both?",
        "Any allergies or dietary needs?",
        "Do you need a seat, accessible viewing spot, or quieter area?",
        "What food or drink would you like to claim?",
      ],
      guardrails: [
        {
          id: "game-day-tech",
          title: "Test the real broadcast path",
          detail:
            "Confirm the exact stream, account, device, sound, and backup before guests arrive; a working TV menu is not a working game.",
          source: "Confetti planning practice",
          level: "recommendation",
        },
        {
          id: "game-day-food-waves",
          title: "Serve in waves",
          detail:
            "Keep cold food cold and bring hot food out in smaller timed batches instead of leaving the full menu out for the whole game.",
          source: "FoodSafety.gov",
          level: "safety",
        },
        ...standardGuardrails(),
      ],
    };
  }

  if (input.occasion === "cookout") {
    return {
      id: "cookout-v1",
      title: "A cookout that survives weather, hunger, and the grill",
      promise:
        "The plan separates raw and ready food, gives every adult a job, covers shade and rain, and keeps the grill master from missing the party.",
      recommendedDurationMinutes: 180,
      tasks: COOKOUT_TASKS,
      timeline: timedTimeline(input.startTime, [
        { offset: -60, activity: "Coolers, shade, seating, and handwashing station are ready" },
        { offset: -30, activity: "Grill preheats; cold sides stay chilled" },
        { offset: 0, activity: "Guests arrive to drinks and ready-to-eat snacks" },
        { offset: 35, activity: "First grill batch lands on a clean serving platter" },
        { offset: 90, activity: "Second food wave, temperature check, and cooler refresh" },
        { offset: 150, activity: "Dessert, leftovers into cold storage, and relaxed cleanup" },
        { offset: 180, activity: "Grill and food stations close safely" },
      ]),
      rsvpQuestions: [
        "How many adults and children are coming?",
        "Any allergies, dietary needs, or food restrictions?",
        "Would you like to bring a side, dessert, drinks, ice, or outdoor gear?",
        "Do you need shade, an accessible seat, or an indoor backup?",
        "Are you staying for the whole cookout or dropping in?",
      ],
      guardrails: [
        {
          id: "cookout-separate",
          title: "Separate raw from ready",
          detail:
            "Keep raw meat, poultry, and seafood—and their plates and utensils—separate from salads, fruit, cooked food, and clean serving tools.",
          source: "USDA",
          level: "safety",
        },
        {
          id: "cookout-thermometer",
          title: "Use a food thermometer",
          detail:
            "Grill marks do not prove food is safely cooked. Use a thermometer and follow the safe temperature for the specific food.",
          source: "USDA",
          level: "safety",
        },
        {
          id: "cookout-grill-placement",
          title: "Keep the grill outside and clear",
          detail:
            "Use grills outdoors and position them away from structures, overhangs, decorations, play areas, and heavy guest traffic.",
          source: "NFPA",
          level: "safety",
        },
        ...standardGuardrails(),
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
    holidayPackId: party.holidayPackId,
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
