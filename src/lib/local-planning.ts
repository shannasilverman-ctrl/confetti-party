import type { OccasionType } from "./party-context";
import {
  birthdayAgeBand,
  preschoolPartyPaths,
  type PartyPlanningProfile,
} from "./party-intelligence";

export type LocalPlanningKind = "venue" | "food" | "experience" | "at-home";

export type LocalPlanningSuggestion = {
  id: string;
  kind: LocalPlanningKind;
  title: string;
  reason: string;
  searchLabel?: string;
  searchUrl?: string;
  action?: "theme" | "shopping";
};

export type LocalPlanningInput = {
  occasion: OccasionType;
  guestEstimate: number;
  budget: number;
  location?: string;
  planningProfile?: PartyPlanningProfile;
};

const GENERIC_LOCATIONS = [
  /^our (place|home|house|backyard)$/i,
  /^home$/i,
  /^backyard$/i,
  /^tbd$/i,
  /^to be decided$/i,
];

export function locationIsSpecific(location?: string): boolean {
  const value = location?.trim();
  if (!value || value.length < 3) return false;
  return !GENERIC_LOCATIONS.some((pattern) => pattern.test(value));
}

export function mapsSearchUrl(query: string, location?: string): string {
  const locality = locationIsSpecific(location) ? ` near ${location!.trim()}` : " near me";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${query}${locality}`)}`;
}

type SuggestionSeed = Omit<LocalPlanningSuggestion, "searchUrl"> & { query?: string };

