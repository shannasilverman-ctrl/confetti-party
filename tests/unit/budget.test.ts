import { describe, expect, it } from "vitest";
import {
  allocateBudget,
  createBudgetCategories,
  plannedBudgetTotal,
  rebaseBudgetCategories,
} from "@/lib/budget";
import type { BudgetCategory, OccasionType } from "@/lib/party-context";

const occasions: OccasionType[] = [
  "birthday",
  "baby-shower",
  "graduation",
  "holiday",
  "dinner-party",
  "game-day",
  "cookout",
  "other",
];

describe("budget allocation", () => {
  it.each(occasions)("allocates every %s total exactly", (occasion) => {
    for (const total of [0, 1, 250, 600, 12_500]) {
      let nextId = 0;
      const categories = createBudgetCategories(occasion, total, () => `category-${nextId++}`);

      expect(plannedBudgetTotal(categories)).toBe(total);
      expect(
        categories.every(
          (category) =>
            Number.isFinite(category.planned) &&
            Number.isInteger(category.planned) &&
            category.planned >= 0,
        ),
      ).toBe(true);
    }
  });

  it("uses deterministic largest-remainder allocation for small totals", () => {
    expect(allocateBudget(1, [1, 1, 1])).toEqual([1, 0, 0]);
    expect(allocateBudget(5, [1, 1, 1])).toEqual([2, 2, 1]);
    expect(allocateBudget(10, [0, 0])).toEqual([5, 5]);
  });

  it("preserves category identity and expenses while rebasing", () => {
    const categories: BudgetCategory[] = [
      {
        id: "food",
        name: "Food & Snacks",
        planned: 120,
        expenses: [{ id: "wings", label: "Wings", amount: 45 }],
      },
      {
        id: "drinks",
        name: "Drinks & Bar",
        planned: 100,
        expenses: [{ id: "ice", label: "Ice", amount: 12 }],
      },
      { id: "setup", name: "Paper Goods & Setup", planned: 40, expenses: [] },
      { id: "decor", name: "Décor", planned: 40, expenses: [] },
    ];

    const rebased = rebaseBudgetCategories(categories, 250, "game-day");

    expect(plannedBudgetTotal(rebased)).toBe(250);
    expect(rebased.map(({ id, name, expenses }) => ({ id, name, expenses }))).toEqual(
      categories.map(({ id, name, expenses }) => ({ id, name, expenses })),
    );
    expect(rebased[0].expenses).toBe(categories[0].expenses);
  });

  it("uses occasion weights when a skipped budget left category targets at zero", () => {
    const zeroed = createBudgetCategories("game-day", 0, () => crypto.randomUUID());
    const rebased = rebaseBudgetCategories(zeroed, 600, "game-day");

    expect(rebased.map((category) => category.planned)).toEqual([240, 200, 80, 80]);
    expect(plannedBudgetTotal(rebased)).toBe(600);
  });

  it("fails safe for invalid totals", () => {
    expect(allocateBudget(Number.NaN, [1, 2])).toEqual([0, 0]);
    expect(allocateBudget(Number.POSITIVE_INFINITY, [1, 2])).toEqual([0, 0]);
    expect(allocateBudget(-20, [1, 2])).toEqual([0, 0]);
  });
});
