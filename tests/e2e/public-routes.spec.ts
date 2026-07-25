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
  "/rsvp/not-a-uuid",
  "/rsvp/00000000-0000-0000-0000-000000000000",
];

for (const path of ROUTES) {
  test(`renders ${path} without horizontal overflow`, async ({ page }, testInfo) => {
    const resp = await page.goto(path, { waitUntil: "networkidle" });
    expect(resp?.ok(), `HTTP status for ${path}`).toBeTruthy();

    // Full "Confetti" wordmark visible in the shared brand lockup (link with aria-label)
    await expect(page.getByRole("link", { name: /confetti/i }).first()).toBeVisible();

    // Landmarks / structure — every page needs one primary landmark and a
    // visible route heading. A heading alone does not provide navigation for
    // screen-reader landmark shortcuts.
    const hasMain = await page.locator("main").count();
    const hasH1 = await page.locator("h1").count();
    expect(hasMain, `${path} should expose exactly one <main>`).toBe(1);
    expect(hasH1, `${path} should expose an <h1>`).toBeGreaterThan(0);

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

test("the original Confetti typography remains a product-wide contract", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const landingType = await page.evaluate(() => ({
    body: getComputedStyle(document.body).fontFamily,
    headline: getComputedStyle(document.querySelector("h1")!).fontFamily,
  }));
  expect(landingType.body).toContain("Outfit");
  expect(landingType.headline).toContain("Fraunces");

  await page.goto("/app", { waitUntil: "networkidle" });
  const appType = await page.evaluate(() => ({
    body: getComputedStyle(document.body).fontFamily,
    headline: getComputedStyle(document.querySelector("h1")!).fontFamily,
  }));
  expect(appType.body).toContain("Outfit");
  expect(appType.headline).toContain("Fraunces");
});

test("mobile app header controls preserve 44px touch targets", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile interaction contract");
  await page.goto("/app", { waitUntil: "networkidle" });
  const controls = await page.locator("header a, header button").evaluateAll((elements) =>
    elements
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "",
          width: rect.width,
          height: rect.height,
        };
      }),
  );
  expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) {
    expect(control.width, `${control.label} width`).toBeGreaterThanOrEqual(44);
    expect(control.height, `${control.label} height`).toBeGreaterThanOrEqual(44);
  }
});