const OCCASION_SUGGESTIONS: Record<OccasionType, SuggestionSeed[]> = {
  birthday: [
    {
      id: "birthday-flexible-space",
      kind: "venue",
      title: "Flexible birthday space",
      reason:
        "Compare spaces by headcount, seating, sound, accessibility, food rules, and the kind of celebration you actually want.",
      query: "birthday private event space",
      searchLabel: "Compare nearby spaces",
    },
    {
      id: "birthday-easy-food",
      kind: "food",
      title: "Easy food + cake path",
      reason:
        "Compare prepared food, drop-off catering, and a bakery before deciding what the host should make.",
      query: "birthday drop-off catering party platters bakery",
      searchLabel: "Search food options",
    },
    {
      id: "birthday-at-home",
      kind: "at-home",
      title: "At-home theme plan",
      reason:
        "Keep the venue cost down and turn one visual direction into décor, games, and a list.",
      action: "theme",
    },
  ],
  graduation: [
    {
      id: "graduation-space",
      kind: "venue",
      title: "Backyard backup or pavilion",
      reason: "Compare park shelters and casual event spaces sized for an open-house guest flow.",
      query: "graduation party pavilion event space",
      searchLabel: "Search spaces",
    },
    {
      id: "graduation-food",
      kind: "food",
      title: "BBQ or drop-off catering",
      reason: "Price a staffed caterer against drop-off trays before locking the menu.",
      query: "graduation party BBQ drop-off catering",
      searchLabel: "Search caterers",
    },
    {
      id: "graduation-photo",
      kind: "experience",
      title: "Photo moment",
      reason:
        "Find a local balloon or backdrop vendor, or build the same moment from the theme tab.",
      query: "graduation balloon backdrop vendor",
      searchLabel: "Search backdrop help",
    },
  ],
  "game-day": [
    {
      id: "game-day-food",
      kind: "food",
      title: "Halftime food without cooking",
      reason:
        "Compare Italian trays, wings, and grocery-prepared platters for the actual headcount.",
      query: "game day party catering Italian trays wings party platters",
      searchLabel: "Search food options",
    },
    {
      id: "game-day-watch",
      kind: "venue",
      title: "Bigger-screen backup",
      reason:
        "Check family-friendly watch venues if seating, sound, or the stream at home feels tight.",
      query: "family friendly sports watch party venue",
      searchLabel: "Search watch venues",
    },
    {
      id: "game-day-at-home",
      kind: "at-home",
      title: "Stadium-at-home setup",
      reason: "Use zones for the screen, snacks, drinks, and kids so the room runs itself.",
      action: "shopping",
    },
  ],
  cookout: [
    {
      id: "cookout-food",
      kind: "food",
      title: "Grill help or prepared sides",
      reason: "Compare BBQ catering with grocery-prepared sides, buns, desserts, and ice.",
      query: "BBQ catering grocery prepared party sides",
      searchLabel: "Search food options",
    },
    {
      id: "cookout-space",
      kind: "venue",
      title: "Weather-safe space",
      reason: "Check pavilions and casual rental spaces before the forecast becomes urgent.",
      query: "park pavilion cookout rental",
      searchLabel: "Search spaces",
    },
    {
      id: "cookout-rentals",
      kind: "experience",
      title: "Shade + seating rental",
      reason:
        "Price tents, folding chairs, and tables only if the home setup cannot cover the count.",
      query: "party tent table chair rental",
      searchLabel: "Search rentals",
    },
  ],
  holiday: [
    {
      id: "holiday-food",
      kind: "food",
      title: "Prepared holiday meal path",
      reason: "Compare grocery-prepared mains and sides against local drop-off catering.",
      query: "holiday meal catering prepared dinner",
      searchLabel: "Search meal options",
    },
    {
      id: "holiday-dessert",
      kind: "food",
      title: "Dessert solved locally",
      reason: "Find a bakery that can cover one memorable dessert without adding another recipe.",
      query: "holiday dessert bakery",
      searchLabel: "Search bakeries",
    },
    {
      id: "holiday-at-home",
      kind: "at-home",
      title: "Who-brings-what plan",
      reason: "Turn the menu into clear guest contributions and keep duplicates off the table.",
      action: "shopping",
    },
  ],
  "dinner-party": [
    {
      id: "dinner-food",
      kind: "food",
      title: "Local dinner shortcut",
      reason:
        "Compare restaurant family trays, prepared grocery options, and a private chef only if useful.",
      query: "dinner party drop-off catering family trays",
      searchLabel: "Search dinner options",
    },
    {
      id: "dinner-dessert",
      kind: "food",
      title: "Bakery finish",
      reason: "Outsource dessert and keep your attention on the meal and the table.",
      query: "local bakery dinner party dessert",
      searchLabel: "Search bakeries",
    },
    {
      id: "dinner-at-home",
      kind: "at-home",
      title: "Set the table direction",
      reason: "Choose a visual plan, then add only the pieces the room actually needs.",
      action: "theme",
    },
  ],
  "baby-shower": [
    {
      id: "shower-space",
      kind: "venue",
      title: "Comfort-first venue",
      reason: "Compare tea rooms, private dining rooms, and accessible event spaces.",
      query: "baby shower tea room private dining event space",
      searchLabel: "Search venues",
    },
    {
      id: "shower-food",
      kind: "food",
      title: "Brunch or tea catering",
      reason: "Price drop-off brunch and grazing trays before building a menu from scratch.",
      query: "baby shower brunch tea catering",
      searchLabel: "Search catering",
    },
    {
      id: "shower-at-home",
      kind: "at-home",
      title: "At-home shower plan",
      reason: "Create a polished table, one activity, and one photo spot without over-programming.",
      action: "theme",
    },
  ],
  other: [
    {
      id: "other-space",
      kind: "venue",
      title: "Right-size the space",
      reason: "Compare casual event spaces using the guest count before you pay for unused room.",
      query: "casual private event space",
      searchLabel: "Search spaces",
    },
    {
      id: "other-food",
      kind: "food",
      title: "Food that matches the effort",
      reason:
        "Compare grocery-prepared, restaurant trays, and catering instead of defaulting to one.",
      query: "party platters drop-off catering restaurant trays",
      searchLabel: "Search food options",
    },
    {
      id: "other-at-home",
      kind: "at-home",
      title: "Build the at-home version",
      reason: "Start with a visual direction, then let Confetti turn it into concrete setup work.",
      action: "theme",
    },
  ],
};

