import type { Bucket, OccasionType, Party, Task, TimelineItem } from "./party-context";

export type HostEffort = "easy" | "balanced" | "all-out";
export type PartyFormat = "home" | "venue" | "help-me-choose";
export type HonoreeLifeStage = "child" | "teen" | "adult";
export type FoodRole = "light-bites" | "full-meal" | "grazing";
export type FoodServiceStyle = "self-serve" | "family-style" | "served";

export type LocalSourcingStatus = "considering" | "contacted" | "quoted" | "booked";

export type LocalSourcingOption = {
  id: string;
  suggestionId: string;
  kind: "venue" | "food" | "experience";
  providerName: string;
  url?: string;
  cost?: number;
  costBasis?: "host-estimate" | "vendor-quote";
  status: LocalSourcingStatus;
  notes?: string;
  selected?: boolean;
};

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
  /**
   * A coarse, private planning signal for hosts who do not want or need to
   * enter an exact age. Exact age always wins when both are present.
   */
  honoreeLifeStage?: HonoreeLifeStage;
  expectedKids?: number;
  expectedAdults?: number;
  effort?: HostEffort;
  format?: PartyFormat;
  /**
   * Optional, durable quantity inputs. They stay out of quick creation and can
   * be added later when the host is ready to make food decisions.
   */
  foodRole?: FoodRole;
  foodServiceStyle?: FoodServiceStyle;
  durationMinutes?: number;
  /** Host-confirmed IANA zone used to turn a displayed wall time into a guest-safe instant. */
  eventTimeZone?: string;
  /**
   * A host-entered local shortlist. Confetti never treats these records as
   * verified inventory; status, quote basis, and selection stay explicit.
   */
  localSourcingOptions?: LocalSourcingOption[];
};

export type PreschoolPartyPath = {
  id: "home-play" | "hosted-venue";
  format: Exclude<PartyFormat, "help-me-choose">;
  title: string;
  bestFor: string;
  flow: string;
  tradeoff: string;
  nextStep: string;
  recommended: boolean;
  recommendationReason: string;
};

/**
 * Turns "help me choose" into an opinionated, editable starting path.
 *
 * The choice is deliberately based only on durable facts we actually know.
 * It never claims local price, package, capacity, or availability.
 */
export function preschoolPartyPaths(
  profile: PartyPlanningProfile | undefined,
): PreschoolPartyPath[] {
  const age = profile?.honoreeAge;
  if (age == null || age < 4 || age > 5) return [];

  const children = profile?.expectedKids;
  const format = profile?.format ?? "help-me-choose";
  const effort = profile?.effort ?? "balanced";
  const recommendedFormat: PreschoolPartyPath["format"] =
    format === "home" || format === "venue"
      ? format
      : effort === "easy" || (children != null && children >= 7)
        ? "venue"
        : "home";

  const recommendationReason =
    format === "home"
      ? "You chose home, so Confetti is keeping the plan compact and setup-aware."
      : format === "venue"
        ? "You chose a venue, so Confetti is prioritizing containment, package fit, and a clean handoff."
        : recommendedFormat === "venue" && effort === "easy"
          ? "You asked Confetti to carry more of the load, so a contained venue package is the calmer starting point."
          : recommendedFormat === "venue"
            ? `${children} children is a bigger preschool group, so contained active play and included cleanup are the calmer starting point.`
            : `A short at-home play party keeps the default ${
                children != null && children > 0 ? children : age + 1
              }-child starting list flexible without over-programming it.`;

  const paths: PreschoolPartyPath[] = [
    {
      id: "home-play",
      format: "home",
      title: "Simple at-home play party",
      bestFor: "A small child guest list, flexible timing, and control over the spend.",
      flow: "Easy arrival play → one main activity → food + cake → free play and pickup.",
      tradeoff: "You own setup, supervision zones, a weather backup, and cleanup.",
      nextStep: "Choose one theme direction; Confetti turns it into one activity and a short list.",
      recommended: recommendedFormat === "home",
      recommendationReason,
    },
    {
      id: "hosted-venue",
      format: "venue",
      title: "Contained play venue",
      bestFor: "Active play with less setup and cleanup landing on the host.",
      flow: "Arrival and check-in → included play → food + cake → a clear pickup.",
      tradeoff:
        "Usually less flexible. Confirm package time, capacity, adult rules, food, waivers, bathrooms, and cleanup.",
      nextStep:
        "Add a city or ZIP; Confetti gives you the right venue search and comparison checklist.",
      recommended: recommendedFormat === "venue",
      recommendationReason,
    },
  ];

  return paths.sort((a, b) => Number(b.recommended) - Number(a.recommended));
}

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
  ageBand?: PartyAgeBand;
  recommendedDurationMinutes?: number;
  recommendedKidCount?: number;
  tasks: Array<Omit<Task, "id" | "done">>;
  timeline: Array<Omit<TimelineItem, "id">>;
  rsvpQuestions: string[];
  guardrails: PartyGuardrail[];
};

