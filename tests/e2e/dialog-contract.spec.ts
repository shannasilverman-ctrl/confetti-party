import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * Dialog keyboard + focus + tap-target contract for the New Party wizard.
 * Covers the Phase-4 requirement:
 *  - trigger -> initial focus lands inside the dialog
 *  - Tab stays within the modal (focus trap)
 *  - form fields have accessible labels
 *  - Escape closes and focus returns to the exact trigger
 *  - Every visible primary action across ALL wizard steps renders ≥44×44 CSS px
 * Signed-out demo mode is used (no auth flow required).
 */

const WIDTHS = [320, 375, 390, 430] as const;

async function measureTargets(scope: Locator, selector: string, width: number, stepLabel: string) {
  const items = scope.locator(selector);
  const n = await items.count();
  let measured = 0;
  for (let i = 0; i < n; i++) {
    const el = items.nth(i);
    if (!(await el.isVisible())) continue;
    const box = await el.boundingBox();
    if (!box) continue;
    const label =
      (await el.getAttribute("aria-label")) ||
      ((await el.textContent()) ?? "").trim().slice(0, 60) ||
      (await el.getAttribute("data-testid")) ||
      selector;
    expect(
      box.width,
      `[@${width}/${stepLabel}] "${label}" width ${box.width.toFixed(1)} <44`,
    ).toBeGreaterThanOrEqual(44);
    expect(
      box.height,
      `[@${width}/${stepLabel}] "${label}" height ${box.height.toFixed(1)} <44`,
    ).toBeGreaterThanOrEqual(44);
    measured++;
  }
  return measured;
}

async function openWizard(page: Page) {
  await page.goto("/app");
  await page.waitForLoadState("networkidle");
  const trigger = page.getByTestId("new-party-trigger");
  await expect(trigger).toBeVisible();
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("New Party dialog — keyboard + focus contract", () => {
  test("focus trap, labels, Escape returns focus to the exact trigger", async ({ page }) => {
    await page.goto("/app");
    await page.waitForLoadState("networkidle");
    const trigger = page.getByTestId("new-party-trigger");
    await expect(trigger).toBeVisible();
    // Stamp the DOM node with a probe id so the post-close focus check can
    // compare *stable node identity*, not user-facing text.
    await trigger.evaluate((el) => el.setAttribute("data-focus-probe", "trigger-a"));
    await trigger.focus();
    await trigger.press("Enter");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const focusInsideDialog = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      const a = document.activeElement;
      return !!(d && a && d.contains(a));
    });
    expect(focusInsideDialog).toBe(true);

    // Pick Holiday so step 2 renders inputs to tab through.
    await dialog.getByTestId("wizard-occasion-holiday").click();
    await dialog.getByTestId("wizard-continue").click();

    const dialogInputs = dialog.locator("input");
    const count = await dialogInputs.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const input = dialogInputs.nth(i);
      if (!(await input.isVisible())) continue;
      const name = await input.evaluate((el) => {
        const id = (el as HTMLInputElement).id;
        const label = id ? document.querySelector(`label[for="${id}"]`) : null;
        return (
          el.getAttribute("aria-label") ??
          label?.textContent?.trim() ??
          el.getAttribute("placeholder") ??
          ""
        );
      });
      expect(name.length, "input has an accessible name").toBeGreaterThan(0);
    }

    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      const trapped = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        const a = document.activeElement;
        return !!(d && a && d.contains(a));
      });
      expect(trapped, `Tab ${i} stayed inside dialog`).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    // Radix restores focus asynchronously — wait for the trigger to be focused
    // before reading the probe attribute rather than racing document.activeElement.
    await expect(trigger).toBeFocused();
    const returnedProbe = await trigger.getAttribute("data-focus-probe");
    expect(returnedProbe).toBe("trigger-a");
  });

  test("every visible primary tap target across ALL wizard steps is ≥44×44 CSS px", async ({
    page,
  }) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const dialog = await openWizard(page);

      // -------- STEP 1: occasion picker + footer Cancel/Continue --------
      let m = await measureTargets(dialog, '[data-testid^="wizard-occasion-"]', width, "step1");
      expect(m, `step 1 measured ≥1 occasion @${width}`).toBeGreaterThan(0);
      // Footer buttons at step 1: Cancel + Continue (Continue is disabled but visible).
      await measureTargets(dialog, '[data-testid="wizard-back"]', width, "step1-cancel");
      await measureTargets(dialog, '[data-testid="wizard-continue"]', width, "step1-continue");

      // Select Holiday to enter step 2 with starter chips.
      await dialog.getByTestId("wizard-occasion-holiday").click();
      await dialog.getByTestId("wizard-continue").click();
      await expect(dialog.getByTestId("wizard-step-2")).toBeVisible();

      // -------- STEP 2: starter chips + inputs + Back/Continue --------
      m = await measureTargets(dialog, '[data-testid^="wizard-starter-"]', width, "step2-starter");
      expect(m, `step 2 measured ≥1 starter chip @${width}`).toBeGreaterThan(0);
      // Inputs (name/date/time/location) must also meet 44px.
      await measureTargets(dialog, "input", width, "step2-inputs");
      await measureTargets(dialog, '[data-testid="wizard-back"]', width, "step2-back");
      await measureTargets(dialog, '[data-testid="wizard-continue"]', width, "step2-continue");

      // Pick a starter so name is prefilled, then fill date and advance.
      await dialog.getByTestId("wizard-starter-thanksgiving").click();
      const future = new Date(Date.now() + 21 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      await dialog.getByLabel(/date/i).fill(future);
      await dialog.getByTestId("wizard-continue").click();
      await expect(dialog.getByTestId("wizard-step-3")).toBeVisible();

      // -------- STEP 3: Holiday themes are curated — require ≥1 --------
      m = await measureTargets(dialog, '[data-testid^="wizard-theme-"]', width, "step3-theme");
      expect(m, `step 3 measured ≥1 theme card @${width}`).toBeGreaterThan(0);
      await measureTargets(dialog, '[data-testid="wizard-back"]', width, "step3-back");
      await measureTargets(dialog, '[data-testid="wizard-create"]', width, "step3-create");

      // Winter Wonderland is a stable holiday theme id (see src/lib/themes.ts).
      await dialog.getByTestId("wizard-theme-winter-wonderland").click();
      await dialog.getByTestId("wizard-create").click();

      // -------- COMPLETION: Close + Open plan --------
      await expect(dialog.getByTestId("wizard-close")).toBeVisible();
      await measureTargets(dialog, '[data-testid="wizard-close"]', width, "done-close");
      await measureTargets(dialog, '[data-testid="wizard-open-plan"]', width, "done-open");
      await dialog.getByTestId("wizard-close").click();
      await expect(dialog).toBeHidden();
    }
  });
});

