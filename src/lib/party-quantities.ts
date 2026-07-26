import type { FoodRole, FoodServiceStyle, PartyPlanningProfile } from "./party-intelligence";
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
  confidence: "starting" | "tuned";
  knownFacts: string[];
  assumptions: string[];
  openQuestions: Array<"food-role" | "duration" | "service-style">;
  note: string;
};

export function quantityTuningDefaults(context: {
  occasion?: OccasionType;
}): Required<Pick<PartyPlanningProfile, "foodRole" | "foodServiceStyle" | "durationMinutes">> {
  return {
    foodRole:
      context.occasion === "game-day"
        ? "grazing"
        : context.occasion === "other"
          ? "light-bites"
          : "full-meal",
    foodServiceStyle: defaultServiceStyle(context.occasion),
    durationMinutes: defaultDurationMinutes(context.occasion),
  };
}

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

  const defaults = quantityTuningDefaults(context);
  const defaultDuration = defaults.durationMinutes;
  const durationMinutes = clampDuration(profile.durationMinutes) ?? defaultDuration;
  const defaultService = defaults.foodServiceStyle;
  const serviceStyle = profile.foodServiceStyle ?? defaultService;
  const tableware = Math.ceil(total * tablewareMultiplier(serviceStyle));
  const baseEstimates =
    profile.foodRole === "light-bites"
      ? lightBiteEstimates(children, total, tableware, context.occasion)
      : profile.foodRole === "grazing"
        ? grazingEstimates(children, total, tableware, durationMinutes, context.occasion)
        : context.occasion === "holiday" || context.occasion === "dinner-party"
          ? mealEstimates(total, tableware, context.holidayPackId)
          : context.occasion === "game-day"
            ? gameDayEstimates(total, tableware)
            : context.occasion === "cookout"
              ? cookoutEstimates(children, adults, total, tableware)
              : birthdayEstimates(children, adults, total, tableware);
  const estimates = tuneDurationAndService(
    baseEstimates,
    total,
    durationMinutes,
    serviceStyle,
    profile.durationMinutes != null,
    profile.foodServiceStyle != null,
  );
  const openQuestions: PartyQuantityPlan["openQuestions"] = [
    ...(!profile.foodRole ? (["food-role"] as const) : []),
    ...(profile.durationMinutes == null ? (["duration"] as const) : []),
    ...(!profile.foodServiceStyle ? (["service-style"] as const) : []),
  ];
  const knownFacts = [
    `${children} ${children === 1 ? "child" : "children"}`,
    `${adults} ${adults === 1 ? "adult" : "adults"}`,
    ...(profile.foodRole ? [foodRoleLabel(profile.foodRole)] : []),
    ...(profile.durationMinutes != null ? [durationLabel(durationMinutes)] : []),
    ...(profile.foodServiceStyle ? [serviceStyleLabel(profile.foodServiceStyle)] : []),
  ];
  const assumptions = [
    ...(!profile.foodRole
      ? [
          `Food role inferred from ${occasionLabel(context.occasion)}; confirm whether this replaces a meal.`,
        ]
      : []),
    ...(profile.durationMinutes == null
      ? [`${durationLabel(defaultDuration)} assumed until you set the real duration.`]
      : []),
    ...(!profile.foodServiceStyle
      ? [`${serviceStyleLabel(defaultService)} assumed from the gathering type.`]
      : []),
  ];

  return {
    children,
    adults,
    total,
    estimates,
    confidence: openQuestions.length === 0 ? "tuned" : "starting",
    knownFacts,
    assumptions,
    openQuestions,
    note: "Planning guidance—not a vendor guarantee. Convert servings into real packages using the recipe yield or caterer’s stated serving size, then adjust for appetite, leftovers, and dietary needs.",
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

function lightBiteEstimates(
  children: number,
  total: number,
  tableware: number,
  occasion?: OccasionType,
): QuantityEstimate[] {
  const birthday = occasion === "birthday";
  return [
    {
      id: "snack-servings",
      label: "Small bites",
      recommendation: range(total * 3, total * 5),
      assumption: "Three to five bite-size pieces each when food is not replacing lunch or dinner.",
      confidence: "estimate",
    },
    ...(birthday
      ? [
          {
            id: "cake" as const,
            label: "Cake servings",
            recommendation: String(Math.ceil(total * 1.1)),
            assumption: "One serving per attendee plus a 10% cushion.",
            confidence: "estimate" as const,
          },
        ]
      : []),
    {
      id: "drinks",
      label: "Drink servings",
      recommendation: range(total, total * 2),
      assumption: "One to two servings each before duration tuning.",
      confidence: "estimate",
    },
    tablewareEstimate(tableware),
    ...(birthday && children > 0
      ? [
          {
            id: "favors" as const,
            label: "Child favors",
            recommendation: String(children + 1),
            assumption: "One per child plus one backup; favors are optional.",
            confidence: "estimate" as const,
          },
        ]
      : []),
  ];
}

function grazingEstimates(
  children: number,
  total: number,
  tableware: number,
  durationMinutes: number,
  occasion?: OccasionType,
): QuantityEstimate[] {
  const hoursAfterFirst = Math.max(0, Math.ceil(durationMinutes / 60) - 1);
  const minPerPerson = 6 + hoursAfterFirst * 4;
  const maxPerPerson = 10 + hoursAfterFirst * 6;
  const birthday = occasion === "birthday";
  return [
    {
      id: "snack-servings",
      label: "Small bites",
      recommendation: range(total * minPerPerson, total * maxPerPerson),
      assumption: `Six to ten pieces in the first hour, then four to six more per person for each additional hour.`,
      confidence: "estimate",
    },
    ...(birthday
      ? [
          {
            id: "cake" as const,
            label: "Cake servings",
            recommendation: String(Math.ceil(total * 1.1)),
            assumption: "One serving per attendee plus a 10% cushion.",
            confidence: "estimate" as const,
          },
        ]
      : []),
    {
      id: "drinks",
      label: "Drink servings",
      recommendation: range(total * 2, total * 3),
      assumption: "Starting range before duration tuning, including water.",
      confidence: "estimate",
    },
    tablewareEstimate(tableware),
    ...(birthday && children > 0
      ? [
          {
            id: "favors" as const,
            label: "Child favors",
            recommendation: String(children + 1),
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

function tuneDurationAndService(
  estimates: QuantityEstimate[],
  total: number,
  durationMinutes: number,
  serviceStyle: FoodServiceStyle,
  durationIsKnown: boolean,
  serviceIsKnown: boolean,
): QuantityEstimate[] {
  return estimates.map((estimate) => {
    if (estimate.id === "drinks" && durationIsKnown) {
      const [minPerPerson, maxPerPerson] =
        durationMinutes <= 120 ? [1, 2] : durationMinutes <= 180 ? [2, 3] : [3, 4];
      return {
        ...estimate,
        recommendation: range(total * minPerPerson, total * maxPerPerson),
        assumption: `${minPerPerson}–${maxPerPerson} total servings each across ${durationLabel(
          durationMinutes,
        ).toLowerCase()}, including water and non-alcoholic choices.`,
      };
    }
    if (estimate.id === "tableware" && serviceIsKnown) {
      const assumption =
        serviceStyle === "served"
          ? "One set per attendee plus a 10% spill/drop cushion for served places."
          : serviceStyle === "family-style"
            ? "One set per attendee plus a 15% cushion; add shared serving pieces separately."
            : "One set per attendee plus a 20% spill/drop cushion for self-service.";
      return { ...estimate, assumption };
    }
    return estimate;
  });
}

function defaultDurationMinutes(occasion?: OccasionType): number {
  if (occasion === "game-day" || occasion === "cookout") return 180;
  if (occasion === "holiday" || occasion === "dinner-party") return 150;
  return 120;
}

function defaultServiceStyle(occasion?: OccasionType): FoodServiceStyle {
  return occasion === "holiday" || occasion === "dinner-party" ? "family-style" : "self-serve";
}

function tablewareMultiplier(style: FoodServiceStyle): number {
  if (style === "served") return 1.1;
  if (style === "family-style") return 1.15;
  return 1.2;
}

function foodRoleLabel(role: FoodRole): string {
  if (role === "light-bites") return "Light bites—not a meal";
  if (role === "grazing") return "Food served throughout";
  return "Food replaces a meal";
}

function serviceStyleLabel(style: FoodServiceStyle): string {
  if (style === "family-style") return "Family-style service";
  if (style === "served") return "Portioned per guest";
  return "Self-serve food";
}

function durationLabel(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours} hr ${remaining} min`;
}

function occasionLabel(occasion?: OccasionType): string {
  if (!occasion || occasion === "other") return "the gathering type";
  return occasion.replace("-", " ");
}

function range(min: number, max: number): string {
  return min === max ? String(min) : `${min}–${max}`;
}

function clampCount(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(500, Math.floor(value ?? 0)));
}

function clampDuration(value: number | undefined): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.max(60, Math.min(720, Math.floor(value ?? 0)));
}
