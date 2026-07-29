import type { BudgetCategory, OccasionType } from "./party-context";

type BudgetTemplate = {
  name: string;
  weight: number;
};

const GENERAL_TEMPLATE: BudgetTemplate[] = [
  { name: "Venue", weight: 100 },
  { name: "Food & Drink", weight: 200 },
  { name: "Cake & Desserts", weight: 80 },
  { name: "Decorations", weight: 100 },
  { name: "Entertainment", weight: 80 },
  { name: "Favors", weight: 40 },
];

const GAME_DAY_TEMPLATE: BudgetTemplate[] = [
  { name: "Food & Snacks", weight: 120 },
  { name: "Drinks & Bar", weight: 100 },
  { name: "Paper Goods & Setup", weight: 40 },
  { name: "Décor", weight: 40 },
];

const COOKOUT_TEMPLATE: BudgetTemplate[] = [
  { name: "Grill & Food", weight: 200 },
  { name: "Drinks & Bar", weight: 100 },
  { name: "Sides & Dessert", weight: 80 },
  { name: "Paper Goods & Setup", weight: 50 },
  { name: "Décor", weight: 40 },
];

function templateFor(occasion: OccasionType): BudgetTemplate[] {
  if (occasion === "game-day") return GAME_DAY_TEMPLATE;
  if (occasion === "cookout") return COOKOUT_TEMPLATE;
  return GENERAL_TEMPLATE;
}

function safeBudget(total: number): number {
  return Number.isFinite(total) ? Math.max(0, Math.round(total)) : 0;
}

/**
 * Splits a whole-dollar total with largest-remainder allocation. The stable
 * index tie-break makes the result deterministic and guarantees that category
 * targets add up to the host's total exactly.
 */
export function allocateBudget(total: number, weights: number[]): number[] {
  const target = safeBudget(total);
  if (weights.length === 0) return [];

  const safeWeights = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 0));
  const weightTotal = safeWeights.reduce((sum, weight) => sum + weight, 0);
  const normalized = weightTotal > 0 ? safeWeights : safeWeights.map(() => 1);
  const normalizedTotal = normalized.reduce((sum, weight) => sum + weight, 0);
  const exact = normalized.map((weight) => (target * weight) / normalizedTotal);
  const allocated = exact.map(Math.floor);
  const remainder = target - allocated.reduce((sum, value) => sum + value, 0);

  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (let index = 0; index < remainder; index += 1) {
    allocated[order[index % order.length].index] += 1;
  }

  return allocated;
}

export function createBudgetCategories(
  occasion: OccasionType,
  total: number,
  makeId: () => string,
): BudgetCategory[] {
  const template = templateFor(occasion);
  const planned = allocateBudget(
    total,
    template.map((category) => category.weight),
  );
  return template.map((category, index) => ({
    id: makeId(),
    name: category.name,
    planned: planned[index],
    expenses: [],
  }));
}

/**
 * Rebalances category targets without changing category identity or expenses.
 * Existing non-zero proportions are retained; a zeroed plan falls back to the
 * occasion template by category name.
 */
export function rebaseBudgetCategories(
  categories: BudgetCategory[],
  total: number,
  occasion: OccasionType,
): BudgetCategory[] {
  if (categories.length === 0) return [];

  const existingWeight = categories.reduce(
    (sum, category) =>
      sum + (Number.isFinite(category.planned) && category.planned > 0 ? category.planned : 0),
    0,
  );
  const templateWeights = new Map(
    templateFor(occasion).map((category) => [category.name, category.weight]),
  );
  const weights =
    existingWeight > 0
      ? categories.map((category) =>
          Number.isFinite(category.planned) && category.planned > 0 ? category.planned : 0,
        )
      : categories.map((category) => templateWeights.get(category.name) ?? 1);
  const planned = allocateBudget(total, weights);

  return categories.map((category, index) => ({
    ...category,
    planned: planned[index],
    expenses: category.expenses,
  }));
}

export function plannedBudgetTotal(categories: BudgetCategory[]): number {
  return categories.reduce((sum, category) => sum + category.planned, 0);
}
