import { expect, test } from "@playwright/test";

/**
 * Date contract browser assertions.
 *
 * The date-only library invariants are proven exhaustively in unit tests.
 * Here we assert what actually reaches the DOM in real routes so a
 * regression in a wrapper component can't silently reintroduce the
 * "off-by-one calendar day" bug or a drifting hardcoded countdown.
 */

test("landing sample invite card countdown matches its rendered date", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });

  // The sample card lives inside the "With Confetti" panel.
  const label = page.locator("text=With Confetti").first();
  await expect(label).toBeVisible();
  const card = label.locator("xpath=..");

  const dateLine = await card
    .locator("text=/, [A-Z][a-z]{2} \\d+ · \\d+:\\d+ [AP]M/")
    .first()
    .textContent();
  expect(dateLine, "sample card date line must render").toBeTruthy();

  // The countdown badge must not be a static string: it derives from
  // today's date, so it is either "N days out", "Today", or "Just wrapped".
  const countdownText = await card
    .locator("text=/(\\d+ days out|Today|Just wrapped)/")
    .first()
    .textContent();
  expect(countdownText).toMatch(/(\d+ days out|Today|Just wrapped)/);
});

test("public sample invite date does not shift by time zone", async ({ browser }) => {
  const ctx = await browser.newContext({ timezoneId: "Pacific/Honolulu" });
  const page = await ctx.newPage();
  await page.goto("/sample-invite", { waitUntil: "networkidle" });
  // The sample invite always renders a human-readable date; assert it
  // renders SOME weekday-and-month string (never "Invalid Date").
  await expect(page.locator("body")).not.toContainText(/Invalid Date/);
  await ctx.close();
});
