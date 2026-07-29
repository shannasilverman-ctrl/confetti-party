import { expect, test, type Page } from "@playwright/test";

const IPHONE_WIDTH = 390;

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(overflow.body).toBeLessThanOrEqual(1);
}

function trackPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return () => expect(errors, "uncaught browser errors").toEqual([]);
}

test.describe("Mobile Safari critical release contract", () => {
  test("reduced motion stays still and planning begins without an animation delay", async ({
    page,
  }) => {
    const expectNoPageErrors = trackPageErrors(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const viewport = page.locator('meta[name="viewport"]');
    await expect(viewport).toHaveAttribute("content", /viewport-fit=cover/);

    const activeSlide = page.locator('button[aria-label^="Show "][aria-pressed="true"]');
    const initialSlide = await activeSlide.getAttribute("aria-label");
    await page.waitForTimeout(7_000);
    await expect(activeSlide).toHaveAttribute("aria-label", initialSlide!);

    await page.getByRole("button", { name: "Show The dance floor" }).click();
    await expect(page.locator("video")).toHaveCount(0);

    const startedAt = Date.now();
    await page.getByRole("button", { name: /tell confetti what you.re thinking/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page).toHaveURL(/\/app(?:\?|$)/);
    // Measure the user-visible result, not the intentionally transient
    // `?new=true` trigger that the dashboard removes after opening the wizard.
    // Leave enough headroom for a cold WebKit chunk load while still catching
    // a real animation hold.
    expect(Date.now() - startedAt).toBeLessThan(2_500);
    expectNoPageErrors();
  });

  test("the skip target and party dialog remain keyboard-operable", async ({ page }) => {
    const expectNoPageErrors = trackPageErrors(page);
    await page.goto("/app");
    await expect(page.getByTestId("party-dashboard")).toHaveAttribute("data-hydrated", "true");

    const skip = page.getByRole("link", { name: "Skip to main content" });
    // Mobile Safari only puts links in the hardware-Tab sequence when the
    // person enables Full Keyboard Access. Direct focus still proves the
    // control is reachable and activates the shared fragment target.
    await skip.focus();
    await expect(skip).toBeFocused();
    await skip.press("Enter");
    await expect(page.locator("#route-content")).toBeFocused();

    const trigger = page.getByTestId("new-party-trigger");
    await trigger.focus();
    await trigger.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const dialogBox = await dialog.boundingBox();
    expect(dialogBox).not.toBeNull();
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(IPHONE_WIDTH);

    const textControls = dialog.locator("input:visible, textarea:visible");
    for (let index = 0; index < (await textControls.count()); index++) {
      const fontSize = await textControls
        .nth(index)
        .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
      expect(
        fontSize,
        "iOS text controls stay at 16px+ to avoid focus zoom",
      ).toBeGreaterThanOrEqual(16);
    }

    for (let index = 0; index < 12; index++) {
      await page.keyboard.press("Tab");
      const focusIsTrapped = await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      );
      expect(focusIsTrapped, `Tab ${index} remains inside the modal`).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expectNoHorizontalOverflow(page);
    expectNoPageErrors();
  });

  test("workspace fixed navigation and invite recovery fit an iPhone viewport", async ({
    page,
  }) => {
    const expectNoPageErrors = trackPageErrors(page);
    await page.goto("/party/ava-liam-wedding");
    await expect(page.getByRole("heading", { name: /Ava & Liam/i })).toBeVisible();
    const mobileNav = page.getByTestId("party-mobile-nav");
    await expect(mobileNav).toBeVisible();

    const navBox = await mobileNav.boundingBox();
    expect(navBox).not.toBeNull();
    expect(navBox!.x).toBeGreaterThanOrEqual(0);
    expect(navBox!.x + navBox!.width).toBeLessThanOrEqual(IPHONE_WIDTH);
    expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
    await expectNoHorizontalOverflow(page);

    await page.goto("/rsvp/not-a-uuid");
    await expect(page.getByText("This invite link doesn't look right")).toBeVisible();
    await expect(page.getByText(/JWT|PostgREST|SQLSTATE|500/)).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    expectNoPageErrors();
  });
});
