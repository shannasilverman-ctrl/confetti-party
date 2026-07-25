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

    // Initial focus must land *inside* the dialog after open.
    const focusInsideDialog = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      const a = document.activeElement;
      return !!(d && a && d.contains(a));
    });
    expect(focusInsideDialog).toBe(true);

    // Pick an occasion so step 2 renders with form fields to tab through.
    await dialog
      .getByRole("button", { name: /holiday/i })
      .first()
      .click();
    await dialog.getByRole("button", { name: /continue|next/i }).click();

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

    // Escape closes and focus returns to the *exact same DOM node* by probe id.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    const returnedProbe = await page.evaluate(
      () => document.activeElement?.getAttribute("data-focus-probe") ?? null,
    );
    expect(returnedProbe).toBe("trigger-a");
  });

  test("every visible primary tap target inside the wizard is ≥44×44 CSS px", async ({ page }) => {
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/app");
      await page.waitForLoadState("networkidle");
      await page.getByTestId("new-party-trigger").click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      // Measure every visible role=button inside the dialog on step 1.
      const buttons = dialog.getByRole("button");
      const btnCount = await buttons.count();
      let measured = 0;
      for (let i = 0; i < btnCount; i++) {
        const b = buttons.nth(i);
        if (!(await b.isVisible())) continue;
        const box = await b.boundingBox();
        if (!box) continue;
        const label = (await b.textContent())?.trim().slice(0, 40) || `button[${i}]`;
        expect(
          box.width,
          `[@${width}] "${label}" width ${box.width.toFixed(1)} <44`,
        ).toBeGreaterThanOrEqual(44);
        expect(
          box.height,
          `[@${width}] "${label}" height ${box.height.toFixed(1)} <44`,
        ).toBeGreaterThanOrEqual(44);
        measured++;
      }
      expect(measured, `measured ≥1 tap target @${width}`).toBeGreaterThan(0);

      await page.keyboard.press("Escape");
    }
  });
});

test.describe("Holiday starter → editable workspace", () => {
  test("picking a starter prefills a name and produces an editable workspace", async ({ page }) => {
    await page.goto("/app");
    await page.waitForLoadState("networkidle");
    const trigger = page.getByTestId("new-party-trigger");
    await expect(trigger).toBeVisible();
    await trigger.focus();
    await trigger.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole("button", { name: /holiday/i })
      .first()
      .click();
    await dialog.getByRole("button", { name: /continue|next/i }).click();

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
    await dialog.getByRole("button", { name: /continue|next/i }).click();

    // Theme cards use the theme name as accessible name; pick the first holiday theme.
    await dialog
      .getByRole("button", { name: /winter wonderland|cozy cabin|sparkle and shine/i })
      .first()
      .click();
    await dialog
      .getByRole("button", { name: /create party/i })
      .first()
      .click();

    // Party card renders with the chosen name.
    await expect(page.getByText("Friendsgiving @ Sam's", { exact: false })).toBeVisible({
      timeout: 15_000,
    });

    // Prove editability: open the party, then use Edit details to rename it,
    // and assert the new name appears everywhere it should.
    await page.getByText("Friendsgiving @ Sam's", { exact: false }).first().click();
    await page.waitForLoadState("networkidle");

    const editBtn = page.getByRole("button", { name: /edit details/i }).first();
    await expect(editBtn).toBeVisible();
    await editBtn.click();
    const editDialog = page.getByRole("dialog");
    await expect(editDialog).toBeVisible();
    const editNameField = editDialog.getByLabel(/party name/i);
    await editNameField.fill("Sam's Table 2026");
    await editDialog.getByRole("button", { name: /save changes/i }).click();
    await expect(editDialog).toBeHidden();

    // The renamed workspace persists in the header/hero.
    await expect(page.getByText("Sam's Table 2026", { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    });

    // At least one seeded Thanksgiving-flavored task is visible in the checklist.
    const checklistTab = page.getByRole("tab", { name: /checklist|tasks/i }).first();
    if (await checklistTab.count()) {
      await checklistTab.click();
      await expect(page.locator("body")).toContainText(/turkey|guest|invite/i);
    }
  });
});
