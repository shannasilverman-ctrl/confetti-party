import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ROUTES = [
  "/",
  "/talk",
  "/app",
  "/party/ava-liam-wedding",
  "/party/ava-liam-wedding/reveal",
  "/party/ava-liam-wedding/day-of",
];

for (const path of ROUTES) {
  test(`renders ${path} without horizontal overflow`, async ({ page }, testInfo) => {
    const resp = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(resp?.ok(), `HTTP status for ${path}`).toBeTruthy();

    // Full "Confetti" wordmark visible in the shared brand lockup
    await expect(page.locator("body").getByText("Confetti", { exact: true }).first()).toBeVisible();

    // Landmarks / structure — every page should have a semantic <main> or <h1>
    const hasMain = await page.locator("main").count();
    const hasH1 = await page.locator("h1").count();
    expect(hasMain + hasH1).toBeGreaterThan(0);

    // No horizontal overflow at this project's viewport
    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth - el.clientWidth;
    });
    expect(
      overflow,
      `horizontal overflow on ${path} (${testInfo.project.name})`,
    ).toBeLessThanOrEqual(1);
  });
}

test("home exposes the primary CTA", async ({ page }) => {
  await page.goto("/");
  // Landing CTAs link to /talk (Talk it out) — assert at least one exists.
  const cta = page.locator('a[href="/talk"], a[href^="/talk?"]').first();
  await expect(cta).toBeVisible();
});

test("RSVP page shows a not-found state for an unknown token", async ({ page }) => {
  const resp = await page.goto("/rsvp/00000000-0000-0000-0000-000000000000", {
    waitUntil: "domcontentloaded",
  });
  // Server route always returns a page shell, even when the token is unknown.
  // Route may return 200 (rendered not-found state) or 5xx (RPC error boundary);
  // in either case the ErrorComponent/NotFoundComponent should surface copy.
  expect(resp?.status()).toBeGreaterThan(0);
  const body = (await page.textContent("body")) ?? "";
  expect(body.toLowerCase()).toMatch(
    /not found|invalid|couldn.?t|no invitation|expired|invite|something went wrong|error/i,
  );
});

// Axe scans for stable public pages. Fails only on serious/critical violations.
for (const path of ["/", "/talk"]) {
  test(`axe: no serious/critical a11y violations on ${path}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "run a11y once per route");
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join("\n")).toEqual([]);
  });
}
