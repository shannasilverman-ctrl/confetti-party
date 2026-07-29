import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

async function openWizard(page: import("@playwright/test").Page) {
  await page.goto("/app?new=1", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("party-dashboard")).toHaveAttribute("data-hydrated", "true");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openTab(page: import("@playwright/test").Page, key: string) {
  const tab = page
    .locator(
      `[data-testid="party-tab-${key}"]:visible, [data-testid="party-tab-mobile-${key}"]:visible`,
    )
    .first();
  await expect(tab).toBeVisible();
  await tab.click();
}

test("one detailed idea becomes a useful plan without inventing missing facts", async ({
  page,
}) => {
  const dialog = await openWizard(page);
  await dialog
    .getByLabel("Start with the idea")
    .fill(
      "A low-key neighborhood potluck on 2026-09-18 for about 12 people, with two kids and one gluten-free guest",
    );

  const captured = dialog.getByTestId("wizard-captured-facts");
  await expect(captured).toContainText("Potluck");
  await expect(captured).toContainText("Sep 18, 2026");
  await expect(captured).toContainText("12 people");
  await expect(captured).toContainText("2 kids");
  await expect(captured).toContainText("gluten-free");

  await dialog.getByTestId("wizard-create").click();
  await expect(dialog.getByText("Your plan is ready")).toBeVisible();
  await expect(dialog).toContainText("Look");
  await expect(dialog).toContainText("To decide");
  await dialog.getByTestId("wizard-open-plan").click();

  await expect(page.getByRole("heading", { level: 1, name: "Potluck" })).toBeVisible();
  await expect(page.locator("header")).toContainText("September 18, 2026");
  await page.getByTestId("edit-details-trigger").click();
  const details = page.getByRole("dialog");
  await expect(details.getByLabel("Guest estimate (optional)")).toHaveValue("12");
  await expect(details.locator("#ed-date")).toHaveValue("2026-09-18");
  await details.getByRole("button", { name: "Cancel" }).click();

  await openTab(page, "checklist");
  await expect(page.locator("main")).toContainText("Confirm dietary needs (gluten-free)");
  await expect(page.locator("main")).toContainText("Coordinate contributions (open signup)");
  await expect(page.locator("main")).toContainText("Plan for 2 kids");
  await expect(page.locator("main")).toContainText("Set a comfortable budget");
});

test("skipping a look never selects or charges for a catalog theme", async ({ page }) => {
  const dialog = await openWizard(page);
  await dialog.getByLabel("Start with the idea").fill("Maya's birthday");
  await dialog.getByTestId("wizard-occasion-birthday").click();
  await dialog.getByTestId("wizard-create").click();

  await expect(dialog.getByText("Your plan is ready")).toBeVisible();
  await expect(dialog).toContainText("Look");
  await expect(dialog).toContainText("To decide");
  await expect(dialog).not.toContainText("Unicorn Rainbow");
  await dialog.getByTestId("wizard-open-plan").click();

  await expect(page.locator("main")).not.toContainText("Unicorn Rainbow");
  await openTab(page, "checklist");
  await expect(page.locator("main")).toContainText("Choose the look and feel");
  await expect(page.locator("main")).not.toContainText("Rainbow balloon arch");
  await expect(page.locator("main")).not.toContainText("Iridescent tablecloth");

  await openTab(page, "shopping");
  await expect(page.locator("main")).not.toContainText("Unicorn horn headbands");
  await expect(page.locator("main")).not.toContainText("Cloud napkin rings");

  await openTab(page, "theme");
  await expect(page.locator("main")).toContainText("Pick a theme");
  await expect(page.locator("main").getByText("Selected", { exact: true })).toHaveCount(0);
});
