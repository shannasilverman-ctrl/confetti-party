import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("party section navigation", () => {
  test("reveal actions land in the promised section and survive reload/back", async ({
    page,
  }, testInfo) => {
    await page.goto("/party/ava-liam-wedding/reveal", { waitUntil: "domcontentloaded" });

    await page.getByRole("link", { name: "Open checklist" }).click();
    await expect(page).toHaveURL(/\/party\/ava-liam-wedding\?tab=checklist$/);
    await expect(page.getByTestId("party-tab-checklist")).toHaveAttribute("aria-current", "page");
    await expect(page.getByPlaceholder("Add a task…")).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByPlaceholder("Add a task…")).toBeVisible();

    const budgetTab =
      testInfo.project.name === "mobile"
        ? page.getByTestId("party-tab-mobile-budget")
        : page.getByTestId("party-tab-budget");
    await budgetTab.scrollIntoViewIfNeeded();
    await budgetTab.click();
    await expect(page).toHaveURL(/\/party\/ava-liam-wedding\?tab=budget$/);
    await expect(page.getByRole("heading", { name: "Budget breakdown" })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/party\/ava-liam-wedding\?tab=checklist$/);
    await expect(page.getByPlaceholder("Add a task…")).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/party\/ava-liam-wedding\/reveal$/);
    await page.getByRole("link", { name: "Coordinate" }).click();
    await expect(page).toHaveURL(/\/party\/ava-liam-wedding\?tab=bring$/);
    await expect(page.getByTestId("bring-board")).toBeVisible();

    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(
      accessibility.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
      ),
    ).toEqual([]);
  });
});
