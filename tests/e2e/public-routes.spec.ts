import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const ROUTES = [
  "/",
  "/talk",
  "/sample-invite",
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

test("RSVP page: malformed token → deterministic not-found copy at 200", async ({ page }) => {
  const resp = await page.goto("/rsvp/not-a-uuid", { waitUntil: "domcontentloaded" });
  // Sanitized UI is intentional: return 200 so shared invite links don't
  // trigger scary browser error pages.
  expect(resp?.status()).toBe(200);
  const body = (await page.textContent("body")) ?? "";
  // Malformed input can ONLY be not-found — assert exact status copy.
  expect(body).toMatch(/This invite link doesn.?t look right/i);
  expect(body).not.toMatch(/temporarily unavailable/i);
  expect(body).not.toMatch(/JWT|PostgREST|SQLSTATE|stack|TypeError|500|internal server/i);
});

test("RSVP page: well-formed but unknown token → sanitized copy at 200", async ({ page }) => {
  const resp = await page.goto("/rsvp/00000000-0000-0000-0000-000000000000", {
    waitUntil: "domcontentloaded",
  });
  expect(resp?.status()).toBe(200);
  const body = (await page.textContent("body")) ?? "";
  // A well-formed UUID that doesn't resolve MUST render one of the two
  // sanitized branches — never a raw error. Which branch depends on
  // whether the Worker has Supabase secrets: local dev with `.env` hits
  // the RPC and gets not_found; a clean CI runner without secrets short
  // circuits to temporarily_unavailable. Both are covered exhaustively
  // by rsvp-loader.test.ts unit coverage.
  expect(body).toMatch(
    /This invite link doesn.?t look right|This invite is temporarily unavailable/i,
  );
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

// Axe scans across the stable public + demo workspace surface. Fails on any
// serious/critical violation including color-contrast — no rule exemptions.
const AXE_ROUTES = [
  "/",
  "/talk",
  "/sample-invite",
  "/app",
  "/party/ava-liam-wedding",
  "/party/ava-liam-wedding/reveal",
  "/party/ava-liam-wedding/day-of",
  "/rsvp/00000000-0000-0000-0000-000000000000",
  "/rsvp/not-a-uuid",
];
for (const path of AXE_ROUTES) {
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
