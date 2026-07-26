import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("accountable, actionable party work", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem("task-ownership-test-ready")) return;
      localStorage.clear();
      sessionStorage.setItem("task-ownership-test-ready", "true");
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            sessionStorage.setItem("task-handoff-copy", value);
          },
        },
      });
    });
  });

  test("a host can understand, act on, and assign a task without a fake notification", async ({
    page,
  }) => {
    await page.goto("/app");
    await expect(page.getByTestId("party-dashboard")).toHaveAttribute("data-hydrated", "true");
    await page.getByTestId("new-party-trigger").click();

    const wizard = page.getByRole("dialog");
    await wizard.getByTestId("wizard-occasion-birthday").click();
    await wizard.getByLabel("Start with the idea").fill("Eliana turns four");
    await wizard.getByLabel("Age they're turning").fill("4");
    await wizard.getByLabel("Children").fill("5");
    await wizard.getByLabel("Adults staying").fill("6");
    await wizard.locator("summary").filter({ hasText: "Add anything you already know" }).click();
    const soon = new Date();
    soon.setDate(soon.getDate() + 3);
    const soonDate = [
      soon.getFullYear(),
      String(soon.getMonth() + 1).padStart(2, "0"),
      String(soon.getDate()).padStart(2, "0"),
    ].join("-");
    await wizard.getByLabel("Date (optional)").fill(soonDate);
    await wizard.getByLabel("Guests (optional)").fill("11");
    await wizard.getByLabel("Budget (optional)").fill("500");
    await wizard.locator('[data-testid^="wizard-theme-"]').first().click();
    await wizard.getByTestId("wizard-create").click();
    await wizard.getByTestId("wizard-open-plan").click();

    await page.getByRole("button", { name: "Checklist", exact: true }).click();
    const row = page
      .locator("li")
      .filter({
        hasText: "Ask about allergies, sibling attendance, and whether an adult is staying",
      })
      .first();
    await expect(row).toBeVisible();
    await expect(
      row.getByText(
        "Those answers change the food, supervision, space, and real headcount before money is spent.",
      ),
    ).toBeVisible();
    await row.getByRole("button", { name: "Open guest list" }).click();
    await expect(page.getByRole("button", { name: "Create invite" })).toBeVisible();

    await page.getByRole("button", { name: "Checklist", exact: true }).click();
    const task = page
      .locator('[data-testid^="checklist-task-"]')
      .filter({
        hasText: "Ask about allergies, sibling attendance, and whether an adult is staying",
      })
      .first();
    await task
      .getByRole("button", {
        name: "Assign: Ask about allergies, sibling attendance, and whether an adult is staying",
      })
      .click();

    const editor = page.getByRole("dialog");
    await expect(editor.getByText(/never messages someone or gives them access/i)).toBeVisible();
    await editor.getByLabel("Who owns this? (optional)").fill("Jordan");
    await editor
      .getByLabel("What does done look like? (optional)")
      .fill("Get every household's answer by Tuesday; flag food or access follow-ups.");
    await editor.getByRole("button", { name: "Save & hand off" }).click();
    await expect(page.getByText("Handoff copied—not sent")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem("task-handoff-copy")))
      .toContain("Jordan — can you own this for Eliana turns four?");
    await expect
      .poll(() => page.evaluate(() => sessionStorage.getItem("task-handoff-copy")))
      .toContain("Done means: Get every household's answer by Tuesday");
    await expect(
      task.getByRole("button", {
        name: "Task owner: Jordan, status: Copied — still needs sending",
      }),
    ).toBeVisible();

    const followThrough = page.getByTestId("task-owner-follow-through");
    await expect(followThrough).toContainText("Ownership follow-through");
    await expect(followThrough).toContainText("Copied — still needs sending");
    await task
      .getByRole("button", {
        name: "Task owner: Jordan, status: Copied — still needs sending",
      })
      .click();
    await page.getByRole("dialog").getByLabel("Where does the handoff stand?").click();
    await page.getByRole("option", { name: "Waiting for owner confirmation" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Save task" }).click();
    await expect(
      task.getByRole("button", {
        name: "Task owner: Jordan, status: Waiting for owner confirmation",
      }),
    ).toBeVisible();
    await expect(followThrough).toContainText("Waiting for owner confirmation");

    const dayOfTask = page
      .locator('[data-testid^="checklist-task-"]')
      .filter({ hasText: "Confirm RSVPs" })
      .first();
    await dayOfTask.getByRole("button", { name: "Assign: Confirm RSVPs" }).click();
    await page.getByRole("dialog").getByLabel("Who owns this? (optional)").fill("Casey");
    await page.getByRole("dialog").getByRole("button", { name: "Save task" }).click();

    await page.getByRole("button", { name: "Overview", exact: true }).click();
    await expect(page.getByLabel("Up next tasks")).toContainText(
      "Ask about allergies, sibling attendance, and whether an adult is staying",
    );
    await expect(
      page.getByLabel("Up next tasks").getByRole("button", {
        name: "Task owner: Jordan, status: Waiting for owner confirmation",
      }),
    ).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Checklist", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Checklist", exact: true }).click();
    await expect(
      page
        .locator('[data-testid^="checklist-task-"]')
        .filter({
          hasText: "Ask about allergies, sibling attendance, and whether an adult is staying",
        })
        .first()
        .getByRole("button", {
          name: "Task owner: Jordan, status: Waiting for owner confirmation",
        }),
    ).toBeVisible();
    await page
      .locator('[data-testid^="checklist-task-"]')
      .filter({
        hasText: "Ask about allergies, sibling attendance, and whether an adult is staying",
      })
      .first()
      .getByRole("button", {
        name: "Task owner: Jordan, status: Waiting for owner confirmation",
      })
      .click();
    await expect(
      page.getByRole("dialog").getByLabel("What does done look like? (optional)"),
    ).toHaveValue("Get every household's answer by Tuesday; flag food or access follow-ups.");
    await page.getByRole("dialog").getByLabel("Where does the handoff stand?").click();
    await page.getByRole("option", { name: "Owner confirmed" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Save task" }).click();
    await expect(page.locator('[role="dialog"][data-state="closed"]')).toHaveCount(0);
    await expect(
      page
        .locator('[data-testid^="checklist-task-"]')
        .filter({
          hasText: "Ask about allergies, sibling attendance, and whether an adult is staying",
        })
        .first()
        .getByRole("button", {
          name: "Task owner: Jordan, status: Owner confirmed",
        }),
    ).toBeVisible();
    await expect(
      page.getByTestId("task-owner-follow-through").locator("li").filter({
        hasText: "Ask about allergies, sibling attendance, and whether an adult is staying",
      }),
    ).toHaveCount(0);

    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(
      accessibility.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
      ),
    ).toEqual([]);

    await page.goto(`${page.url()}/day-of`, { waitUntil: "domcontentloaded" });
    const dayOfModeTask = page.locator("li").filter({ hasText: "Confirm RSVPs" }).first();
    await expect(dayOfModeTask).toBeVisible();
    await expect(
      dayOfModeTask.getByRole("button", {
        name: "Task owner: Casey, status: Ready to hand off",
      }),
    ).toBeVisible();
  });
});
