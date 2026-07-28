import type { BringCategory, BringItem, OccasionType } from "./party-context";
import type { PartyPlanningProfile } from "./party-intelligence";

export type BringBoardSuggestion = {
  category: BringCategory;
  label: string;
  qty: number;
  unit?: string;
  reason: string;
};

type SuggestionInput = {
  occasion: OccasionType;
  holidayPackId?: string;
  guestEstimate?: number;
  planningProfile?: PartyPlanningProfile;
};

/**
 * A small, occasion-aware contribution board—not a generic potluck dump.
 * Suggestions favor self-contained responsibilities that one household can
 * confidently claim without coordinating portions with another guest.
 */
export function bringBoardSuggestions(input: SuggestionInput): BringBoardSuggestion[] {
  const headcount = workingHeadcount(input);
  const iceBags = Math.max(1, Math.ceil(headcount / 10));
  const drinkServings = Math.max(8, Math.ceil(headcount * 1.25));

  if (input.occasion === "holiday" && input.holidayPackId === "shabbat") {
    return [
      suggestion("Main", "Challah", 2, "loaves", "Keeps one household responsible for the table."),
      suggestion(
        "Drinks",
        "Wine or grape juice",
        2,
        "bottles",
        "Includes a non-alcoholic ritual option.",
      ),
      suggestion(
        "Sides",
        "Ready-to-serve side",
        1,
        undefined,
        "Avoids another last-minute oven job.",
      ),
      suggestion("Dessert", "Dessert", 1, undefined, "A self-contained contribution."),
      suggestion("Drinks", "Water or seltzer", drinkServings, "servings", "Covers the full table."),
    ];
  }

  if (input.occasion === "holiday") {
    return [
      suggestion(
        "Sides",
        "Ready-to-serve side",
        1,
        undefined,
        "Protects the host's oven and prep time.",
      ),
      suggestion("Sides", "Salad or vegetable", 1, undefined, "Balances a rich holiday menu."),
      suggestion("Dessert", "Dessert", 1, undefined, "One household owns it end to end."),
      suggestion(
        "Drinks",
        "Non-alcoholic drinks",
        drinkServings,
        "servings",
        "Makes every guest feel considered.",
      ),
      suggestion(
        "Ice / Serveware",
        "Bagged ice",
        iceBags,
        "10-lb bags",
        "Drink ice stays separate from food cooling.",
      ),
      suggestion(
        "Ice / Serveware",
        "Leftover containers",
        Math.max(6, Math.ceil(headcount / 2)),
        "containers",
        "Makes the end of the meal easier.",
      ),
    ];
  }

  if (input.occasion === "game-day") {
    return [
      suggestion("Sides", "Pregame snack", 1, "platter", "Gets food out before kickoff."),
      suggestion(
        "Main",
        "Halftime hot dish",
        1,
        undefined,
        "Creates a deliberate second food wave.",
      ),
      suggestion(
        "Dessert",
        "Handheld dessert",
        headcount,
        "pieces",
        "Easy to eat without missing play.",
      ),
      suggestion(
        "Drinks",
        "Water or seltzer",
        drinkServings,
        "servings",
        "Keeps the drink station stocked.",
      ),
      suggestion(
        "Ice / Serveware",
        "Bagged ice",
        iceBags,
        "10-lb bags",
        "Supports a multi-hour gathering.",
      ),
    ];
  }

  if (input.occasion === "cookout") {
    return [
      suggestion(
        "Sides",
        "Cold side or salad",
        1,
        "large bowl",
        "Arrives ready to serve away from the grill.",
      ),
      suggestion("Sides", "Fruit or cut vegetables", 1, "platter", "Adds a no-cook option."),
      suggestion(
        "Dessert",
        "Outdoor-friendly dessert",
        headcount,
        "servings",
        "Avoids a fragile dessert outdoors.",
      ),
      suggestion(
        "Drinks",
        "Water or seltzer",
        drinkServings,
        "servings",
        "Hydration should be easy to reach.",
      ),
      suggestion(
        "Ice / Serveware",
        "Bagged ice",
        iceBags,
        "10-lb bags",
        "Food coolers need separate ice.",
      ),
      suggestion("Kids", "Outdoor game", 1, undefined, "Gives children a clear activity zone."),
    ];
  }

  if (input.occasion === "dinner-party") {
    return [
      suggestion("Sides", "Arrival snack", 1, "platter", "Gives the host a buffer before dinner."),
      suggestion(
        "Sides",
        "Bread or ready-to-serve side",
        1,
        undefined,
        "Does not compete for the oven.",
      ),
      suggestion("Dessert", "Dessert", 1, undefined, "A clean responsibility to hand off."),
      suggestion(
        "Drinks",
        "Non-alcoholic drinks",
        drinkServings,
        "servings",
        "Pairs with any menu.",
      ),
      suggestion(
        "Ice / Serveware",
        "Bagged ice",
        iceBags,
        "10-lb bags",
        "Prevents a day-of convenience-store run.",
      ),
    ];
  }

  if (input.occasion === "birthday") {
    return [
      suggestion(
        "Sides",
        "Fruit or veggie platter",
        1,
        undefined,
        "Adds an easy option beside party food.",
      ),
      suggestion(
        "Drinks",
        "Water or juice",
        drinkServings,
        "servings",
        "Covers children and adults.",
      ),
      suggestion(
        "Ice / Serveware",
        "Bagged ice",
        iceBags,
        "10-lb bags",
        "One easy-to-forget day-of job.",
      ),
      suggestion(
        "Kids",
        "Extra wipes and paper towels",
        2,
        "packs",
        "Useful for spills and sticky hands.",
      ),
    ];
  }

  if (input.occasion === "baby-shower" || input.occasion === "graduation") {
    return [
      suggestion(
        "Sides",
        "Ready-to-serve appetizer",
        1,
        "platter",
        "Easy for one household to own.",
      ),
      suggestion("Dessert", "Handheld dessert", headcount, "pieces", "Works for a mingling crowd."),
      suggestion(
        "Drinks",
        "Non-alcoholic drinks",
        drinkServings,
        "servings",
        "Keeps the table inclusive.",
      ),
      suggestion("Ice / Serveware", "Bagged ice", iceBags, "10-lb bags", "Prevents a host errand."),
      suggestion(
        "Décor",
        "Card basket or memory station supplies",
        1,
        "set",
        "Captures the guest-of-honor moment.",
      ),
    ];
  }

  return [
    suggestion("Sides", "Ready-to-serve snack", 1, "platter", "A low-friction contribution."),
    suggestion("Dessert", "Dessert", 1, undefined, "One household owns it end to end."),
    suggestion(
      "Drinks",
      "Non-alcoholic drinks",
      drinkServings,
      "servings",
      "Works for almost any gathering.",
    ),
    suggestion("Ice / Serveware", "Bagged ice", iceBags, "10-lb bags", "A common day-of miss."),
  ];
}

export function missingBringBoardSuggestions(
  input: SuggestionInput,
  existing: BringItem[],
): BringBoardSuggestion[] {
  const known = new Set(existing.map((item) => suggestionKey(item)));
  return bringBoardSuggestions(input).filter((item) => !known.has(suggestionKey(item)));
}

function workingHeadcount(input: SuggestionInput): number {
  const profileTotal =
    (input.planningProfile?.expectedKids ?? 0) + (input.planningProfile?.expectedAdults ?? 0);
  const explicit = Number.isFinite(input.guestEstimate) ? Math.floor(input.guestEstimate ?? 0) : 0;
  return Math.max(1, Math.min(500, profileTotal || explicit || 12));
}

function suggestion(
  category: BringCategory,
  label: string,
  qty: number,
  unit: string | undefined,
  reason: string,
): BringBoardSuggestion {
  return { category, label, qty, ...(unit ? { unit } : {}), reason };
}

function suggestionKey(item: Pick<BringItem, "category" | "label">): string {
  return `${item.category}::${item.label.trim().toLocaleLowerCase()}`;
}
