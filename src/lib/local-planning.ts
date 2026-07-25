import type { OccasionType } from "./party-context";

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
      id: "birthday-active-venue",
      kind: "venue",
      title: "Active-play venue",
      reason: "Compare trampoline parks, play gyms, and indoor activity spaces before committing.",
      query: "kids birthday party active play venue",
      searchLabel: "Search venues",
    },
    {
      id: "birthday-easy-food",
      kind: "food",
      title: "Easy food + cake path",
      reason: "Check grocery party platters and bakeries, then compare against pizza delivery.",
      query: "grocery party platters birthday cake bakery",
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
  return OCCASION_SUGGESTIONS[input.occasion].map(({ query, ...suggestion }) => ({
    ...suggestion,
    searchUrl: query ? mapsSearchUrl(query, input.location) : undefined,
    reason:
      suggestion.kind === "venue" && input.guestEstimate >= 30
        ? `${suggestion.reason} Your current estimate is ${input.guestEstimate} guests.`
        : suggestion.reason,
  }));
}
