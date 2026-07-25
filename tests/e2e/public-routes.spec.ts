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
    const resp = await page.goto(path, { waitUntil: "networkidle" });
    expect(resp?.ok(), `HTTP status for ${path}`).toBeTruthy();

    // Full "Confetti" wordmark visible in the shared brand lockup (link with aria-label)
    await expect(page.getByRole("link", { name: /confetti/i }).first()).toBeVisible();

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

test("RSVP page renders a sanitized not-found state for an unknown token", async ({ page }) => {
  const resp = await page.goto("/rsvp/00000000-0000-0000-0000-000000000000", {
    waitUntil: "domcontentloaded",
  });
  // Deliberate deterministic status: TanStack renders the InvalidInvite UI at 200.
  expect(resp?.status()).toBe(200);
  const body = (await page.textContent("body")) ?? "";
  // Human-readable copy from InvalidInvite — no raw RPC / server error strings.
  expect(body).toMatch(/This invite link doesn.?t look right/i);
  expect(body).not.toMatch(/JWT|PostgREST|SQLSTATE|stack|TypeError|500|internal server/i);
});


test("/talk renders a signed-out demo experience (no redirect to /auth)", async ({ page }) => {
  await page.goto("/talk", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/talk/);
  // Demo affordance visible and steers toward sign-up without forcing it.
  await expect(page.getByText(/demo/i).first()).toBeVisible();
  const signup = page.getByRole("link", { name: /sign up/i }).first();
  await expect(signup).toBeVisible();
});

test("/app party cards use accessible non-nested interactive controls", async ({ page }) => {
  await page.goto("/app", { waitUntil: "domcontentloaded" });
  const nested = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a"));
    return links.some((a) => a.querySelector("button"));
  });
  expect(nested, "found <button> nested inside <a> on /app").toBe(false);
  // Each party card exposes a Duplicate action with an accessible name.
  const dupe = page.getByRole("button", { name: /duplicate/i }).first();
  await expect(dupe).toBeVisible();
});

// Axe scans for stable public pages. Fails on any serious/critical violation
// including color-contrast — no rule exemptions.
for (const path of ["/", "/talk"]) {
  test(`axe: no serious/critical a11y violations on ${path}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "run a11y once per route");
    await page.goto(path, { waitUntil: "domcontentloaded" });
    // Wait for fonts + first paint so contrast is measured against final styles.
    await page.evaluate(() => document.fonts?.ready);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    const detail = blocking
      .map((v) => {
        const nodes = v.nodes
          .slice(0, 5)
          .map((n) => `  · ${n.target.join(" ")}\n    ${n.failureSummary?.split("\n").join(" ")}`)
          .join("\n");
        return `${v.id} (${v.impact}): ${v.help}\n${nodes}`;
      })
      .join("\n---\n");
    expect(blocking, detail).toEqual([]);
  });
}

