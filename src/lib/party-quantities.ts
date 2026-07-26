import type { PartyPlanningProfile } from "./party-intelligence";
import type { OccasionType } from "./party-context";

export type QuantityEstimate = {
  id:
    | "pizza"
    | "cake"
    | "drinks"
    | "tableware"
    | "favors"
    | "meal-servings"
    | "side-servings"
    | "dessert-servings"
    | "grill-mains"
    | "snack-servings"
    | "ice";
  label: string;
  recommendation: string;
  assumption: string;
  confidence: "estimate";
};

export type PartyQuantityPlan = {
  children: number;
  adults: number;
  total: number;
  estimates: QuantityEstimate[];
  note: string;
};

/**
 * A transparent starting estimate, never a claim about appetite or a purchase
 * instruction. Ranges are intentionally preferred over fake precision.
 */
export function partyQuantityPlan(
  profile: PartyPlanningProfile | undefined,
  context: { occasion?: OccasionType; holidayPackId?: string } = {},
): PartyQuantityPlan | null {
  if (profile?.expectedKids == null && profile?.expectedAdults == null) return null;
  const children = clampCount(profile.expectedKids);
  const adults = clampCount(profile.expectedAdults);
  const total = children + adults;
  if (total < 1) return null;

  const tableware = Math.ceil(total * 1.2);
  const estimates =
    context.occasion === "holiday" || context.occasion === "dinner-party"
      ? mealEstimates(total, tableware, context.holidayPackId)
      : context.occasion === "game-day"
        ? gameDayEstimates(total, tableware)
        : context.occasion === "cookout"
          ? cookoutEstimates(children, adults, total, tableware)
          : birthdayEstimates(children, adults, total, tableware);

  return {
    children,
    adults,
    total,
    estimates,
    note: "These are editable planning estimates, not nutrition or purchasing advice. Adjust for meal timing, serving format, appetite, leftovers, and vendor sizing.",
  };
}

function birthdayEstimates(
  children: number,
  adults: number,
  total: number,
  tableware: number,
): QuantityEstimate[] {
  const pizzaMin = Math.max(1, Math.ceil((children * 1 + adults * 2) / 8));
  const pizzaMax = Math.max(pizzaMin, Math.ceil((children * 2 + adults * 3) / 8));
  const favors = children > 0 ? children + 1 : 0;
  return [
    {
      id: "pizza",
      label: "Large pizzas",
      recommendation: range(pizzaMin, pizzaMax),
      assumption: "8 slices each; children eat 1–2 slices and adults 2–3.",
      confidence: "estimate",
    },
    {
      id: "cake",
      label: "Cake servings",
      recommendation: String(Math.ceil(total * 1.1)),
      assumption: "One serving per attendee plus a 10% cushion.",
      confidence: "estimate",
    },
    {
      id: "drinks",
      label: "Drink servings",
      recommendation: range(total, total * 2),
      assumption: "One to two servings per attendee for a compact party.",
      confidence: "estimate",
    },
    tablewareEstimate(tableware),
    ...(children > 0
      ? [
          {
            id: "favors" as const,
            label: "Child favors",
            recommendation: String(favors),
            assumption: "One per child plus one backup; favors are optional.",
            confidence: "estimate" as const,
          },
        ]
      : []),
  ];
}

function mealEstimates(
  total: number,
  tableware: number,
  holidayPackId?: string,
): QuantityEstimate[] {
  const generous = holidayPackId === "thanksgiving" || holidayPackId === "christmas";
  const cushion = generous ? 1.2 : 1.1;
  return [
    {
      id: "meal-servings",
      label: "Main servings",
      recommendation: String(Math.ceil(total * cushion)),
      assumption: `${generous ? "A 20%" : "A 10%"} cushion for seconds, uneven portions, and a few leftovers.`,
      confidence: "estimate",
    },
    {
      id: "side-servings",
      label: "Side servings",
      recommendation: range(Math.ceil(total * 2), Math.ceil(total * 3)),
      assumption: "Two to three side portions per person across the full menu.",
      confidence: "estimate",
    },
    {
      id: "dessert-servings",
      label: "Dessert servings",
      recommendation: String(Math.ceil(total * 1.15)),
      assumption: "One portion each plus a 15% cushion.",
      confidence: "estimate",
    },
    {
      id: "drinks",
      label: "Drink servings",
      recommendation: range(total * 2, total * 3),
      assumption: "Two to three total servings each, including water and non-alcoholic choices.",
      confidence: "estimate",
    },
    tablewareEstimate(tableware),
  ];
}

function gameDayEstimates(total: number, tableware: number): QuantityEstimate[] {
  return [
    {
      id: "snack-servings",
      label: "Small bites",
      recommendation: range(total * 4, total * 6),
      assumption:
        "Four to six bite-size pieces per person before and during play; add a meal if needed.",
      confidence: "estimate",
    },
    {
      id: "meal-servings",
      label: "Hot-food servings",
      recommendation: range(total, Math.ceil(total * 1.25)),
      assumption:
        "One meal-size serving each, with a cushion when the game overlaps lunch or dinner.",
      confidence: "estimate",
    },
    {
      id: "drinks",
      label: "Drink servings",
      recommendation: range(total * 2, total * 3),
      assumption: "Two to three servings over a multi-hour game, always including water.",
      confidence: "estimate",
    },
    iceEstimate(total),
    tablewareEstimate(tableware),
  ];
}

function cookoutEstimates(
  children: number,
  adults: number,
  total: number,
  tableware: number,
): QuantityEstimate[] {
  const mainsMin = Math.ceil(children * 1 + adults * 1.25);
  const mainsMax = Math.ceil(children * 1.5 + adults * 2);
  return [
    {
      id: "grill-mains",
      label: "Grill mains",
      recommendation: range(mainsMin, mainsMax),
      assumption: "One to two burger-, hot-dog-, kebab-, or equivalent portions per guest.",
      confidence: "estimate",
    },
    {
      id: "side-servings",
      label: "Side servings",
      recommendation: range(total * 2, total * 3),
      assumption:
        "Two to three side portions per person across salads, fruit, chips, and hot sides.",
      confidence: "estimate",
    },
    {
      id: "drinks",
      label: "Drink servings",
      recommendation: range(total * 2, total * 3),
      assumption: "Two to three servings each for an outdoor gathering, with water easy to reach.",
      confidence: "estimate",
    },
    iceEstimate(total),
    tablewareEstimate(tableware),
  ];
}

function iceEstimate(total: number): QuantityEstimate {
  return {
    id: "ice",
    label: "10-lb ice bags",
    recommendation: range(Math.max(1, Math.ceil(total / 10)), Math.max(1, Math.ceil(total / 6))),
    assumption: "Drink ice only; food coolers need their own ice or frozen packs.",
    confidence: "estimate",
  };
}

function tablewareEstimate(tableware: number): QuantityEstimate {
  return {
    id: "tableware",
    label: "Plates + cups",
    recommendation: String(tableware),
    assumption: "One set per attendee plus a 20% spill/drop cushion.",
    confidence: "estimate",
  };
}

function range(min: number, max: number): string {
  return min === max ? String(min) : `${min}–${max}`;
}

function clampCount(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(500, Math.floor(value ?? 0)));
}
