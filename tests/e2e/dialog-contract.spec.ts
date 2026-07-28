import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * Dialog keyboard + focus + tap-target contract for the New Party wizard.
 * Covers the Phase-4 requirement:
 *  - trigger -> initial focus lands inside the dialog
 *  - Tab stays within the modal (focus trap)
 *  - form fields have accessible labels
 *  - Escape closes and focus returns to the exact trigger
 *  - Every visible primary action on the one-canvas flow renders ≥44×44 CSS px
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

    // Pick Holiday so the optional starter controls render.
    await dialog.getByTestId("wizard-occasion-holiday").click();

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

  test("every visible primary tap target on the frictionless canvas is ≥44×44 CSS px", async ({
    page,
  }) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      const dialog = await openWizard(page);

      // One canvas: idea, optional occasion/starter/details/theme, then create.
      let m = await measureTargets(dialog, '[data-testid^="wizard-occasion-"]', width, "step1");
      expect(m, `step 1 measured ≥1 occasion @${width}`).toBeGreaterThan(0);
      await measureTargets(dialog, '[data-testid="wizard-back"]', width, "step1-cancel");
      await measureTargets(dialog, '[data-testid="wizard-create"]', width, "step1-create");

      await dialog.getByTestId("wizard-occasion-holiday").click();
      m = await measureTargets(dialog, '[data-testid^="wizard-starter-"]', width, "starter");
      expect(m, `measured ≥1 starter chip @${width}`).toBeGreaterThan(0);
      await dialog.getByTestId("wizard-starter-thanksgiving").click();
      await measureTargets(dialog, "input:visible", width, "inputs");
      m = await measureTargets(dialog, '[data-testid^="wizard-theme-"]', width, "theme");
      expect(m, `measured ≥1 optional theme @${width}`).toBeGreaterThan(0);
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

    await dialog.getByTestId("wizard-starter-thanksgiving").click();

    const nameInput = dialog.getByLabel(/start with the idea/i);
    await expect(nameInput).toHaveValue(/thanksgiving/i);
    await nameInput.fill("Friendsgiving @ Sam's");

    const future = new Date(Date.now() + 21 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const details = dialog.locator("details");
    await details.locator("summary").click();
    await dialog.getByLabel(/date/i).fill(future);
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

test.describe("Frictionless starting plan", () => {
  test("one idea creates a usable plan and turns blanks into next steps", async ({ page }) => {
    const dialog = await openWizard(page);
    await dialog.getByLabel(/start with the idea/i).fill("A cozy dinner with friends");
    await dialog.getByTestId("wizard-create").click();
    await dialog.getByTestId("wizard-open-plan").click();
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Date to decide", { exact: false }).first()).toBeVisible();
    const target = page
      .locator(
        '[data-testid="party-tab-checklist"]:visible, [data-testid="party-tab-mobile-checklist"]:visible',
      )
      .first();
    await expect(target).toBeVisible();
    await target.click();
    await expect(page.locator("main")).toContainText("Choose the party date");
    await expect(page.locator("main")).toContainText("Estimate the guest count");
    await expect(page.locator("main")).toContainText("Set a comfortable budget");
  });
});

// A centred dialog taller than a phone used to lose content off BOTH ends with
// no way to reach it — the close button included, leaving save as the only exit.
for (const width of [320, 390, 430]) {
  test(`dialogs stay on-screen and every control is reachable @ ${width}px`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "phone geometry contract");
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/party/ava-liam-wedding", { waitUntil: "domcontentloaded" });
    await page.getByTestId("edit-details-trigger").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const result = await page.evaluate(async () => {
      const d = document.querySelector('[role="dialog"]') as HTMLElement;
      const scroller =
        ([...d.querySelectorAll("*")] as HTMLElement[]).find(
          (el) => el.scrollHeight > el.clientHeight + 4,
        ) ?? d;
      const closeReachable = () => {
        const x = [...d.querySelectorAll("button")].find((el) =>
          /close/i.test(el.textContent || ""),
        );
        if (!x) return false;
        const r = x.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= window.innerHeight + 1 && r.width > 0;
      };
      const closeAtTop = closeReachable();
      scroller.scrollTop = scroller.scrollHeight;
      await new Promise((r) => setTimeout(r, 250));
      const actions = [...d.querySelectorAll("button")]
        .filter((el) => /save|cancel/i.test(el.textContent || ""))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= window.innerHeight + 1;
        });
      const dr = d.getBoundingClientRect();
      return {
        fits: dr.top >= 0 && dr.bottom <= window.innerHeight,
        hOverflow: Math.max(0, scroller.scrollWidth - scroller.clientWidth),
        docOverflow: Math.max(
          0,
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
        closeAtTop,
        closeAtBottom: closeReachable(),
        actionsReachable: actions.length > 0 && actions.every(Boolean),
      };
    });

    expect(result.fits, "dialog must fit the viewport").toBe(true);
    expect(result.hOverflow, "dialog must never scroll horizontally").toBe(0);
    expect(result.docOverflow, "page must never scroll horizontally").toBe(0);
    expect(result.closeAtTop, "close reachable at scroll top").toBe(true);
    expect(result.closeAtBottom, "close stays pinned when scrolled").toBe(true);
    expect(result.actionsReachable, "save/cancel reachable by scrolling").toBe(true);
  });
}
