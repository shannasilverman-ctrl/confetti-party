import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("frictionless Bring Board coordination", () => {
  test("a host can start, edit, assign, and safely reopen a game-day responsibility", async ({
    page,
  }) => {
    await page.goto("/app");
    await expect(page.getByTestId("party-dashboard")).toHaveAttribute("data-hydrated", "true");
    await page.getByTestId("new-party-trigger").click();

    const wizard = page.getByRole("dialog");
    await wizard.getByTestId("wizard-occasion-game-day").click();
    await wizard.getByLabel("Start with the idea").fill("World Cup final");
    const smartStart = wizard.getByTestId("gathering-smart-start");
    await smartStart.getByLabel("Adults").fill("12");
    await smartStart.getByLabel("Children").fill("4");
    await wizard.getByTestId("wizard-create").click();
    await wizard.getByTestId("wizard-open-plan").click();

    await page.getByRole("button", { name: "Bring & Photos", exact: true }).click();
    const board = page.getByTestId("bring-board");
    await expect(board.getByText("Confetti starter board")).toBeVisible();
    await expect(board.getByText(/Pregame snack · Halftime hot dish/)).toBeVisible();
    await board.getByRole("button", { name: "Add 5 suggestions" }).click();

    await expect(board.getByTestId("bring-item")).toHaveCount(5);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await expect(board.getByText("Handheld dessert")).toBeVisible();
    await expect(board.getByText("× 16 pieces")).toBeVisible();
    // Audit the settled interface, not Sonner's temporary fade-out frame,
    // whose parent opacity makes otherwise compliant text appear blended.
    await expect(page.getByText("Added 5 occasion-aware responsibilities.")).not.toBeVisible({
      timeout: 6_000,
    });
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(
      accessibility.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
      ),
    ).toEqual([]);

    await board
      .getByRole("button", { name: "Edit or assign Halftime hot dish", exact: true })
      .click();
    const editor = page.getByRole("dialog");
    await editor.getByLabel("Assign to someone (optional)").fill("Marco");
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await editor.getByRole("button", { name: "Save and assign to Marco" }).click();

    const assignedRow = board.getByTestId("bring-item").filter({ hasText: "Halftime hot dish" });
    await expect(assignedRow.getByText("Marco")).toBeVisible();
    await assignedRow
      .getByRole("button", { name: "Make Halftime hot dish available again" })
      .click();

    const confirmation = page.getByRole("alertdialog");
    await expect(
      confirmation.getByText("Marco will no longer be listed for “Halftime hot dish.”"),
    ).toBeVisible();
    await confirmation.getByRole("button", { name: "Make available" }).click();
    await expect(assignedRow.getByText("Marco")).toHaveCount(0);

    await board.getByRole("button", { name: "Edit or assign Bagged ice", exact: true }).click();
    const iceEditor = page.getByRole("dialog");
    await iceEditor.getByLabel("Amount").fill("3");
    await iceEditor.getByRole("button", { name: "Save changes" }).click();
    await expect(board.getByText("× 3 10-lb bags")).toBeVisible();
  });
});
