import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("customer-backwards party intelligence", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem("confetti:e2e-storage-ready")) return;
      localStorage.clear();
      sessionStorage.setItem("confetti:e2e-storage-ready", "true");
    });
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

    const partyPaths = dialog.getByTestId("preschool-party-paths");
    await expect(partyPaths.getByText("Confetti’s starting recommendation")).toBeVisible();
    await expect(partyPaths.getByText("Simple at-home play party")).toBeVisible();
    await expect(partyPaths.getByText(/5-child starting list/)).toBeVisible();
    const layout = await dialog.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        width: styles.width,
        gridTemplateColumns: styles.gridTemplateColumns,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      };
    });
    expect(
      layout.scrollWidth <= layout.clientWidth + 1,
      `birthday dialog should not create page-level horizontal overflow: ${JSON.stringify(layout)}`,
    ).toBe(true);
    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="preschool-party-paths"]')
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      accessibility.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? ""),
      ),
    ).toEqual([]);

    await dialog.getByRole("button", { name: "Make it easy" }).click();
    await expect(partyPaths.getByText("Contained play venue")).toBeVisible();
    await expect(partyPaths.getByText(/carry more of the load/)).toBeVisible();
    await partyPaths.getByRole("radio", { name: /Contained play venue/ }).click();
    await expect(partyPaths.getByText("Your party path")).toBeVisible();
    await expect(partyPaths.getByText("Your choice")).toBeVisible();

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
    const startingPath = intelligence.getByTestId("preschool-starting-path");
    await expect(startingPath.getByText("Starting path · Your choice")).toBeVisible();
    await expect(startingPath.getByText("Contained play venue")).toBeVisible();
    await expect(startingPath.getByRole("button", { name: /Compare local options/ })).toBeVisible();

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

  test("help me choose stays transparent and drives the same downstream plan", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByTestId("party-dashboard")).toHaveAttribute("data-hydrated", "true");
    await page.getByTestId("new-party-trigger").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("wizard-occasion-birthday").click();
    await dialog.getByLabel("Start with the idea").fill("Nico turns four");
    await dialog.getByLabel("Age they're turning").fill("4");
    await dialog.getByLabel("Children", { exact: true }).fill("5");
    await dialog.getByLabel("Adults staying").fill("6");

    const paths = dialog.getByTestId("preschool-party-paths");
    await expect(paths.getByText("Confetti’s starting recommendation")).toBeVisible();
    await expect(paths.getByRole("radio", { name: /Simple at-home play party/ })).toBeChecked();

    await dialog.getByTestId("wizard-create").click();
    await dialog.getByTestId("wizard-open-plan").click();

    const startingPath = page.getByTestId("preschool-starting-path");
    await expect(startingPath.getByText("Starting path · Confetti recommendation")).toBeVisible();
    await expect(startingPath.getByText("Simple at-home play party")).toBeVisible();

    const local = page.getByRole("region", { name: "Make it local" });
    const firstLocalPath = local.locator("article").first();
    await expect(firstLocalPath.getByText("Simple at-home play party")).toBeVisible();
    await expect(firstLocalPath.getByRole("button", { name: /Build this version/ })).toBeVisible();
  });

  test("school-age and adult birthdays change the workflow instead of reusing preschool copy", async ({
    page,
  }) => {
    await page.goto("/app");
    await expect(page.getByTestId("party-dashboard")).toHaveAttribute("data-hydrated", "true");
    await page.getByTestId("new-party-trigger").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("wizard-occasion-birthday").click();
    const smartStart = dialog.getByTestId("birthday-smart-start");

    await smartStart.getByLabel("Age they're turning").fill("8");
    await expect(smartStart.getByText("8th birthday with room to actually play")).toBeVisible();
    await expect(smartStart.getByText("About 150 minutes")).toBeVisible();
    await expect(smartStart.getByText("5 parent-ready RSVP questions")).toBeVisible();
    await expect(smartStart.getByLabel("Adults staying")).toBeVisible();

    await smartStart.getByLabel("Age they're turning").fill("40");
    await expect(smartStart.getByText("A 40th birthday that feels like the person")).toBeVisible();
    await expect(smartStart.getByText("About 180 minutes")).toBeVisible();
    await expect(smartStart.getByText("5 guest-ready RSVP questions")).toBeVisible();
    await expect(smartStart.getByLabel("Adults coming")).toBeVisible();
    await expect(smartStart.getByLabel("Children coming")).toBeVisible();
    await expect(smartStart.getByText("8 party-specific jobs covered")).toBeVisible();

    await dialog.getByLabel("Start with the idea").fill("Jordan turns forty");
    await smartStart.getByLabel("Adults coming").fill("28");
    await dialog.getByTestId("wizard-create").click();
    await dialog.getByTestId("wizard-open-plan").click();

    const intelligence = page.getByTestId("party-intelligence-card");
    await expect(
      intelligence.getByText("A 40th birthday that feels like the person"),
    ).toBeVisible();
    await intelligence.getByRole("button", { name: "Review the 180-minute flow" }).click();
    await expect(
      page.getByText("Shared moment: toast, story, surprise, or activity reveal"),
    ).toBeVisible();
    await expect(
      page.getByText("Rides, leftovers, gifts, payment, and host closeout"),
    ).toBeVisible();

    const partyId = page.url().split("/party/")[1]?.split(/[?#]/)[0];
    expect(partyId).toBeTruthy();
    await page.evaluate((id) => {
      const key = "confetti:demo:v2";
      const stored = JSON.parse(localStorage.getItem(key) ?? "null") as {
        custom?: Array<{ id: string; guests: unknown[] }>;
      } | null;
      const party = stored?.custom?.find((candidate) => candidate.id === id);
      if (!party) throw new Error("Created demo party was not persisted.");
      party.guests = [
        {
          id: "contextual-guest",
          name: "Sam Rivera",
          kind: "adult",
          rsvp: "yes",
          source: "link",
          dietary: ["Vegetarian"],
          allergens: ["Peanuts"],
          responseDetails: {
            arrivalPlan: "arriving-later",
            accessNotes: "A chair away from the speaker would help.",
          },
        },
      ];
      localStorage.setItem(key, JSON.stringify(stored));
    }, partyId);
    await page.reload();
    await page.getByRole("button", { name: "Guests", exact: true }).click();
    const planningDetails = page.getByTestId("guest-planning-details-contextual-guest");
    await expect(planningDetails.getByText("Arriving later")).toBeVisible();
    await expect(planningDetails.getByText("Vegetarian")).toBeVisible();
    await expect(planningDetails.getByText("Avoid Peanuts")).toBeVisible();
    await expect(
      planningDetails.getByText("Comfort/access: A chair away from the speaker would help."),
    ).toBeVisible();

    await page.getByRole("button", { name: "Overview", exact: true }).click();
    const guestPlan = page.getByTestId("guest-plan-impact-card");
    await expect(guestPlan.getByText("Guest answers, turned into a plan")).toBeVisible();
    await expect(guestPlan.getByText("Rule-based, not guessed")).toBeVisible();
    await expect(
      guestPlan.getByText("Plan quantities for 1 current yes/maybe reply"),
    ).toBeVisible();
    await expect(guestPlan.getByText("1 allergen signal to plan around")).toBeVisible();
    await expect(guestPlan.getByText("1 dietary need in the current replies")).toBeVisible();
    await expect(guestPlan.getByText("1 private comfort/access note to review")).toBeVisible();
    await expect(guestPlan.getByText("1 guest expects to arrive later")).toBeVisible();

    await guestPlan.getByRole("button", { name: "Use current replies" }).click();
    await expect(page.getByText("Enough for 0 children and 1 adult")).toBeVisible();

    await page
      .locator(
        '[data-testid="party-tab-shopping"]:visible, [data-testid="party-tab-mobile-shopping"]:visible',
      )
      .click();
    const plates = page.getByRole("listitem").filter({ hasText: "Paper plates and cups" });
    await expect(plates.getByText("Auto-sized")).toBeVisible();
    await plates.getByRole("button", { name: "Increase Paper plates and cups quantity" }).click();
    await expect(plates.getByText(/Qty 2 ·/)).toBeVisible();
    await expect(plates.getByText("Auto-sized")).toHaveCount(0);

    await page.getByRole("button", { name: "Overview", exact: true }).click();
    await page
      .getByTestId("guest-plan-impact-allergens")
      .getByRole("button", { name: "Add food check" })
      .click();
    await expect(page.getByText("Confirm the allergen-safe food plan")).toBeVisible();
    await expect(page.getByText(/Review Peanuts with the affected guests/)).toBeVisible();

    await page.getByRole("button", { name: "Overview", exact: true }).click();
    await page
      .getByTestId("guest-plan-impact-arrival")
      .getByRole("button", { name: "Add arrival plan" })
      .click();
    const arrival = page.getByText("Flexible welcome and first-plate plan for 1 later guest");
    await expect(arrival).toBeVisible();
    await page.getByRole("button", { name: "Edit Flexible welcome" }).click();
    const activity = page.getByLabel("Timeline activity");
    await activity.fill("Save a welcome plate for Sam");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Save a welcome plate for Sam")).toBeVisible();
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
