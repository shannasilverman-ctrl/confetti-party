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
    const returnedProbe = await page.evaluate(
      () => document.activeElement?.getAttribute("data-focus-probe") ?? null,
    );
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

      // -------- STEP 3: theme cards + Back/Create --------
      m = await measureTargets(dialog, '[data-testid^="wizard-theme-"]', width, "step3-theme");
      // Some occasions may have no themes; treat 0 as acceptable but log.
      if (m === 0) {
        // No themes for this pack — footer Create is still measurable.
      }
      await measureTargets(dialog, '[data-testid="wizard-back"]', width, "step3-back");
      await measureTargets(dialog, '[data-testid="wizard-create"]', width, "step3-create");

      // Complete the wizard if a theme is available.
      const themes = dialog.locator('[data-testid^="wizard-theme-"]');
      if ((await themes.count()) > 0) {
        await themes.first().click();
        await dialog.getByTestId("wizard-create").click();

        // -------- COMPLETION: Close + Open plan --------
        await expect(dialog.getByTestId("wizard-close")).toBeVisible();
        await measureTargets(dialog, '[data-testid="wizard-close"]', width, "done-close");
        await measureTargets(dialog, '[data-testid="wizard-open-plan"]', width, "done-open");
        await dialog.getByTestId("wizard-close").click();
      } else {
        await page.keyboard.press("Escape");
      }
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

    // Required: seeded checklist. No conditional skip.
    const checklistTab = page.getByTestId("party-tab-checklist").first();
    await expect(checklistTab).toBeVisible();
    await checklistTab.click();
    // A Thanksgiving starter seeds turkey / guest / invite flavored tasks.
    await expect(page.locator("main")).toContainText(/turkey|guest|invite|rsvp/i);

    // Required: seeded Bring Board.
    const bringTab = page.getByTestId("party-tab-bring").first();
    await expect(bringTab).toBeVisible();
    await bringTab.click();
    const items = page.getByTestId("bring-item");
    await expect(items.first()).toBeVisible({ timeout: 10_000 });
    const seededCount = await items.count();
    expect(seededCount, "Thanksgiving starter seeds ≥1 bring item").toBeGreaterThan(0);

    // Prove edits persist across in-session tab navigation. (Demo mode
    // deliberately does not write to localStorage / server — a full reload
    // resets seed data, so persistence is scoped to the live session.)
    await page.getByTestId("party-tab-checklist").first().click();
    await expect(page.locator("main")).toContainText(/turkey|guest|invite|rsvp/i);
    await page.getByTestId("party-tab-bring").first().click();
    await expect(page.getByTestId("bring-item").first()).toBeVisible();
    await page.getByTestId("party-tab-overview").first().click();
    await expect(page.getByText("Sam's Table 2026", { exact: false }).first()).toBeVisible();
  });
});