test("focused host modes expose distinct, private browser metadata", async ({ page }) => {
  await page.goto("/party/ava-liam-wedding/reveal");
  await expect(page).toHaveTitle("Party reveal · Confetti");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");

  await page.goto("/party/ava-liam-wedding/day-of");
  await expect(page).toHaveTitle("Day-of Mode · Confetti");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
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

test("/app distinguishes a real guest list from a planning goal", async ({ page }) => {
  await page.goto("/app", { waitUntil: "domcontentloaded" });

  const listedParty = page.getByRole("article", { name: "Ava & Liam" });
  await expect(listedParty.getByText("Guest list")).toBeVisible();
  await expect(listedParty.getByText("7", { exact: true })).toBeVisible();

  const goalOnlyParty = page.getByRole("article", { name: "World Cup Final Watch Party" });
  await expect(goalOnlyParty.getByText("Guest goal")).toBeVisible();
  await expect(goalOnlyParty.getByText("12", { exact: true })).toBeVisible();
});

test("/app tells demo hosts where their parties are actually saved", async ({ page }) => {
  await page.goto("/app", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Saved on this device.", { exact: false })).toBeVisible();
  await expect(page.getByText(/Sign up free to save your parties/i)).toHaveCount(0);
});

test("a date-TBD quick start never exposes its placeholder date to guests", async ({ page }) => {
  await page.goto("/app?new=1", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Start with the idea").fill("Neighborhood potluck");
  await page.getByTestId("wizard-create").click();
  await expect(page.getByText("Your plan is ready")).toBeVisible();
  await page.getByTestId("wizard-open-plan").click();

  await expect(page.getByRole("heading", { level: 1, name: "Neighborhood potluck" })).toBeVisible();
  await expect(page.locator("header").getByText("Date to decide", { exact: true })).toBeVisible();
  await expect(page.getByText("Keep planning—nothing has been guessed.")).toBeVisible();
  await page
    .getByLabel("Party quick actions")
    .getByRole("button", { name: "Finish invite details" })
    .click();

  const dateRequired = page.getByTestId("invite-date-required");
  await expect(dateRequired).toBeVisible();
  await expect(dateRequired.getByText("Date to decide", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy link" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Copy message" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Download image" })).toBeDisabled();

  await page.getByRole("dialog").getByRole("button", { name: "Close" }).first().click();
  await page.getByRole("button", { name: "Copy RSVP link" }).click();
  await expect(page.getByRole("heading", { name: "Pick the date before sharing" })).toBeVisible();
  await page.getByRole("button", { name: "Keep planning" }).click();

  await page.getByRole("button", { name: "Checklist", exact: true }).click();
  const dateTask = page.getByTestId("planning-task-date");
  await expect(dateTask).toBeVisible();
  await expect(dateTask.getByRole("checkbox")).toHaveCount(0);
  await expect(dateTask.getByRole("button", { name: "Delete task" })).toHaveCount(0);
  await expect(dateTask.getByRole("button", { name: "Add details" })).toBeVisible();

  await dateTask.getByRole("button", { name: "Add details" }).click();
  await expect(page.getByRole("heading", { name: "Edit party details" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.getByLabel("Party quick actions").getByRole("link", { name: "Reveal" }).click();
  await expect(page).toHaveURL(/\/reveal$/);
  await expect(page.getByRole("heading", { level: 1, name: "Neighborhood potluck" })).toBeVisible();
  await expect(page.getByRole("main").getByText("Date to decide", { exact: true })).toBeVisible();
  await expect(page.getByText("Saved on this device.", { exact: false })).toBeVisible();
  await expect(page.getByText("Sample reveal.", { exact: false })).toHaveCount(0);

  const dayOfUrl = page.url().replace(/\/reveal$/, "/day-of");
  await page.goto(dayOfUrl, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Next three actions" })).toBeVisible();
  await expect(page.getByText("Saved on this device.", { exact: false })).toBeVisible();
  await expect(page.getByText("Sample Day-of Mode.", { exact: false })).toHaveCount(0);
  await expect(page.getByText("Choose the party date", { exact: true })).toHaveCount(0);

  await page
    .getByRole("textbox", { name: /Running 15 minutes late/i })
    .fill("Pizza will be here at six");
  await page.getByRole("button", { name: "Save local update" }).click();
  await expect(page.getByText(/saved on this device only/i)).toBeVisible();
  await expect(page.getByText(/No guests were notified/i)).toBeVisible();
});

test("retrospective reveal can start the next gathering without setup friction", async ({
  page,
}) => {
  await page.goto("/party/world-cup-final-watch/reveal", { waitUntil: "domcontentloaded" });
  const nextButton = page.getByRole("button", { name: "Plan the next one" });
  await expect(nextButton).toBeVisible();
  await nextButton.click();

  await expect(page).toHaveURL(/\/party\/[^/]+$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "World Cup Final Watch Party — next time" }),
  ).toBeVisible();
  await expect(page.getByText("0 maybe · 0 pending")).toBeVisible();
});

test("sample invite exposes the same practical guest details and calendar actions", async ({
  page,
}) => {
  await page.goto("/sample-invite", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("textbox", { name: "Group name (optional)" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Other dietary needs" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Other allergens" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Google Calendar/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Apple \/ .ics/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Directions/i })).toBeVisible();
});

test("mobile guest and timeline controls fit and remain touch-visible", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile workspace regression");
  await page.goto("/party/ava-liam-wedding", { waitUntil: "domcontentloaded" });

  await page.getByTestId("party-tab-mobile-guests").click();
  await expect(page.getByRole("button", { name: /Remove / }).first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);

  await page.getByTestId("party-tab-mobile-timeline").click();
  await expect(page.getByRole("button", { name: "Move down" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove" }).first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
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
