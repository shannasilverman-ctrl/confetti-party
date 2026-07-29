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

  test("a natural 54-year-old prompt stays in the adult birthday flow", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByTestId("party-dashboard")).toHaveAttribute("data-hydrated", "true");
    await page.getByTestId("new-party-trigger").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Start with the idea").fill("Bday for a 54 yr old");

    await expect(dialog.getByTestId("wizard-inferred-occasion")).toContainText(
      "From your idea: Birthday",
    );
    await expect(dialog.getByTestId("birthday-smart-start")).toBeVisible();
    await expect(dialog.getByLabel("Age they're turning")).toHaveValue("54");
    await expect(dialog.getByText("A 54th birthday that feels like the person")).toBeVisible();
    await expect(dialog.getByText("Contained play venue")).toHaveCount(0);
    await expect(dialog.getByLabel("Children coming")).toBeVisible();
    await expect(dialog.getByLabel("Adults coming")).toBeVisible();
    await expect(dialog.getByText("5 guest-ready RSVP questions")).toBeVisible();

    await dialog.getByLabel("Age they're turning").clear();
    await expect(dialog.getByLabel("Age they're turning")).toHaveValue("");
    await expect(dialog.getByLabel("Adults", { exact: true })).toBeVisible();
    await expect(dialog.getByLabel("Adults staying")).toHaveCount(0);
    await expect(dialog.getByLabel("Age they're turning")).toHaveAttribute(
      "placeholder",
      "e.g. 4 or 54",
    );
    await dialog.getByLabel("Age they're turning").fill("54");

    await dialog.getByTestId("wizard-create").click();
    await expect(dialog.getByText("Your plan is ready")).toBeVisible();
    await dialog.getByTestId("wizard-open-plan").click();

    await expect(page).toHaveURL(/\/party\//);
    const intelligence = page.getByTestId("party-intelligence-card");
    await expect(
      intelligence.getByText("A 54th birthday that feels like the person"),
    ).toBeVisible();
    await expect(intelligence.getByText("Contained play venue")).toHaveCount(0);
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

    await expect(quantities.getByTestId("quantity-assumptions")).toBeVisible();
    await quantities.getByRole("button", { name: "Sharpen estimate" }).click();
    const quantityDialog = page.getByRole("dialog");
    await expect(quantityDialog.getByText("Make the quantity estimate yours")).toBeVisible();
    await quantityDialog.getByRole("button", { name: /Cake \+ light bites/ }).click();
    await quantityDialog.getByRole("button", { name: "1½ hours" }).click();
    await quantityDialog.getByRole("button", { name: /Portioned per guest/ }).click();
    await quantityDialog.getByRole("button", { name: "Use these details" }).click();
    await expect(quantities.getByText("Tuned estimate")).toBeVisible();
    await expect(quantities.getByText("39–65", { exact: true })).toBeVisible();
    await expect(quantities.getByText("Large pizzas")).toHaveCount(0);

    await quantities.getByRole("button", { name: "Use while shopping" }).click();
    const shoppingGuide = page.getByTestId("shopping-quantity-guide");
    await expect(shoppingGuide.getByText("Your tuned quantities")).toBeVisible();
    await expect(shoppingGuide.getByText("39–65", { exact: true })).toBeVisible();
    await expect(shoppingGuide.getByRole("button", { name: "Adjust food plan" })).toBeVisible();

    await page.getByRole("button", { name: "Overview", exact: true }).click();
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

  test("a nearby search becomes a truthful shortlist, working choice, and follow-through task", async ({
    page,
  }) => {
    await page.goto("/app");
    await expect(page.getByTestId("party-dashboard")).toHaveAttribute("data-hydrated", "true");
    await page.getByTestId("new-party-trigger").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("wizard-occasion-birthday").click();
    await dialog.getByLabel("Start with the idea").fill("Eliana turns four");
    await dialog.getByLabel("Age they're turning").fill("4");
    await dialog.getByLabel("Children", { exact: true }).fill("5");
    await dialog.getByLabel("Adults staying").fill("6");
    await dialog.getByText("Add anything you already know").click();
    await dialog.getByLabel("Budget (optional)").fill("600");
    await dialog.getByTestId("wizard-create").click();
    await dialog.getByTestId("wizard-open-plan").click();

    const local = page.getByTestId("local-planning");
    const venuePath = local.locator("article").filter({ hasText: "Active venue" }).first();
    await venuePath.getByRole("button", { name: "Save an option to compare" }).click();

    const optionDialog = page.getByRole("dialog");
    await expect(optionDialog.getByText("Everything here comes from you")).toBeVisible();
    await optionDialog.getByLabel("Business or provider").fill("Flying Squirrel");
    await optionDialog
      .getByLabel("Website or listing (optional)")
      .fill("https://example.com/party-package");
    await optionDialog.getByLabel("Cost (optional)").fill("325");
    await optionDialog.getByLabel("What is that number?").click();
    await page.getByRole("option", { name: "Vendor quote" }).click();
    await optionDialog.getByLabel("Where it stands").click();
    await page.getByRole("option", { name: "Quote received" }).click();
    await optionDialog
      .getByLabel("What matters in the decision? (optional)")
      .fill("Cleanup included. Confirm sibling fee and outside cake policy.");
    await optionDialog.getByRole("button", { name: "Add to shortlist" }).click();

    const shortlist = local.getByTestId("local-sourcing-shortlist");
    await expect(shortlist.getByRole("heading", { name: "Flying Squirrel" })).toBeVisible();
    await expect(shortlist.getByText("$325 · 54% of the current budget")).toBeVisible();
    await expect(shortlist.getByText("host-recorded quote")).toBeVisible();
    await expect(shortlist.getByText("Quote received")).toBeVisible();
    await expect(shortlist.getByText("Host-entered · verify directly")).toBeVisible();

    await shortlist.getByRole("button", { name: "Make working choice" }).click();
    await expect(shortlist.getByText("Working choice")).toBeVisible();
    await expect(shortlist.getByText("This does not contact or book the provider.")).toBeVisible();

    await page.getByRole("button", { name: "Checklist", exact: true }).click();
    const task = page
      .getByRole("listitem")
      .filter({ hasText: "Confirm Flying Squirrel: availability, inclusions, and final price" });
    await expect(task).toBeVisible();
    await expect(task.getByText("A favorite is not a booking.")).toBeVisible();

    await page.reload();
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    await expect(
      page
        .getByTestId("local-sourcing-shortlist")
        .getByRole("heading", { name: "Flying Squirrel" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Remove Flying Squirrel" }).click();
    const removeDialog = page.getByRole("alertdialog");
    await expect(
      removeDialog.getByText("Remove Flying Squirrel from the shortlist?"),
    ).toBeVisible();
    await expect(removeDialog.getByText("It does not contact the provider.")).toBeVisible();
    await removeDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page
        .getByTestId("local-sourcing-shortlist")
        .getByRole("heading", { name: "Flying Squirrel" }),
    ).toBeVisible();

    const accessibility = await new AxeBuilder({ page })
      .include('[data-testid="local-planning"]')
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      accessibility.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? ""),
      ),
    ).toEqual([]);
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

    await smartStart.getByLabel("Age they're turning").fill("16");
    await expect(smartStart.getByText("16th birthday with room to be themselves")).toBeVisible();
    await expect(smartStart.getByText("About 180 minutes")).toBeVisible();
    await expect(smartStart.getByLabel("Young people coming")).toBeVisible();
    await expect(smartStart.getByLabel("Adults helping")).toBeVisible();

    await smartStart.getByLabel("Age they're turning").fill("40");
    await smartStart.getByTestId("birthday-life-stage-adult").click();
    await expect(smartStart.getByLabel("Age they're turning")).toHaveValue("40");
    await smartStart.getByTestId("birthday-life-stage-unknown").click();
    await expect(smartStart.getByLabel("Age they're turning")).toHaveValue("");
    await expect(smartStart.getByTestId("birthday-life-stage-unknown")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await smartStart.getByLabel("Age they're turning").fill("40");
    await expect(smartStart.getByText("A 40th birthday that feels like the person")).toBeVisible();
    await expect(smartStart.getByText("About 180 minutes")).toBeVisible();
    await expect(smartStart.getByText("5 guest-ready RSVP questions")).toBeVisible();
    await expect(smartStart.getByLabel("Adults coming")).toBeVisible();
    await expect(smartStart.getByLabel("Children coming")).toBeVisible();
    await expect(smartStart.getByText("8 party-specific jobs covered")).toBeVisible();
    await expect(dialog.getByText("Contained play venue")).toHaveCount(0);

    await dialog.getByLabel("Start with the idea").fill("Jordan turns forty");
    await smartStart.getByLabel("Adults coming").fill("28");
    await dialog.getByTestId("wizard-create").click();
    await dialog.getByTestId("wizard-open-plan").click();

    const intelligence = page.getByTestId("party-intelligence-card");
    await expect(
      intelligence.getByText("A 40th birthday that feels like the person"),
    ).toBeVisible();
    const localPlanning = page.getByTestId("local-planning");
    await expect(localPlanning.getByText("A celebration space that fits the person")).toBeVisible();
    await expect(localPlanning.getByText("Food and cake without losing the host")).toBeVisible();
    await expect(localPlanning.getByText("At-home gathering with one shared moment")).toBeVisible();
    await expect(localPlanning.getByText(/contained play|trampoline|play gym/i)).toHaveCount(0);
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

    const messageHelper = page.getByTestId("host-message-helper");
    await expect(
      messageHelper.getByText("The right follow-up, already thought through"),
    ).toBeVisible();
    await expect(messageHelper.getByRole("button", { name: "Confirm food needs" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(messageHelper.getByText("Sam Rivera")).toBeVisible();
    const guestMessage = messageHelper.getByLabel("Editable guest message");
    await expect(guestMessage).not.toHaveValue(/Peanuts/);
    await expect(guestMessage).not.toHaveValue(/A chair away from the speaker would help/);
    await messageHelper.getByRole("button", { name: "Clarify arrival times" }).click();
    await expect(messageHelper.getByText(/Send this one-to-one/)).toBeVisible();
    await guestMessage.fill("Hi! What time do you think you will arrive?");
    await expect(guestMessage).toHaveValue("Hi! What time do you think you will arrive?");

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
    if ((page.viewportSize()?.width ?? 1024) < 768) {
      await expect(page.getByTestId("party-mobile-nav")).toBeHidden();
    }
    const activity = page.getByLabel("Timeline activity");
    await activity.fill("Save a welcome plate for Sam");
    const saveTimelineEdit = page.getByRole("button", { name: "Save" });
    if ((page.viewportSize()?.width ?? 1024) < 768) {
      const saveBox = await saveTimelineEdit.boundingBox();
      expect(saveBox).not.toBeNull();
      expect(saveBox!.y + saveBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    }
    const visibleToast = page.locator("[data-sonner-toast]:visible").last();
    if (await visibleToast.count()) {
      await expect(visibleToast).toHaveCSS("pointer-events", "none");
    }
    await saveTimelineEdit.click();
    await expect(page.getByText("Save a welcome plate for Sam")).toBeVisible();
    if ((page.viewportSize()?.width ?? 1024) < 768) {
      await expect(page.getByTestId("party-mobile-nav")).toBeVisible();
    }
  });

  test("a broad adult birthday stays adult without requiring an exact age", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByTestId("party-dashboard")).toHaveAttribute("data-hydrated", "true");
    await page.getByTestId("new-party-trigger").click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Start with the idea")
      .fill("Adult birthday dinner with three kids invited");

    await expect(dialog.getByTestId("wizard-inferred-occasion")).toContainText("Birthday");
    await expect(dialog.getByTestId("birthday-life-stage-adult")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(dialog.getByLabel("Adults coming")).toBeVisible();
    await expect(dialog.getByLabel("Age they're turning")).toHaveValue("");
    await expect(dialog.getByText("Contained play venue")).toHaveCount(0);

    await dialog.getByTestId("wizard-create").click();
    await dialog.getByTestId("wizard-open-plan").click();

    await expect(
      page.getByTestId("local-planning").getByText("A celebration space that fits the person"),
    ).toBeVisible();
    const partyId = page.url().split("/party/")[1]?.split(/[?#]/)[0];
    expect(partyId).toBeTruthy();
    const profile = await page.evaluate((id) => {
      const stored = JSON.parse(localStorage.getItem("confetti:demo:v2") ?? "null") as {
        custom?: Array<{
          id: string;
          planningProfile?: { honoreeAge?: number; honoreeLifeStage?: string };
        }>;
      } | null;
      return stored?.custom?.find((party) => party.id === id)?.planningProfile;
    }, partyId);
    expect(profile).toMatchObject({ honoreeLifeStage: "adult" });
    expect(profile?.honoreeAge).toBeUndefined();
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

  test("baby-shower smart start follows the parents' boundaries instead of a generic checklist", async ({
    page,
  }) => {
    await page.goto("/app");
    await expect(page.getByTestId("party-dashboard")).toHaveAttribute("data-hydrated", "true");
    await page.getByTestId("new-party-trigger").click();

    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("wizard-occasion-baby-shower").click();
    await dialog
      .getByLabel("Start with the idea")
      .fill("A welcoming baby shower for Jordan and Alex");
    const smartStart = dialog.getByTestId("gathering-smart-start");
    await smartStart.getByLabel("Adults").fill("18");
    await smartStart.getByLabel("Children").fill("3");

    await expect(
      smartStart.getByText("A baby shower that feels supportive, not performative"),
    ).toBeVisible();
    await expect(smartStart.getByText("8 easy-to-miss jobs covered")).toBeVisible();
    await expect(smartStart.getByText("5 useful guest questions")).toBeVisible();
    await dialog.getByTestId("wizard-create").click();
    await dialog.getByTestId("wizard-open-plan").click();

    const intelligence = page.getByTestId("party-intelligence-card");
    await expect(
      intelligence.getByText("A baby shower that feels supportive, not performative"),
    ).toBeVisible();
    await intelligence.getByRole("button", { name: "Review the 150-minute flow" }).click();
    await expect(
      page.getByText("Welcome and one optional shared activity or conversation prompt"),
    ).toBeVisible();

    await page.getByRole("button", { name: "Checklist", exact: true }).click();
    await expect(
      page.getByText(/Ask the parents what would feel supportive, what should stay private/),
    ).toBeVisible();
  });

  test("graduation smart start coordinates the ceremony and the celebration", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByTestId("party-dashboard")).toHaveAttribute("data-hydrated", "true");
    await page.getByTestId("new-party-trigger").click();

    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("wizard-occasion-graduation").click();
    await dialog.getByLabel("Start with the idea").fill("Taylor's graduation open house");
    const smartStart = dialog.getByTestId("gathering-smart-start");
    await smartStart.getByLabel("Adults").fill("30");
    await smartStart.getByLabel("Children").fill("4");

    await expect(
      smartStart.getByText("A graduation celebration centered on the graduate"),
    ).toBeVisible();
    await expect(smartStart.getByText("8 easy-to-miss jobs covered")).toBeVisible();
    await expect(smartStart.getByText("5 useful guest questions")).toBeVisible();
    await dialog.getByTestId("wizard-create").click();
    await dialog.getByTestId("wizard-open-plan").click();

    const intelligence = page.getByTestId("party-intelligence-card");
    await expect(
      intelligence.getByText("A graduation celebration centered on the graduate"),
    ).toBeVisible();
    await intelligence.getByRole("button", { name: "Review the 180-minute flow" }).click();
    await expect(
      page.getByText("Graduate and ceremony group arrive to a saved plate and easy reset"),
    ).toBeVisible();

    await page.getByRole("button", { name: "Checklist", exact: true }).click();
    await expect(page.getByText(/Separate ceremony logistics from party logistics/)).toBeVisible();
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