export function localPlanningSuggestions(input: LocalPlanningInput): LocalPlanningSuggestion[] {
  const birthdayBand =
    input.occasion === "birthday" ? birthdayAgeBand(input.planningProfile?.honoreeAge) : undefined;

  const seeds: SuggestionSeed[] =
    input.occasion === "birthday"
      ? birthdaySuggestions(input, birthdayBand)
      : rankForHost(OCCASION_SUGGESTIONS[input.occasion], input.planningProfile);

  const kids = input.planningProfile?.expectedKids;
  const adults = input.planningProfile?.expectedAdults;
  const audienceContext =
    birthdayBand !== "preschool" && (kids != null || adults != null)
      ? ` The working audience is ${kids ?? 0} children and ${adults ?? 0} adults.`
      : "";

  return seeds.map(({ query, ...suggestion }) => ({
    ...suggestion,
    searchUrl: query ? mapsSearchUrl(query, input.location) : undefined,
    reason: `${
      suggestion.kind === "venue" && input.guestEstimate >= 30
        ? `${suggestion.reason} Your current estimate is ${input.guestEstimate} guests.`
        : suggestion.reason
    }${audienceContext}`,
  }));
}

function birthdaySuggestions(
  input: LocalPlanningInput,
  band: ReturnType<typeof birthdayAgeBand>,
): SuggestionSeed[] {
  if (band === "preschool") return preschoolBirthdaySuggestions(input);

  const seeds =
    band === "toddler"
      ? TODDLER_BIRTHDAY_SUGGESTIONS
      : band === "school-age"
        ? SCHOOL_AGE_BIRTHDAY_SUGGESTIONS
        : band === "teen"
          ? TEEN_BIRTHDAY_SUGGESTIONS
          : band === "adult"
            ? ADULT_BIRTHDAY_SUGGESTIONS
            : OCCASION_SUGGESTIONS.birthday;
  return rankForHost(seeds, input.planningProfile);
}

const TODDLER_BIRTHDAY_SUGGESTIONS: SuggestionSeed[] = [
  {
    id: "birthday-toddler-space",
    kind: "venue",
    title: "Toddler-ready space",
    reason:
      "Compare a short-list for safe movement, close supervision, changing access, bathrooms, quiet space, food rules, and a compact party window.",
    query: "toddler birthday party venue parent supervised play space",
    searchLabel: "Compare toddler-ready spaces",
  },
  {
    id: "birthday-toddler-food",
    kind: "food",
    title: "Simple child-and-adult food",
    reason:
      "Keep the menu easy to identify and serve, collect allergy details, and plan food for the accompanying adults too.",
    query: "toddler birthday catering fruit platter allergy aware cake",
    searchLabel: "Compare food nearby",
  },
  {
    id: "birthday-toddler-home",
    kind: "at-home",
    title: "Short at-home play party",
    reason:
      "Use an easy arrival zone, one sensory or movement activity, food and cake, and a calm ending without over-programming.",
    action: "theme",
  },
];

const SCHOOL_AGE_BIRTHDAY_SUGGESTIONS: SuggestionSeed[] = [
  {
    id: "birthday-school-age-experience",
    kind: "venue",
    title: "One memorable activity",
    reason:
      "Compare one age-fitting anchor—creative, active, gaming, or hands-on—plus supervision, waivers, food, accessibility, and pickup rules.",
    query: "school age birthday group activity venue",
    searchLabel: "Compare activity venues",
  },
  {
    id: "birthday-school-age-food",
    kind: "food",
    title: "Food for play and grown-ups",
    reason:
      "Choose food that is quick to serve between activities, with clear allergy details and enough for the adults who stay.",
    query: "kids birthday pizza catering fruit tray allergy aware bakery",
    searchLabel: "Compare food nearby",
  },
  {
    id: "birthday-school-age-home",
    kind: "at-home",
    title: "At-home activity party",
    reason:
      "Build around one strong activity, flexible social time, food and cake, and a clear pickup rather than a packed rotation.",
    action: "theme",
  },
];

const TEEN_BIRTHDAY_SUGGESTIONS: SuggestionSeed[] = [
  {
    id: "birthday-teen-experience",
    kind: "experience",
    title: "A teen-chosen experience",
    reason:
      "Shortlist one social experience the guest of honor actually wants, then compare age rules, transport, food, accessibility, and group logistics.",
    query: "teen birthday group experience private event",
    searchLabel: "Compare group experiences",
  },
  {
    id: "birthday-teen-food",
    kind: "food",
    title: "Food that can flex with the hangout",
    reason:
      "Compare easy drop-off food, drinks, and dessert that can be served without interrupting the main experience.",
    query: "teen birthday drop-off catering dessert bakery",
    searchLabel: "Compare food nearby",
  },
  {
    id: "birthday-teen-home",
    kind: "at-home",
    title: "At-home hangout with one anchor",
    reason:
      "Let the teen choose the music, food, guest mix, and one optional shared activity while the host quietly covers comfort and safety.",
    action: "theme",
  },
];

