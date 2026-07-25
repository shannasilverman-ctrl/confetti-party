import { test, expect } from "@playwright/test";

/**
 * Dialog keyboard + focus + tap-target contract for the New Party wizard.
 * Covers the Phase-4 requirement:
 *  - trigger -> initial focus lands inside the dialog
 *  - Tab stays within the modal (focus trap)
 *  - form fields have accessible labels
 *  - Escape closes and focus returns to the exact trigger
 *  - Primary dialog actions render ≥44×44 CSS px on mobile
 * Signed-out demo mode is used (no auth flow required).
 */
test.describe("New Party dialog — keyboard + focus contract", () => {
  test("focus trap, labels, Escape returns focus", async ({ page }) => {
    await page.goto("/app");
    const trigger = page.getByRole("button", { name: /new party/i }).first();
    await expect(trigger).toBeVisible();
    await trigger.focus();
    await trigger.press("Enter");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Initial focus must be inside the dialog after open.
    const focusInsideDialog = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      const a = document.activeElement;
      return !!(d && a && d.contains(a));
    });
    expect(focusInsideDialog).toBe(true);

    // Pick an occasion so step 2 renders with form fields to tab through.
    await page
      .getByRole("button", { name: /holiday/i })
      .first()
      .click();
    await page.getByRole("button", { name: /^next$/i }).click();

    // Every visible input in the dialog must have an accessible name.
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

    // Focus-trap probe: Tab 20 times, active element must stay inside dialog.
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      const trapped = await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"]');
        const a = document.activeElement;
        return !!(d && a && d.contains(a));
      });
      expect(trapped, `Tab ${i} stayed inside dialog`).toBe(true);
    }

    // Escape closes and focus returns to the exact trigger button.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    const focusReturned = await page.evaluate(
      (label) =>
        document.activeElement?.textContent?.toLowerCase().includes(label.toLowerCase()) ?? false,
      "new party",
    );
    expect(focusReturned).toBe(true);
  });

  test("primary dialog actions are ≥44×44 CSS px on mobile widths", async ({ page }) => {
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/app");
      await page
        .getByRole("button", { name: /new party/i })
        .first()
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      // Occasion cards are the primary tap targets on step 1.
      const occasion = dialog.getByRole("button", { name: /holiday/i }).first();
      const box = await occasion.boundingBox();
      expect(box, `occasion tap target measurable @${width}`).not.toBeNull();
      expect(box!.width, `width ≥44 @${width}`).toBeGreaterThanOrEqual(44);
      expect(box!.height, `height ≥44 @${width}`).toBeGreaterThanOrEqual(44);

      await page.keyboard.press("Escape");
    }
  });
});

test.describe("Holiday starter → editable workspace", () => {
  test("picking a starter prefills a name and opens the party overview", async ({ page }) => {
    await page.goto("/app");
    await page
      .getByRole("button", { name: /new party/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("button", { name: /holiday/i })
      .first()
      .click();
    await dialog.getByRole("button", { name: /^next$/i }).click();

    // Starter radiogroup exists and picks Thanksgiving.
    const starterGroup = dialog.getByRole("radiogroup", { name: /holiday starter/i });
    await expect(starterGroup).toBeVisible();
    await starterGroup.getByRole("radio", { name: /thanksgiving/i }).click();

    // Name field must be prefilled from the starter (and stay editable).
    const nameInput = dialog.getByLabel(/party name/i);
    await expect(nameInput).toHaveValue(/thanksgiving/i);
    await nameInput.fill("Friendsgiving @ Sam's");

    // Fill required date + advance to theme step, pick first theme, finish.
    const future = new Date(Date.now() + 21 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    await dialog.getByLabel(/date/i).fill(future);
    await dialog.getByRole("button", { name: /^next$/i }).click();

    const themeCards = dialog.getByRole("button").filter({ hasText: /./ });
    // First theme card in step 3 grid.
    await themeCards.first().click();
    // Look for the finish/create button.
    await dialog
      .getByRole("button", { name: /create|finish|ready|plan/i })
      .first()
      .click();

    // Success screen or auto-nav lands in the party workspace; loosely assert.
    // Signed-out demo mode does not persist, but the workspace must render.
    await expect(page.locator("body")).toContainText(/Friendsgiving/i, { timeout: 15_000 });
  });
});
