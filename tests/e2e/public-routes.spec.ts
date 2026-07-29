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

test("home opens with a controllable multi-event party scene", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const hero = page.getByRole("region", { name: "Gatherings planned with Confetti" });
  await expect(hero).toBeVisible();
  await expect(hero.getByRole("heading", { name: /Bring the idea/i })).toBeVisible();
  await hero.getByRole("button", { name: "Pause event carousel" }).click();
  await expect(hero.getByRole("button", { name: "Play event carousel" })).toBeVisible();
  await hero.getByRole("button", { name: "Show Weddings & milestones" }).click();
  await expect(hero.getByRole("heading", { name: /Every meaningful detail/i })).toBeVisible();
  await hero.getByRole("button", { name: "Show The dance floor" }).click();
  await expect(hero.getByRole("heading", { name: /Make the plan/i })).toBeVisible();
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

test("/talk makes a messy idea easy to start in text or voice", async ({ page }) => {
  await page.goto("/talk", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Start messy/i })).toBeVisible();

  await page.getByRole("button", { name: "A backyard birthday that feels easy" }).click();
  await expect(page.getByLabel("Message Confetti")).toHaveValue(
    "A backyard birthday that feels easy",
  );

  await page.getByRole("tab", { name: "Voice" }).click();
  await expect(page.getByRole("heading", { name: /Say it out loud/i })).toBeVisible();
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

test("/app promotes the next party once instead of repeating it as a card", async ({ page }) => {
  await page.goto("/app", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Everything else, still in hand" })).toBeVisible();
  await expect(page.locator('a[href="/party/maya-8th"]')).toHaveCount(1);
  await expect(page.getByRole("article", { name: "Maya's 8th Birthday" })).toHaveCount(0);
  await expect(page.getByText("One idea is enough", { exact: true })).toBeVisible();
  await expect(page.getByText("3 quick steps", { exact: true })).toHaveCount(0);
});

test("a seeded party offers truthful local paths without fake marketplace data", async ({
  page,
}) => {
  await page.goto("/party/maya-8th", { waitUntil: "domcontentloaded" });
  const local = page.getByRole("region", { name: "Make it local" });
  await expect(local).toBeVisible();
  await expect(
    local.getByText(/bring the finalists back here.*keep the choice, price, and follow-through/i),
  ).toBeVisible();
  await expect(local.getByRole("link", { name: /Search venues/i })).toHaveAttribute(
    "href",
    /google\.com\/maps\/search/,
  );
  await expect(local.getByText(/not endorsements/i)).toBeVisible();
});

test("/app shows completed demo guest lists truthfully", async ({ page }) => {
  await page.goto("/app", { waitUntil: "domcontentloaded" });

  const listedParty = page.getByRole("article", { name: "Ava & Liam" });
  await expect(listedParty.getByText("Guest list")).toBeVisible();
  await expect(listedParty.getByText("7", { exact: true })).toBeVisible();

  const gameDayParty = page.getByRole("article", { name: "World Cup Final Watch Party" });
  await expect(gameDayParty.getByText("Guest list")).toBeVisible();
  await expect(gameDayParty.getByText("5", { exact: true })).toBeVisible();
});

test("every demo gathering renders a complete, loaded banner", async ({ page }) => {
  const partyIds = ["maya-8th", "ava-liam-wedding", "grad-bbq", "world-cup-final-watch"] as const;

  await page.goto("/app", { waitUntil: "networkidle" });
  for (const partyId of partyIds) {
    const banner = page.locator(`[data-party-banner="${partyId}"]`);
    await expect(banner).toHaveCount(1);
    await expect(banner).toBeVisible();
    await expect
      .poll(() =>
        banner.evaluate((image: HTMLImageElement) => ({
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
        })),
      )
      .toMatchObject({ complete: true });
    expect(await banner.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(
      400,
    );
    expect(await banner.evaluate((image: HTMLImageElement) => image.naturalHeight)).toBeGreaterThan(
      200,
    );
  }

  for (const partyId of partyIds) {
    await page.goto(`/party/${partyId}`, { waitUntil: "networkidle" });
    const banner = page.locator(`[data-party-banner="${partyId}"]`);
    await expect(banner).toBeVisible();
    expect(await banner.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(
      400,
    );

    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    const hitTarget = await heading.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const x = rect.left + Math.min(rect.width / 2, 24);
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      return hit === element || element.contains(hit);
    });
    expect(hitTarget, `${partyId} banner must not cover its heading`).toBe(true);
  }
});

test("/app tells demo hosts where their parties are actually saved", async ({ page }) => {
  await page.goto("/app", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Saved on this device.", { exact: false })).toBeVisible();
  await expect(page.getByText(/Sign up free to save your parties/i)).toHaveCount(0);

  const keepLink = page.getByRole("link", { name: "Keep them everywhere" });
  const href = await keepLink.getAttribute("href");
  const destination = new URL(href ?? "", page.url());
  expect(destination.pathname).toBe("/auth");
  expect(destination.searchParams.get("mode")).toBe("signup");
  expect(destination.searchParams.get("returnTo")).toBe("/app?claimDemo=1");
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

  const nextMoves = page.getByRole("region", { name: "Your next moves" });
  await expect(nextMoves).toBeVisible();
  await expect(nextMoves.getByText(/One decision unlocks the rest/i)).toBeVisible();
  await expect(nextMoves.getByRole("button", { name: "Choose date" })).toBeVisible();
  await expect(nextMoves.getByRole("button", { name: "Estimate guests" })).toBeVisible();
  await expect(nextMoves.getByRole("button", { name: "Set budget" })).toBeVisible();
  await expect(nextMoves.getByText("Start here", { exact: true })).toBeVisible();
  await expect(nextMoves.getByText("Send invites", { exact: true })).toHaveCount(0);

  await nextMoves.getByRole("button", { name: "Choose date" }).click();
  await expect(page.getByRole("heading", { name: "Edit party details" })).toBeVisible();
  await expect(page.locator("#ed-date")).toBeFocused();
  await page.getByRole("button", { name: "Cancel" }).click();

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
  await expect(page.getByTestId("sample-rsvp-form")).toHaveAttribute("data-hydrated", "true");
  await expect(page.getByRole("textbox", { name: "Group name (optional)" })).toBeVisible();
  const foodDetails = page.locator("details").filter({
    hasText: "Dietary needs or allergies?",
  });
  const foodSummary = foodDetails.locator("summary");
  await expect(foodSummary).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Other dietary needs" })).toBeHidden();
  await foodSummary.click();
  await expect(page.getByRole("textbox", { name: "Other dietary needs" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Other allergens" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Google Calendar/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Apple \/ .ics/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Directions/i })).toBeVisible();
});

test("sample invite turns a guest photo into a private event keepsake", async ({ page }) => {
  await page.goto("/sample-invite", { waitUntil: "domcontentloaded" });

  const booth = page.getByRole("region", { name: /Take home a photo made for Ava & Liam/i });
  await expect(booth).toBeVisible();
  // The entry card is SSR-rendered. Wait for the component's explicit client
  // readiness contract before exercising its first mobile tap.
  await expect(booth).toHaveAttribute("data-hydrated", "true");
  await expect(booth.getByText("No upload. No account. No photo storage.")).toBeVisible();
  await booth.getByRole("button", { name: "Open the photo booth" }).click();

  const dialog = page.getByRole("dialog", { name: "Ava & Liam Party Booth" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Confetti never uploads or stores them/i)).toBeVisible();
  await expect(dialog.locator('input[type="file"]')).toHaveCount(2);

  await dialog
    .locator('input[type="file"]')
    .last()
    .setInputFiles({
      name: "guest-photo.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZrZQAAAAASUVORK5CYII=",
        "base64",
      ),
    });

  const previewDialog = page.getByRole("dialog", { name: "Make it party-official" });
  await expect(previewDialog).toBeVisible();
  await expect(previewDialog.locator("canvas")).toBeVisible();
  await expect(previewDialog.getByRole("button", { name: "Save to phone" })).toBeVisible();

  const editorial = previewDialog.getByRole("button", { name: /Editorial/i });
  await editorial.click();
  await expect(editorial).toHaveAttribute("aria-pressed", "true");

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
});

test("a booth QR deep link opens directly into the private camera choice", async ({ page }) => {
  await page.goto("/sample-invite#party-booth", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/sample-invite#party-booth$/);

  const dialog = page.getByRole("dialog", { name: "Ava & Liam Party Booth" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Take a photo", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Choose from library", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Confetti never uploads or stores them/i)).toBeVisible();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
});

test("the sample host can prepare a direct Party Booth sign", async ({ page }) => {
  await page.goto("/party/ava-liam-wedding", { waitUntil: "domcontentloaded" });
  await page
    .getByLabel("Party quick actions")
    .getByRole("button", { name: /invite/i })
    .click();

  const dialog = page.getByRole("dialog", { name: "Party invite" });
  const booth = dialog.getByRole("region", { name: "Put the booth where the party is" });
  await expect(booth).toBeVisible();
  await expect(booth.getByText("Sample booth sign")).toBeVisible();
  await expect(booth.getByRole("img", { name: "Ava & Liam Party Booth QR code" })).toBeVisible();
  await expect(booth.getByRole("button", { name: "Copy booth link" })).toBeVisible();
  await expect(booth.getByRole("button", { name: "Printable sign" })).toBeVisible();
  await expect(booth.getByText(/Confetti stores nothing/i)).toBeVisible();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
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

test("the brand lockup renders the confetti-piece mark, not a letterform", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const lockup = page.getByRole("link", { name: /confetti/i }).first();
  await expect(lockup).toBeVisible();

  const mark = await lockup
    .locator("svg")
    .first()
    .evaluate((svg) => ({
      // The mark is polygons now; the retired one was a stroked <path> arc plus a
      // four-point star. A path reappearing here means the old mark came back.
      polygons: svg.querySelectorAll("polygon").length,
      paths: svg.querySelectorAll("path").length,
      fill: getComputedStyle(svg.querySelector("polygon")!).fill,
    }));
  expect(mark.polygons).toBeGreaterThan(0);
  expect(mark.paths).toBe(0);
  // coral hsl(347 56% 58%)
  expect(mark.fill).toBe("rgb(208, 88, 114)");

  // Wordmark is set lowercase, and the accessible name still reads "Confetti".
  const rendered = await lockup.evaluate((el) => {
    const span = el.querySelector("span.lowercase");
    return {
      transform: span ? getComputedStyle(span).textTransform : null,
      accessibleName: el.getAttribute("aria-label"),
    };
  });
  expect(rendered.transform).toBe("lowercase");
  expect(rendered.accessibleName).toMatch(/confetti/i);
});
