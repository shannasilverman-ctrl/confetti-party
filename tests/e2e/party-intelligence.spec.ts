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
});