export type PartyAgeBand = "toddler" | "preschool" | "school-age" | "teen" | "adult";

/**
 * One shared life-stage boundary keeps the playbook, local ideas, RSVP copy,
 * and future recommendation surfaces from quietly disagreeing about age.
 * Missing ages remain unknown; callers must not turn absence into a child
 * default.
 */
export function birthdayLifeStage(
  age?: number,
  explicitStage?: HonoreeLifeStage,
): HonoreeLifeStage | undefined {
  const band = birthdayAgeBand(age);
  if (band === "adult") return "adult";
  if (band === "teen") return "teen";
  if (band) return "child";
  return explicitStage;
}

export function birthdayAgeBand(
  age?: number,
  lifeStage?: HonoreeLifeStage,
): PartyAgeBand | undefined {
  if (age == null) return lifeStage === "teen" || lifeStage === "adult" ? lifeStage : undefined;
  if (age <= 3) return "toddler";
  if (age <= 5) return "preschool";
  if (age <= 12) return "school-age";
  if (age <= 17) return "teen";
  if (age <= 120) return "adult";
  return lifeStage === "teen" || lifeStage === "adult" ? lifeStage : undefined;
}

function ordinal(value: number): string {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
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

type PlaybookTask = Omit<Task, "id" | "done" | "source" | "playbookId">;

function playbookTask(
  title: string,
  bucket: Bucket,
  reason: string,
  action: PlaybookTask["action"],
): PlaybookTask {
  return { title, bucket, reason, action };
}

const PRESCHOOL_TASKS: PlaybookTask[] = [
  playbookTask(
    "Ask about allergies, sibling attendance, and whether an adult is staying",
    "3-5 weeks",
    "Those answers change the food, supervision, space, and real headcount before money is spent.",
    "guests",
  ),
  playbookTask(
    "Choose one main activity plus a flexible arrival activity",
    "1-2 weeks",
    "Young children arrive at different speeds; an easy landing activity prevents the first fifteen minutes from becoming chaos.",
    "timeline",
  ),
  playbookTask(
    "Confirm bathrooms, handwashing, parking, and the weather backup",
    "1-2 weeks",
    "Parents need practical arrival details, and the host needs a fallback before the forecast becomes urgent.",
    "guests",
  ),
  playbookTask(
    "Check every favor and activity for small-part or balloon hazards",
    "Party week",
    "Preschool guests explore with their hands and mouths, so age-fit materials matter more than a cute setup.",
    "shopping",
  ),
  playbookTask(
    "Label allergy-aware food and keep ingredient details available",
    "Party week",
    "Clear labels let families make safe choices without repeatedly finding the host.",
    "shopping",
  ),
  playbookTask(
    "Assign arrival, food, photos, and door-watching to specific adults",
    "Party week",
    "Named owners keep the host from becoming the only person noticing every need at once.",
    "timeline",
  ),
  playbookTask(
    "Pack the host kit: candles, lighter, cake knife, wipes, trash bags, and tape",
    "Day of",
    "A small rescue kit prevents the most common celebration moments from stopping for a missing basic.",
    "shopping",
  ),
  playbookTask(
    "Collect broken balloons immediately and keep uninflated balloons out of reach",
    "Day of",
    "Broken and uninflated balloons are a choking risk for young children.",
    "timeline",
  ),
];

const SCHOOL_AGE_BIRTHDAY_TASKS: PlaybookTask[] = [
  playbookTask(
    "Ask the birthday child for one must-have, one nice-to-have, and one hard no",
    "3-5 weeks",
    "A short priority list makes the party feel like them without turning every idea into a requirement.",
    "theme",
  ),
  playbookTask(
    "Confirm invited children, siblings, adult-stay expectations, and the pickup plan",
    "3-5 weeks",
    "The real child and adult counts determine supervision, space, food, and whether handoff can stay calm.",
    "guests",
  ),
  playbookTask(
    "Choose one anchor activity and one flexible backup—not a packed schedule",
    "1-2 weeks",
    "School-age children can stay engaged longer, but free social time and a backup work better than constant transitions.",
    "timeline",
  ),
  playbookTask(
    "Confirm venue rules, waivers, accessibility, bathrooms, and food boundaries",
    "1-2 weeks",
    "Practical constraints need to shape the invitation and plan before families arrive or money becomes nonrefundable.",
    "guests",
  ),
  playbookTask(
    "Collect allergies, dietary needs, and any participation accommodations",
    "1-2 weeks",
    "Food and activities should fit the invited children from the start instead of singling someone out on the day.",
    "guests",
  ),
  playbookTask(
    "Assign check-in, activity support, food, photos, and pickup to named adults",
    "Party week",
    "Clear zones and owners let the host celebrate instead of monitoring every transition alone.",
    "timeline",
  ),
  playbookTask(
    "Send the exact arrival window, clothing note, waiver link, and pickup time",
    "Party week",
    "Parents can prepare children properly and the party can start and finish without a trail of clarification texts.",
    "guests",
  ),
  playbookTask(
    "Stage water, labeled food, candles, a lighter, cake tools, wipes, and take-home items",
    "Day of",
    "The birthday moment and the practical reset should not stop because a basic is still in a cupboard or car.",
    "shopping",
  ),
];

const TEEN_BIRTHDAY_TASKS: PlaybookTask[] = [
  playbookTask(
    "Ask the teen for the guest mix, one must-have, and what would feel embarrassing or overdone",
    "3-5 weeks",
    "A teen birthday should reflect the person being celebrated, including their boundaries around attention, family, friends, surprises, and photos.",
    "theme",
  ),
  playbookTask(
    "Set the friend, family, sibling, and invitation boundaries together",
    "3-5 weeks",
    "Clear guest-list rules protect capacity and relationships without making the teen negotiate exceptions during the party.",
    "guests",
  ),
  playbookTask(
    "Choose one teen-approved anchor and leave real room to socialize",
    "1-2 weeks",
    "One activity, outing, meal, or creative moment gives the gathering shape without forcing a group of teens through a children's-party rotation.",
    "timeline",
  ),
  playbookTask(
    "Confirm supervision, independence, venue rules, waivers, and the transport plan",
    "1-2 weeks",
    "The host and families need a shared understanding of where adults will be, how much independence the group has, and how everyone gets home.",
    "guests",
  ),
  playbookTask(
    "Collect allergies, dietary needs, accessibility needs, and participation boundaries",
    "1-2 weeks",
    "Food and activities should work for the invited group without requiring anyone to disclose private details in front of friends.",
    "guests",
  ),
  playbookTask(
    "Agree on photos, posting, music, and any surprise before the day",
    "Party week",
    "Consent around images and attention matters; the teen should know what is public, staged, or optional.",
    "guests",
  ),
  playbookTask(
    "Send the arrival window, clothing or equipment note, transport details, and pickup plan",
    "Party week",
    "Teens and families can prepare without a chain of last-minute questions or unsafe assumptions about rides.",
    "guests",
  ),
  playbookTask(
    "Assign food, transport, the shared moment, payment, and a low-profile adult safety lead",
    "Day of",
    "Named support lets the teen own the social experience while the host quietly covers the responsibilities that cannot be delegated.",
    "timeline",
  ),
];

const ADULT_BIRTHDAY_TASKS: PlaybookTask[] = [
  playbookTask(
    "Define the celebration brief: how it should feel, three priorities, and three things to skip",
    "3-5 weeks",
    "A clear experience brief protects the guest of honor from a generic party and keeps spending tied to what matters.",
    "theme",
  ),
  playbookTask(
    "Set the guest-list rule, plus-one approach, and private must-invite list",
    "3-5 weeks",
    "Guest chemistry and capacity shape the format more than a theme does, and unclear plus-ones create avoidable friction.",
    "guests",
  ),
  playbookTask(
    "Choose one hosting model: home, restaurant, venue, activity, or a deliberate two-stop plan",
    "3-5 weeks",
    "One operating model aligns budget, timing, transportation, food, and the amount of work the host is accepting.",
    "timeline",
  ),
  playbookTask(
    "Plan the menu and drinks from headcount, dietary needs, service style, and host effort",
    "1-2 weeks",
    "The food plan should fit the people and the service window—not become a second event the host has to perform.",
    "shopping",
  ),
  playbookTask(
    "Design arrival, one shared moment, cake or toast, and a natural wind-down",
    "1-2 weeks",
    "A few visible beats create a memorable arc while leaving room for the conversations people actually came to have.",
    "timeline",
  ),
  playbookTask(
    "Confirm accessibility, seating, sound level, parking, and a safe trip home",
    "Party week",
    "Guests should know they can arrive, participate, rest, hear, and leave without privately solving basic access needs.",
    "guests",
  ),
  playbookTask(
    "Assign greeting, food, photos, the shared moment, and final payment or cleanup",
    "Party week",
    "Named owners keep the organizer from disappearing into logistics during the celebration.",
    "timeline",
  ),
  playbookTask(
    "Prepare the host closeout: leftovers, gifts, vendor tips, rides, keys, and final sweep",
    "Day of",
    "A ten-minute closing plan prevents the last hour from becoming scattered decisions after everyone is tired.",
    "timeline",
  ),
];

const BABY_SHOWER_TASKS: PlaybookTask[] = [
  playbookTask(
    "Ask the parents what would feel supportive, what should stay private, and what they want to skip",
    "3-5 weeks",
    "The gathering should reflect the parents' comfort with attention, games, gifts, photos, names, and personal questions.",
    "guests",
  ),
  playbookTask(
    "Set the guest-list, cohost roles, and whether children or plus-ones are included",
    "3-5 weeks",
    "Clear invitation boundaries protect capacity and keep the parents from becoming the coordination desk.",
    "guests",
  ),
  playbookTask(
    "Choose a format with comfortable seating, easy bathrooms, access, and a quiet place to step away",
    "1-2 weeks",
    "The space should work for the actual guests and give the people being celebrated room to rest or regroup.",
    "timeline",
  ),
  playbookTask(
    "Write invitation and registry guidance without assuming gifts, gender, names, or family structure",
    "1-2 weeks",
    "Direct, optional gift guidance is more useful than tradition-coded language or pressure to disclose personal details.",
    "guests",
  ),
  playbookTask(
    "Plan one optional shared moment and one easy social activity",
    "1-2 weeks",
    "Guests need a way to connect, but the parents should not have to perform through a packed schedule of games.",
    "timeline",
  ),
  playbookTask(
    "Build the food and drink plan from headcount, dietary needs, service style, and host effort",
    "Party week",
    "A clearly labeled, self-sufficient food setup lets every guest make comfortable choices without assumptions.",
    "shopping",
  ),
  playbookTask(
    "Assign greeting, food, gifts or cards, photos, the shared moment, and cleanup",
    "Party week",
    "Named owners keep the parents and primary host present instead of quietly carrying every transition.",
    "timeline",
  ),
  playbookTask(
    "Prepare a gift log, packing zone, leftovers, thank-you notes, and the trip home",
    "Day of",
    "A calm close protects gifts and personal information while preventing the final hour from landing on the parents.",
    "timeline",
  ),
];

const GRADUATION_TASKS: PlaybookTask[] = [
  playbookTask(
    "Ask the graduate how they want to be celebrated, who matters most, and what attention to avoid",
    "3-5 weeks",
    "The event should reflect the graduate rather than forcing a speech, surprise, display, or tradition they do not want.",
    "guests",
  ),
  playbookTask(
    "Separate ceremony logistics from party logistics and name an owner for each",
    "3-5 weeks",
    "Tickets, travel, parking, photos, and the celebration often overlap; distinct owners keep one delay from unraveling both.",
    "timeline",
  ),
  playbookTask(
    "Set the guest-list, drop-in window, plus-one rule, and realistic capacity",
    "3-5 weeks",
    "Graduation groups often mix family, friends, mentors, and classmates, so arrival expectations matter as much as the count.",
    "guests",
  ),
  playbookTask(
    "Choose a weather, traffic, and ceremony-delay decision plan",
    "1-2 weeks",
    "A written fallback lets food, vendors, and guests adjust without making the graduate coordinate from the ceremony.",
    "timeline",
  ),
  playbookTask(
    "Confirm permission for photos, school details, displays, speeches, and public sharing",
    "1-2 weeks",
    "A meaningful display should not expose grades, schedules, addresses, or images the graduate did not agree to share.",
    "theme",
  ),
  playbookTask(
    "Plan food in arrival waves and protect a plate for the graduate and ceremony group",
    "Party week",
    "Guests may arrive over a long window; smaller service waves keep food safe and ensure the people being celebrated can eat.",
    "shopping",
  ),
  playbookTask(
    "Assign greeting, parking help, food, photos, cards, the shared moment, and cleanup",
    "Party week",
    "Clear ownership lets the host welcome different guest groups without losing cards, food timing, or the graduate.",
    "timeline",
  ),
  playbookTask(
    "Create a secure card-and-gift station and a named end-of-night handoff",
    "Day of",
    "Cards, cash, keepsakes, and gifts need one monitored location and one person responsible for taking them home.",
    "timeline",
  ),
];

const SHABBAT_TASKS: PlaybookTask[] = [
  playbookTask(
    "Ask the host which Shabbat practices, timing, and level of observance fit this table",
    "1-2 weeks",
    "Household practices vary; asking protects the host's tradition instead of making assumptions.",
    "guests",
  ),
  playbookTask(
    "Confirm dietary needs and whether the kitchen or menu needs kosher accommodations",
    "1-2 weeks",
    "These answers affect ingredients, preparation, serving pieces, and which contributions are appropriate.",
    "guests",
  ),
  playbookTask(
    "Tell guests the arrival window and whether it is important to arrive before candle lighting",
    "Party week",
    "Clear timing lets guests respect the gathering without needing insider knowledge.",
    "guests",
  ),
  playbookTask(
    "Choose what is homemade, ordered, and assigned on the Bring Board",
    "Party week",
    "One ownership plan prevents duplicate dishes and leaves the host with a realistic cooking load.",
    "bring",
  ),
  playbookTask(
    "Set out candles, matches, wine or grape juice, challah, cover, and salt if using them",
    "Day of",
    "Staging optional ritual items early protects the pause once everyone gathers.",
    "shopping",
  ),
  playbookTask(
    "Finish the cooking and warming plan before the host's chosen Shabbat start",
    "Day of",
    "A backwards kitchen plan avoids last-minute conflicts and can support the household's observance.",
    "timeline",
  ),
  playbookTask(
    "Put water, a non-alcoholic option, and dietary labels where guests can find them",
    "Day of",
    "Guests can care for themselves without interrupting the host or guessing what is safe.",
    "shopping",
  ),
];

const DINNER_TASKS: PlaybookTask[] = [
  playbookTask(
    "Ask about allergies, dietary needs, and foods guests strongly avoid",
    "1-2 weeks",
    "The menu should fit the people at the table before recipes or orders are locked.",
    "guests",
  ),
  playbookTask(
    "Choose one menu path: cook, prepared food, potluck, or a deliberate mix",
    "1-2 weeks",
    "A single approach keeps ambition, budget, shopping, and available prep time aligned.",
    "shopping",
  ),
  playbookTask(
    "Write a backwards prep plan for every dish, including oven and burner conflicts",
    "Party week",
    "The meal succeeds when every dish has a finish time and shared appliances are not double-booked.",
    "timeline",
  ),
  playbookTask(
    "Decide seating, serving style, and where coats, bags, and drinks land",
    "Party week",
    "A few clear zones remove bottlenecks and help guests settle without asking where everything goes.",
    "timeline",
  ),
  playbookTask(
    "Set out an arrival drink and one no-cook bite before guests arrive",
    "Day of",
    "An immediate welcome buys the kitchen time and makes early arrivals feel intentional.",
    "shopping",
  ),
  playbookTask(
    "Clear the sink, empty the dishwasher, and stage leftover containers",
    "Day of",
    "Making cleanup space before dinner prevents the end of the night from becoming a second event.",
    "timeline",
  ),
];

const HOLIDAY_TASKS: PlaybookTask[] = [
  playbookTask(
    "Confirm the real headcount by household, including children and accessibility needs",
    "3-5 weeks",
    "Household-level answers produce a usable seating, quantity, and comfort plan—not just an invite count.",
    "guests",
  ),
  playbookTask(
    "Ask which traditions matter to this group and mark every ritual as optional",
    "1-2 weeks",
    "The gathering should reflect this family rather than treating one version of a holiday as universal.",
    "guests",
  ),
  playbookTask(
    "Assign exact dishes and quantities on the Bring Board so nothing doubles up",
    "1-2 weeks",
    "Specific contributions spread the work while keeping the meal complete and balanced.",
    "bring",
  ),
  playbookTask(
    "Map oven, stovetop, refrigerator, serving, and reheat space before finalizing the menu",
    "Party week",
    "Kitchen capacity—not recipe count—is usually the hidden limit of a holiday meal.",
    "timeline",
  ),
  playbookTask(
    "Plan a kid landing zone and one low-effort activity if children are coming",
    "Party week",
    "A defined place to land helps children settle and lets adults reconnect without constant redirection.",
    "shopping",
  ),
  playbookTask(
    "Stage labels, serving utensils, leftover containers, and a cleanup owner",
    "Day of",
    "The meal can flow and close without every small decision returning to the host.",
    "shopping",
  ),
];

const GAME_DAY_TASKS: PlaybookTask[] = [
  playbookTask(
    "Confirm kickoff, stream, subscription, blackout rules, and a backup way to watch",
    "1-2 weeks",
    "The broadcast is the event; confirming the whole viewing path prevents a roomful of guests waiting on a login.",
    "timeline",
  ),
  playbookTask(
    "Check every main seat for a clear view and understandable sound",
    "Party week",
    "A large screen does not help if the actual seating creates blocked views or muddy audio.",
    "theme",
  ),
  playbookTask(
    "Split food into pregame, during-play, and halftime waves instead of serving everything at once",
    "Party week",
    "Serving in waves keeps hot food hot, reduces waste, and avoids pulling everyone away from the game.",
    "timeline",
  ),
  playbookTask(
    "Create separate drink, trash, and refill stations away from the screen",
    "Day of",
    "Self-serve zones reduce traffic in front of the screen and keep the host out of constant refill duty.",
    "shopping",
  ),
  playbookTask(
    "Put out a quieter side activity for children and guests who are not watching every play",
    "Day of",
    "A second way to belong makes the party work for the whole guest list, not only the biggest fans.",
    "shopping",
  ),
  playbookTask(
    "Test the stream, sound, remotes, charging, and Wi-Fi before doors open",
    "Day of",
    "A ten-minute rehearsal catches the failures that are hardest to solve with guests in the room.",
    "timeline",
  ),
];

const COOKOUT_TASKS: PlaybookTask[] = [
  playbookTask(
    "Choose the weather decision time and reserve a rain, heat, or smoke backup",
    "1-2 weeks",
    "A pre-agreed decision point replaces stressful day-of debating with a usable fallback.",
    "timeline",
  ),
  playbookTask(
    "Assign grill, cold food, drinks, greeting, and kid-watching to named adults",
    "Party week",
    "The grill already needs full attention; named owners stop safety and hosting jobs from competing.",
    "timeline",
  ),
  playbookTask(
    "Separate raw-food tools and trays from ready-to-eat food and serving tools",
    "Party week",
    "Visible separation reduces cross-contamination when several people are cooking and serving.",
    "shopping",
  ),
  playbookTask(
    "Plan shade, water, seating, handwashing, bug control, and bathroom access",
    "Party week",
    "Outdoor comfort basics determine how long guests can safely and happily stay.",
    "shopping",
  ),
  playbookTask(
    "Stage a food thermometer, clean platters, cooler ice, and a discard-time marker",
    "Day of",
    "The right tools make safe temperatures and buffet timing easy to follow while hosting.",
    "shopping",
  ),
  playbookTask(
    "Place the grill outdoors, away from structures and the main guest path",
    "Day of",
    "A deliberate grill zone protects people, structures, and the cook's working space.",
    "timeline",
  ),
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
  const band = birthdayAgeBand(age, input.profile?.honoreeLifeStage);

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

  if (input.occasion === "birthday" && band === "school-age") {
    return {
      id: "birthday-school-age-v1",
      title: `${age ? `${ordinal(age)} birthday` : "School-age birthday"} with room to actually play`,
      promise:
        "One memorable anchor, enough unstructured social time, clear parent handoffs, and the practical details families need before they arrive.",
      ageBand: band,
      recommendedDurationMinutes: 150,
      tasks: SCHOOL_AGE_BIRTHDAY_TASKS,
      timeline: timedTimeline(input.startTime, [
        { offset: 0, activity: "Arrival activity and easy check-in while everyone lands" },
        { offset: 20, activity: "Main activity, game, workshop, or venue play begins" },
        { offset: 75, activity: "Food, water, and a social reset" },
        { offset: 105, activity: "Cake, candles, and the birthday moment" },
        { offset: 125, activity: "Flexible play, photos, and take-home items" },
        { offset: 150, activity: "Clear pickup window and adult handoff" },
      ]),
      rsvpQuestions: [
        "Which invited children and siblings are coming?",
        "Will an adult stay, or will this be drop-off and pickup?",
        "Any allergies, dietary needs, or participation accommodations?",
        "Does your child need a waiver, specific clothing, or equipment?",
        "Who should the host contact if pickup plans change?",
      ],
      guardrails: [
        {
          id: "school-age-duration",
          title: "Give school-age play enough room",
          detail:
            "Use roughly two to three hours as a starting range, then shorten it for a high-intensity venue or lengthen only when the format supports real downtime.",
          source: "American Academy of Pediatrics",
          level: "recommendation",
        },
        {
          id: "school-age-one-anchor",
          title: "Build around one anchor",
          detail:
            "Choose one activity worth remembering and leave flexible time around it instead of forcing children through a packed rotation.",
          source: "Confetti planning practice",
          level: "recommendation",
        },
        {
          id: "school-age-handoff",
          title: "Make supervision and pickup explicit",
          detail:
            "State whether adults stay, who is supervising, the exact pickup window, and how the host should handle a changed pickup plan.",
          source: "Confetti planning practice",
          level: "recommendation",
        },
        ...standardGuardrails(),
      ],
    };
  }

  if (input.occasion === "birthday" && band === "teen") {
    return {
      id: "birthday-teen-v1",
      title: `${age ? `${ordinal(age)} birthday` : "Teen birthday"} with room to be themselves`,
      promise:
        "A teen-chosen guest mix, one worthwhile anchor, real social time, and clear privacy, transport, and independence boundaries.",
      ageBand: band,
      recommendedDurationMinutes: 180,
      tasks: TEEN_BIRTHDAY_TASKS,
      timeline: timedTimeline(input.startTime, [
        { offset: 0, activity: "Easy arrival, music, food cue, and space to settle in" },
        { offset: 30, activity: "Teen-chosen activity, outing, meal, or shared experience" },
        { offset: 95, activity: "Food, conversation, and flexible social time" },
        { offset: 125, activity: "Cake, dessert, photos, or a shared moment—only as agreed" },
        { offset: 150, activity: "Unstructured hangout and first ride check" },
        { offset: 180, activity: "Clear pickup, transport, payment, and host closeout" },
      ]),
      rsvpQuestions: [
        "Can you make it, and will you arrive with anyone else on the invitation?",
        "Any allergies, dietary needs, accessibility needs, or activity boundaries?",
        "Do you need a ride, have your own ride, or will an adult pick you up?",
        "Do you need a waiver, specific clothing, or equipment?",
        "Is it okay to include you in group photos, or would you rather not?",
      ],
      guardrails: [
        {
          id: "teen-honoree-consent",
          title: "Let the teen define what feels celebratory",
          detail:
            "Confirm the guest mix, surprises, speeches, photos, posting, music, and family involvement with the teen before committing.",
          source: "Confetti planning practice",
          level: "recommendation",
        },
        {
          id: "teen-independence-boundaries",
          title: "Make independence and supervision visible",
          detail:
            "Agree on where adults will be, how the group can move through the venue or neighborhood, and how the host will handle a changed ride or pickup.",
          source: "Confetti planning practice",
          level: "recommendation",
        },
        ...standardGuardrails(),
      ],
    };
  }

  if (input.occasion === "birthday" && band === "adult") {
    return {
      id: "birthday-adult-v1",
      title: `A ${age ? ordinal(age) : "grown-up"} birthday that feels like the person`,
      promise:
        "The guest mix, hosting load, food, setting, and meaningful moments follow a clear celebration brief—so the result is personal without becoming overproduced.",
      ageBand: band,
      recommendedDurationMinutes: 180,
      tasks: ADULT_BIRTHDAY_TASKS,
      timeline: timedTimeline(input.startTime, [
        { offset: 0, activity: "Arrival drink, food cue, and a clear place to land" },
        { offset: 30, activity: "Guests settle into the main activity or conversation" },
        { offset: 90, activity: "Shared moment: toast, story, surprise, or activity reveal" },
        { offset: 115, activity: "Cake, dessert, and photos without stopping the whole night" },
        { offset: 150, activity: "Last food or drink wave and a natural wind-down" },
        { offset: 180, activity: "Rides, leftovers, gifts, payment, and host closeout" },
      ]),
      rsvpQuestions: [
        "Can you make it, and are you bringing a guest?",
        "Any allergies, dietary needs, or foods you avoid?",
        "Anything that would make seating, sound, or access more comfortable?",
        "Will you join from the start or arrive later?",
        "Would you like to contribute a photo, story, toast, song, or practical help?",
      ],
      guardrails: [
        {
          id: "adult-honoree-consent",
          title: "Celebrate the person, not the planner's performance",
          detail:
            "Confirm the guest of honor's comfort with surprises, public attention, photos, speeches, and who is invited before locking the plan.",
          source: "Confetti planning practice",
          level: "recommendation",
        },
        {
          id: "adult-one-shared-moment",
          title: "Create one meaningful shared moment",
          detail:
            "One intentional toast, story, activity, or reveal is usually more memorable than a night packed with programmed beats.",
          source: "Confetti planning practice",
          level: "recommendation",
        },
        {
          id: "adult-buffet-window",
          title: "Serve food in safe waves",
          detail:
            "Keep cold food at 40°F or below and hot food at 140°F or above; replace smaller platters and discard perishables left at room temperature beyond two hours.",
          source: "USDA",
          level: "safety",
        },
        ...standardGuardrails(),
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

  if (input.occasion === "baby-shower") {
    return {
      id: "baby-shower-v1",
      title: "A baby shower that feels supportive, not performative",
      promise:
        "The parents set the boundaries; Confetti handles guest expectations, comfort, food, optional moments, gifts, and ownership without assuming gender, tradition, or family structure.",
      recommendedDurationMinutes: 150,
      tasks: BABY_SHOWER_TASKS,
      timeline: timedTimeline(input.startTime, [
        {
          offset: 0,
          activity: "Guests arrive, find food and drinks, and settle without a forced start",
        },
        { offset: 25, activity: "Welcome and one optional shared activity or conversation prompt" },
        { offset: 65, activity: "Main food wave and unstructured time with the parents" },
        {
          offset: 100,
          activity: "Optional stories, advice, gifts, or another parent-approved moment",
        },
        { offset: 130, activity: "Dessert, photos, and a gentle wind-down" },
        { offset: 150, activity: "Gifts, leftovers, and the parents' trip home are handed off" },
      ]),
      rsvpQuestions: [
        "How many adults and children are coming with you?",
        "Any allergies, dietary needs, or foods you avoid?",
        "Anything that would make seating, sound, access, or participation more comfortable?",
        "Would you like to contribute food, setup, a story, or practical help?",
        "Will you join from the start or arrive later?",
      ],
      guardrails: [
        {
          id: "baby-shower-parent-boundaries",
          title: "Let the parents set the boundaries",
          detail:
            "Ask before planning surprises, games, belly touching, advice rounds, gift opening, photos, names, gendered language, or public posts.",
          source: "Confetti planning practice",
          level: "recommendation",
        },
        {
          id: "baby-shower-inclusive-language",
          title: "Use the family's own language",
          detail:
            "Mirror the names, roles, pronouns, family structure, and celebration language the parents choose instead of treating one path to parenthood as universal.",
          source: "Confetti planning practice",
          level: "recommendation",
        },
        ...standardGuardrails(),
      ],
    };
  }

  if (input.occasion === "graduation") {
    return {
      id: "graduation-v1",
      title: "A graduation celebration centered on the graduate",
      promise:
        "Ceremony timing, mixed guest groups, food waves, memories, privacy, cards, and the trip home have clear owners—so the graduate gets to be present.",
      recommendedDurationMinutes: 180,
      tasks: GRADUATION_TASKS,
      timeline: timedTimeline(input.startTime, [
        { offset: 0, activity: "First arrivals land; food and a clear welcome are ready" },
        {
          offset: 35,
          activity: "Graduate and ceremony group arrive to a saved plate and easy reset",
        },
        {
          offset: 70,
          activity: "Main food wave and open time across family, friends, and mentors",
        },
        {
          offset: 110,
          activity: "Graduate-approved toast, stories, photos, or recognition moment",
        },
        { offset: 140, activity: "Dessert and a final food wave for later arrivals" },
        {
          offset: 180,
          activity: "Cards, gifts, leftovers, rides, and cleanup transfer to named owners",
        },
      ]),
      rsvpQuestions: [
        "How many adults and children are coming with you?",
        "Will you join from the start, after the ceremony, or later in the open-house window?",
        "Any allergies, dietary needs, or foods you avoid?",
        "Anything that would make parking, seating, sound, or access more comfortable?",
        "Would you like to contribute a photo, story, toast, food, or practical help?",
      ],
      guardrails: [
        {
          id: "graduation-graduate-consent",
          title: "Get the graduate's yes before the spotlight",
          detail:
            "Confirm comfort with surprises, speeches, photos, school details, awards, displays, and public sharing before making them part of the event.",
          source: "Confetti planning practice",
          level: "recommendation",
        },
        {
          id: "graduation-card-security",
          title: "Give cards and gifts one protected handoff",
          detail:
            "Use one visible, monitored collection point and name the person who will take cards, cash, gifts, and keepsakes home.",
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
      guidanceSource: "curated" as const,
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
    return previous
      ? {
          ...task,
          id: previous.id,
          done: previous.done,
          owner: previous.owner,
          handoffNotes: previous.handoffNotes,
          ownerStatus: previous.ownerStatus,
        }
      : task;
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