test.describe("Holiday starter → editable workspace", () => {
  test("picking a starter prefills name, seeds checklist + bring board, persists edits", async ({
    page,
  }) => {
    const dialog = await openWizard(page);
    await dialog.getByTestId("wizard-occasion-holiday").click();
    await dialog.getByTestId("wizard-continue").click();

    await dialog.getByTestId("wizard-starter-thanksgiving").click();

    const nameInput = dialog.getByLabel(/party name/i);
    await expect(nameInput).toHaveValue(/thanksgiving/i);
    await nameInput.fill("Friendsgiving @ Sam's");

    const future = new Date(Date.now() + 21 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    await dialog.getByLabel(/date/i).fill(future);
    await dialog.getByTestId("wizard-continue").click();

    const themes = dialog.locator('[data-testid^="wizard-theme-"]');
    await expect(themes.first()).toBeVisible();
    await themes.first().click();
    await dialog.getByTestId("wizard-create").click();

    // Enter workspace via the completion CTA (stable, no text search).
    await dialog.getByTestId("wizard-open-plan").click();
    await page.waitForLoadState("networkidle");

    // Rename via Edit details and assert persistence.
    const editBtn = page.getByTestId("edit-details-trigger").first();
    await expect(editBtn).toBeVisible();
    await editBtn.click();
    const editDialog = page.getByRole("dialog");
    await expect(editDialog).toBeVisible();
    await editDialog.getByLabel(/party name/i).fill("Sam's Table 2026");
    await editDialog.getByRole("button", { name: /save changes/i }).click();
    await expect(editDialog).toBeHidden();
    await expect(page.getByText("Sam's Table 2026", { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });

    // Required: seeded checklist. Use a resilient locator that matches either
    // the desktop tab (`party-tab-*`) or the mobile bottom-nav twin
    // (`party-tab-mobile-*`) and pick whichever is currently visible.
    const tab = async (key: string) => {
      const desk = page.getByTestId(`party-tab-${key}`);
      const mob = page.getByTestId(`party-tab-mobile-${key}`);
      const visible = (await desk.isVisible()) ? desk : mob;
      await expect(visible).toBeVisible();
      await visible.click();
    };

    await tab("checklist");
    await expect(page.locator("main")).toContainText(/turkey|guest|invite|rsvp/i);

    await tab("bring");
    await expect(page.getByTestId("bring-item").first()).toBeVisible({ timeout: 10_000 });
    const seededCount = await page.getByTestId("bring-item").count();
    expect(seededCount, "Thanksgiving starter seeds ≥1 bring item").toBeGreaterThan(0);

    // Prove edits persist across in-session tab navigation. (Demo mode
    // deliberately does not write to localStorage / server — a full reload
    // resets seed data, so persistence is scoped to the live session.)
    await tab("overview");
    await expect(page.getByText("Sam's Table 2026", { exact: false }).first()).toBeVisible();
  });
});
