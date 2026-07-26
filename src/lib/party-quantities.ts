import type { PartyPlanningProfile } from "./party-intelligence";

export type QuantityEstimate = {
  id: "pizza" | "cake" | "drinks" | "tableware" | "favors";
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
): PartyQuantityPlan | null {
  if (profile?.expectedKids == null && profile?.expectedAdults == null) return null;
  const children = clampCount(profile.expectedKids);
  const adults = clampCount(profile.expectedAdults);
  const total = children + adults;
  if (total < 1) return null;

  const pizzaMin = Math.max(1, Math.ceil((children * 1 + adults * 2) / 8));
  const pizzaMax = Math.max(pizzaMin, Math.ceil((children * 2 + adults * 3) / 8));
  const cakeServings = Math.ceil(total * 1.1);
  const drinksMin = total;
  const drinksMax = total * 2;
  const tableware = Math.ceil(total * 1.2);
  const favors = children > 0 ? children + 1 : 0;

  return {
    children,
    adults,
    total,
    estimates: [
      {
        id: "pizza",
        label: "Large pizzas",
        recommendation: pizzaMin === pizzaMax ? String(pizzaMin) : `${pizzaMin}–${pizzaMax}`,
        assumption: "8 slices each; children eat 1–2 slices and adults 2–3.",
        confidence: "estimate",
      },
      {
        id: "cake",
        label: "Cake servings",
        recommendation: String(cakeServings),
        assumption: "One serving per attendee plus a 10% cushion.",
        confidence: "estimate",
      },
      {
        id: "drinks",
        label: "Drink servings",
        recommendation: `${drinksMin}–${drinksMax}`,
        assumption: "One to two servings per attendee for a compact party.",
        confidence: "estimate",
      },
      {
        id: "tableware",
        label: "Plates + cups",
        recommendation: String(tableware),
        assumption: "One set per attendee plus a 20% spill/drop cushion.",
        confidence: "estimate",
      },
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
    ],
    note: "These are editable planning estimates, not nutrition or purchasing advice. Adjust for meal timing, serving format, appetite, leftovers, and vendor sizing.",
  };
}

function clampCount(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(500, Math.floor(value ?? 0)));
}
