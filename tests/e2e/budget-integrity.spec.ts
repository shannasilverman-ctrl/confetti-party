import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

async function plannedTotal(page: import("@playwright/test").Page) {
  const values = await page
    .getByTestId("budget-category")
    .evaluateAll((categories) =>
      categories.map((category) => Number(category.getAttribute("data-planned"))),
    );
  return values.reduce((sum, value) => sum + value, 0);
}

async function openBudget(page: import("@playwright/test").Page) {
  const tab = page
    .locator(
      '[data-testid="party-tab-budget"]:visible, [data-testid="party-tab-mobile-budget"]:visible',
    )
    .first();
  await tab.scrollIntoViewIfNeeded();
  await tab.click();
  await expect(page.getByRole("heading", { name: "Budget breakdown" })).toBeVisible();
}

test("setting a skipped budget creates useful category targets that survive reload", async ({
  page,
}) => {
  await page.goto("/app?new=1", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("party-dashboard")).toHaveAttribute("data-hydrated", "true");
  const wizard = page.getByRole("dialog");
  await wizard.getByLabel("Start with the idea").fill("Maya's birthday");
  await wizard.getByTestId("wizard-occasion-birthday").click();
  await wizard.getByTestId("wizard-create").click();
  await wizard.getByTestId("wizard-open-plan").click();

  await page.getByTestId("edit-details-budget-trigger").click();
  const details = page.getByRole("dialog");
  await details.getByLabel("Budget (optional)").fill("600");
  await details.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Category plan rebalanced to $600.")).toBeVisible();

  await openBudget(page);
  await expect(page.getByText("Total budget").locator("..")).toContainText("$600");
  await expect.poll(() => plannedTotal(page)).toBe(600);

  const firstCategory = page.getByTestId("budget-category").first();
  await firstCategory.getByPlaceholder("Expense (e.g. Balloon arch)").fill("Napkins");
  await firstCategory.getByPlaceholder("$").fill("1");
  await firstCategory.getByRole("button", { name: "Add" }).click();
  await expect(firstCategory).toContainText("Napkins");
  await expect(firstCategory).not.toContainText("Over by $1");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => plannedTotal(page)).toBe(600);
  await expect(page.getByTestId("budget-rebalance-notice")).toHaveCount(0);
});

test("an existing mismatch is explained and repaired without changing expenses", async ({
  page,
}) => {
  await page.goto("/party/world-cup-final-watch?tab=budget", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { name: "Budget breakdown" })).toBeVisible();
  await expect.poll(() => plannedTotal(page)).toBe(250);
  await expect(page.getByTestId("budget-rebalance-notice")).toHaveCount(0);

  const food = page.getByTestId("budget-category").first();
  await food.getByPlaceholder("Expense (e.g. Balloon arch)").fill("Extra napkins");
  await food.getByPlaceholder("$").fill("1");
  await food.getByRole("button", { name: "Add" }).click();
  await expect(food).toContainText("Extra napkins");

  await page.evaluate(() => {
    const key = "confetti:demo:v2";
    const stored = JSON.parse(localStorage.getItem(key) ?? "null") as {
      samples?: Record<string, { budgetCategories?: Array<{ planned: number }> }>;
    } | null;
    const party = stored?.samples?.["world-cup-final-watch"];
    if (!party?.budgetCategories) throw new Error("Seed override was not persisted.");
    party.budgetCategories.forEach((category) => {
      category.planned = 100;
    });
    localStorage.setItem(key, JSON.stringify(stored));
  });
  await page.reload({ waitUntil: "domcontentloaded" });

  const notice = page.getByTestId("budget-rebalance-notice");
  await expect(notice).toContainText("Categories currently add up to $400");
  await expect.poll(() => plannedTotal(page)).toBe(400);
  await notice.getByRole("button", { name: "Rebalance to $250" }).click();

  await expect(notice).toHaveCount(0);
  await expect.poll(() => plannedTotal(page)).toBe(250);
  await expect(page.getByTestId("budget-category").first()).toContainText("Extra napkins");
  await expect(page.getByText("Category plan rebalanced to $250.")).toBeVisible();
});
