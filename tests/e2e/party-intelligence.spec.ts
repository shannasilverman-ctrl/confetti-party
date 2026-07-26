import { expect, test } from "@playwright/test";

test.describe("customer-backwards party intelligence", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
  });

  test("turning four creates an age-aware plan, not a generic birthday checklist", async ({
    page,
  }) => {
    await page.goto("/app");
    const dashboard = page.getByTestId("party-dashboard");
    await expect(dashboard).toHaveAttribute("data-hydrated", "true");
    const newParty = page.getByTestId("new-party-trigger");
    await expect(newParty).toBeEnabled();
    await newParty.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await dialog.getByTestId("wizard-occasion-birthday").click();
    await expect(dialog.getByTestId("birthday-smart-start")).toBeVisible();
    await expect(dialog.getByText("Help Confetti understand this birthday")).toBeVisible();

    await dialog.getByLabel("Start with the idea").fill("Eliana turns four");
    await dialog.getByLabel("Age they're turning").fill("4");
    await dialog.getByLabel("Children").fill("5");
    await dialog.getByLabel("Adults staying").fill("6");
    await dialog.getByRole("button", { name: "At a venue" }).click();
    await dialog.getByRole("button", { name: "Make it easy" }).click();

    await expect(dialog.getByText("A low-stress turning 4 birthday")).toBeVisible();
    await expect(dialog.getByText("About 90 minutes")).toBeVisible();
    await expect(dialog.getByText("5 parent-ready RSVP questions")).toBeVisible();

    await dialog.getByTestId("wizard-create").click();
    await expect(dialog.getByText("Your plan is ready")).toBeVisible();
    await dialog.getByTestId("wizard-open-plan").click();

    await expect(page).toHaveURL(/\/party\//);
    const intelligence = page.getByTestId("party-intelligence-card");
    await expect(intelligence).toBeVisible();
    await expect(intelligence.getByText("Confetti understands this party")).toBeVisible();
    await expect(intelligence.getByText("4 age-aware guardrails")).toBeVisible();

    const quantities = page.getByTestId("party-quantity-card");
    await expect(quantities.getByText("Enough for 5 children and 6 adults")).toBeVisible();
    await expect(quantities.getByText("3–4", { exact: true })).toBeVisible();
    await quantities.getByRole("button", { name: "Adjust counts" }).click();
    const editDialog = page.getByRole("dialog");
    await editDialog.getByLabel("Children", { exact: true }).fill("6");
    await editDialog.getByLabel("Adults", { exact: true }).fill("7");
    await editDialog.getByRole("button", { name: "Save changes" }).click();
    await expect(quantities.getByText("Enough for 6 children and 7 adults")).toBeVisible();

    await intelligence.getByRole("button", { name: "Review the 90-minute flow" }).click();
    await expect(page.getByText("Easy arrival play while families settle in")).toBeVisible();
    await expect(page.getByText("Party ends before the room runs out of steam")).toBeVisible();
  });

  test("Shabbat smart start builds the table, timing, quantities, and guest questions together", async ({
    page,
  }) => {
    await page.goto("/app");
    const dashboard = page.getByTestId("party-dashboard");
    await expect(dashboard).toHaveAttribute("data-hydrated", "true");
    await page.getByTestId("new-party-trigger").click();

    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("wizard-occasion-holiday").click();
    await dialog.getByTestId("wizard-starter-shabbat").click();

    const smartStart = dialog.getByTestId("gathering-smart-start");
    await expect(smartStart).toBeVisible();
    await expect(smartStart.getByText("A Shabbat dinner that protects the pause")).toBeVisible();
    await smartStart.getByLabel("Adults").fill("8");
    await smartStart.getByLabel("Children").fill("3");
    await smartStart.getByRole("button", { name: "At home" }).click();
    await smartStart.getByRole("button", { name: "Make it easy" }).click();

    await expect(smartStart.getByText("7 easy-to-miss jobs covered")).toBeVisible();
    await expect(smartStart.getByText("5 useful guest questions")).toBeVisible();
    await dialog.getByTestId("wizard-create").click();
    await expect(dialog.getByText("Your plan is ready")).toBeVisible();
    await dialog.getByTestId("wizard-open-plan").click();

    const intelligence = page.getByTestId("party-intelligence-card");
    await expect(intelligence.getByText("A Shabbat dinner that protects the pause")).toBeVisible();
    await expect(intelligence.getByText("4 planning guardrails")).toBeVisible();

    const quantities = page.getByTestId("party-quantity-card");
    await expect(quantities.getByText("Enough for 3 children and 8 adults")).toBeVisible();
    await expect(quantities.getByText("Main servings")).toBeVisible();
    await expect(quantities.getByText("Side servings")).toBeVisible();
    await expect(quantities.getByText("Large pizzas")).toHaveCount(0);

    await intelligence.getByRole("button", { name: "Review the 150-minute flow" }).click();
    await expect(page.getByText("Optional candle lighting and welcome rituals")).toBeVisible();
    await expect(
      page.getByText("A natural close—no rushed clearing while people linger"),
    ).toBeVisible();
  });

  test("watch-party smart start understands kickoff, screen reliability, and food waves", async ({
    page,
  }) => {
    await page.goto("/app");
    await expect(page.getByTestId("party-dashboard")).toHaveAttribute("data-hydrated", "true");
    await page.getByTestId("new-party-trigger").click();

    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("wizard-occasion-game-day").click();
    await dialog.getByLabel("Start with the idea").fill("World Cup final at our place");
    const smartStart = dialog.getByTestId("gathering-smart-start");
    await smartStart.getByLabel("Adults").fill("12");
    await smartStart.getByLabel("Children").fill("4");

    await expect(smartStart.getByText("A watch party built around the actual game")).toBeVisible();
    await dialog.getByTestId("wizard-create").click();
    await dialog.getByTestId("wizard-open-plan").click();

    const intelligence = page.getByTestId("party-intelligence-card");
    await expect(
      intelligence.getByText("A watch party built around the actual game"),
    ).toBeVisible();
    const quantities = page.getByTestId("party-quantity-card");
    await expect(quantities.getByText("Small bites")).toBeVisible();
    await expect(quantities.getByText("10-lb ice bags")).toBeVisible();

    await intelligence.getByRole("button", { name: "Review the 240-minute flow" }).click();
    await expect(page.getByText("Kickoff—stream, sound, and backup are confirmed")).toBeVisible();
    await expect(page.getByText("Halftime food wave and fast trash reset")).toBeVisible();
    await page.getByRole("button", { name: "Checklist", exact: true }).click();
    await expect(
      page.getByText(/Split food into pregame, during-play, and halftime waves/),
    ).toBeVisible();
  });
});
