import { expect, test } from "@playwright/test";

test("day-of mode keeps the live moment and next transition together", async ({ page }) => {
  await page.clock.install({ time: new Date(2027, 4, 22, 18, 10) });
  await page.goto("/party/ava-liam-wedding/day-of", { waitUntil: "domcontentloaded" });

  const runSheet = page.getByTestId("day-of-run-sheet");
  await expect(runSheet.getByText("Live run sheet", { exact: true })).toBeVisible();
  await expect(runSheet.getByRole("heading", { name: "Stay with this moment" })).toBeVisible();
  await expect(
    runSheet.getByText("Ceremony under the cypress arch", { exact: true }),
  ).toBeVisible();
  await expect(runSheet.getByText("Aperitivo & family photos", { exact: true })).toBeVisible();
  await expect(runSheet.getByText("In 5 min", { exact: true })).toBeVisible();

  const fullRunSheet = page.getByText("Full run sheet", { exact: true }).locator("..");
  await expect(
    fullRunSheet.locator("li").filter({ hasText: "Ceremony under the cypress arch" }),
  ).toHaveAttribute("aria-current", "step");
  await expect(
    fullRunSheet.locator("li").filter({ hasText: "Aperitivo & family photos" }),
  ).toContainText("Next");

  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});