const ADULT_BIRTHDAY_SUGGESTIONS: SuggestionSeed[] = [
  {
    id: "birthday-adult-space",
    kind: "venue",
    title: "A celebration space that fits the person",
    reason:
      "Compare private dining and flexible gathering spaces by conversation level, seating, accessibility, food and drink rules, privacy, and the real guest count.",
    query: "adult birthday private dining flexible event space",
    searchLabel: "Compare celebration spaces",
  },
  {
    id: "birthday-adult-food",
    kind: "food",
    title: "Food and cake without losing the host",
    reason:
      "Compare restaurant trays, drop-off catering, prepared food, and a bakery so the host can be present for the celebration.",
    query: "adult birthday drop-off catering restaurant trays bakery",
    searchLabel: "Compare food nearby",
  },
  {
    id: "birthday-adult-home",
    kind: "at-home",
    title: "At-home gathering with one shared moment",
    reason:
      "Shape the room around arrivals, conversation, food and drinks, then add one toast, story, activity, or surprise that suits the guest of honor.",
    action: "theme",
  },
];

function rankForHost(
  seeds: SuggestionSeed[],
  profile: PartyPlanningProfile | undefined,
): SuggestionSeed[] {
  if (!profile) return seeds;
  const score = (seed: SuggestionSeed): number => {
    if (profile.format === "home") {
      if (seed.kind === "at-home") return 0;
      if (seed.kind === "food") return 1;
      return 2;
    }
    if (profile.format === "venue") {
      if (seed.kind === "venue") return 0;
      if (seed.kind === "food") return 1;
      return 2;
    }
    if (profile.effort === "easy") {
      if (seed.kind === "food") return 0;
      if (seed.kind === "venue") return 1;
      return 2;
    }
    return seeds.indexOf(seed);
  };
  return [...seeds].sort((a, b) => score(a) - score(b));
}

function preschoolBirthdaySuggestions(input: LocalPlanningInput): SuggestionSeed[] {
  const profile = input.planningProfile!;
  const age = profile.honoreeAge!;
  const kids = profile.expectedKids;
  const adults = profile.expectedAdults;
  const audience =
    kids || adults
      ? `The current plan is ${kids ?? "?"} children and ${adults ?? "?"} adults.`
      : "Confirm children and adults separately before comparing packages.";
  const venue: SuggestionSeed = {
    id: "birthday-preschool-venue",
    kind: "venue",
    title: "Active venue with the cleanup included",
    reason: `For a ${age}-year-old, prioritize contained active play, clear supervision, bathrooms, and a package that fits a 90-minute flow. ${audience}`,
    query: `preschool ${age} year old birthday party indoor play gym venue`,
    searchLabel: "Compare nearby venues",
  };
  const home: SuggestionSeed = {
    id: "birthday-preschool-home",
    kind: "at-home",
    title: "Simple at-home play party",
    reason:
      "Use one easy arrival activity, one main activity, food, cake, and free play. Confetti will keep the shopping and transitions intentionally short.",
    action: "theme",
  };
  const food: SuggestionSeed = {
    id: "birthday-preschool-food",
    kind: "food",
    title: "Pizza, fruit, water, and one great cake",
    reason:
      "Compare a simple child-and-adult food path before adding themed extras. Confirm allergies and ingredient details first.",
    query: "kids birthday pizza catering fruit tray allergy aware birthday cake",
    searchLabel: "Compare food nearby",
  };

  const resolvedFormat =
    profile.format === "help-me-choose" ? preschoolPartyPaths(profile)[0]?.format : profile.format;
  if (resolvedFormat === "home") return [home, food, venue];
  if (resolvedFormat === "venue" || profile.effort === "easy") return [venue, food, home];
  if (input.budget > 0 && input.budget < 350) return [home, food, venue];
  return [venue, home, food];
}
