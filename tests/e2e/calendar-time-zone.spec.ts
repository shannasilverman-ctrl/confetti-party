import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

test("a timed party requires and preserves the host-confirmed event zone", async ({ page }) => {
  await page.goto("/app?new=1", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("party-dashboard")).toHaveAttribute("data-hydrated", "true");
  const wizard = page.getByRole("dialog");
  await wizard.getByLabel("Start with the idea").fill("A neighborhood dinner");
  await wizard.getByTestId("wizard-occasion-dinner-party").click();
  await wizard.getByText("Add anything you already know", { exact: false }).click();
  await wizard.getByLabel("Date (optional)").fill("2027-05-22");
  await wizard.getByLabel("Start time (optional)").fill("6:30 PM");

  await wizard.getByTestId("wizard-create").click();
  await expect(
    page.getByText("Confirm the event time zone so guest calendar links stay accurate."),
  ).toBeVisible();
  await expect(wizard).toBeVisible();

  await wizard.getByLabel("Event time zone").fill("America/New_York");
  await wizard.getByTestId("wizard-create").click();
  await expect(wizard.getByText("Your plan is ready")).toBeVisible();
  await wizard.getByTestId("wizard-open-plan").click();

  await page.getByTestId("edit-details-trigger").click();
  let details = page.getByRole("dialog");
  await expect(details.getByLabel("Event time zone")).toHaveValue("America/New_York");

  await details.getByLabel("Event time zone").fill("");
  await details.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByText("Confirm the event time zone so guest calendar links stay accurate."),
  ).toBeVisible();
  await expect(details).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByTestId("edit-details-trigger").click();
  details = page.getByRole("dialog");
  await expect(details.getByLabel("Event time zone")).toHaveValue("America/New_York");

  await details.getByLabel("Date").fill("2027-11-07");
  await details.getByLabel("Start time (optional)").fill("1:30 AM");
  await details.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByText("That start time happens twice when the clocks change.", { exact: false }),
  ).toBeVisible();
  await expect(details).toBeVisible();
});

test("a time captured from the idea exposes its zone confirmation without reopening details", async ({
  page,
}) => {
  await page.goto("/app?new=1", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("party-dashboard")).toHaveAttribute("data-hydrated", "true");
  const wizard = page.getByRole("dialog");

  await wizard
    .getByLabel("Start with the idea")
    .fill("Neighborhood dinner on 2027-05-22 at 6:30 PM");
  await wizard.getByTestId("wizard-occasion-dinner-party").click();

  await expect(wizard.getByTestId("wizard-time-zone-confirmation")).toContainText(
    "Confirm the time zone for 6:30 PM",
  );
  await expect(wizard.getByLabel("Event time zone")).toBeVisible();
  await expect(wizard.getByText("Add anything you already know", { exact: false })).toBeVisible();
});

test("quick start refuses to guess which repeated clock-change time the host means", async ({
  page,
}) => {
  await page.goto("/app?new=1", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("party-dashboard")).toHaveAttribute("data-hydrated", "true");
  const wizard = page.getByRole("dialog");

  await wizard
    .getByLabel("Start with the idea")
    .fill("Neighborhood dinner on 2027-11-07 at 1:30 AM");
  await wizard.getByTestId("wizard-occasion-dinner-party").click();
  await wizard.getByLabel("Event time zone").fill("America/New_York");
  await wizard.getByTestId("wizard-create").click();

  await expect(
    page.getByText("That start time happens twice when the clocks change.", { exact: false }),
  ).toBeVisible();
  await expect(wizard).toBeVisible();
});
