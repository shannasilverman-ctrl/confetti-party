import { test, expect, type Page } from "@playwright/test";

/**
 * Route × width × state matrix. Records document + named-container
 * scrollWidth/clientWidth at 320 / 375 / 390 / 430, plus viewport-bounds
 * checks for sticky/fixed actions and safe-area inset behaviour.
 *
 * Evidence is emitted with `testInfo.attach` so fullyParallel workers
 * cannot race on a shared module-global array; the standard Playwright
 * artifact upload picks them up as `mobile-evidence.json` +
 * `mobile-screenshot.png` per test.
 */

const WIDTHS = [320, 375, 390, 430] as const;

type Scenario = {
  slug: string;
  route: string;
  containers?: string[]; // CSS selectors to measure
  setup?: (page: Page) => Promise<void>;
};

const SCENARIOS: Scenario[] = [
  { slug: "landing", route: "/", containers: ["main", "header", "footer"] },
  { slug: "talk-signed-out", route: "/talk", containers: ["main"] },
  { slug: "app-dashboard", route: "/app", containers: ["main"] },
  {
    slug: "new-party-dialog",
    route: "/app",
    containers: ['[role="dialog"]'],
    setup: async (page) => {
      const trigger = page.locator('[data-testid="new-party-trigger"]');
      await trigger.waitFor({ state: "visible" });
      await trigger.click();
      await page.getByRole("dialog").waitFor({ state: "visible", timeout: 15_000 });
    },
  },
  {
    slug: "workspace-overview",
    route: "/party/ava-liam-wedding",
    containers: ["main", "header"],
  },
  {
    slug: "workspace-bring-board",
    route: "/party/ava-liam-wedding",
    containers: ["main"],
    setup: async (page) => {
      // Both a mobile bottom nav and desktop tab bar render into the DOM;
      // CSS toggles visibility. Click whichever is currently visible.
      const mobile = page.locator('[data-testid="party-tab-mobile-bring"]:visible').first();
      if (await mobile.count()) {
        await mobile.click();
      } else {
        await page.locator('[data-testid="party-tab-bring"]:visible').first().click();
      }
    },
  },
  { slug: "workspace-reveal", route: "/party/ava-liam-wedding/reveal", containers: ["main"] },
  { slug: "workspace-day-of", route: "/party/ava-liam-wedding/day-of", containers: ["main"] },
  { slug: "rsvp-malformed", route: "/rsvp/not-a-uuid", containers: ["main"] },
  {
    slug: "rsvp-unknown-uuid",
    route: "/rsvp/00000000-0000-0000-0000-000000000000",
    containers: ["main"],
  },
];

type Measurement = {
  target: string;
  scrollWidth: number;
  clientWidth: number;
  overflowsBy: number;
};

type StickyRect = {
  selector: string;
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
  position: string;
  inViewport: boolean;
};

test.describe("mobile matrix — no horizontal overflow", () => {
  for (const scenario of SCENARIOS) {
    for (const width of WIDTHS) {
      test(`${scenario.slug} @ ${width}px`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== "mobile", "mobile matrix runs once");
        await page.setViewportSize({ width, height: 900 });
        await page.goto(scenario.route, { waitUntil: "domcontentloaded" });
        await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
        if (scenario.setup) await scenario.setup(page);
        // Let layout settle after any interaction.
        await page.waitForTimeout(150);

        const measurements: Measurement[] = await page.evaluate((containers) => {
          const rows: Measurement[] = [];
          const root = document.documentElement;
          rows.push({
            target: "document",
            scrollWidth: root.scrollWidth,
            clientWidth: root.clientWidth,
            overflowsBy: Math.max(0, root.scrollWidth - root.clientWidth),
          });
          for (const sel of containers ?? []) {
            const el = document.querySelector(sel) as HTMLElement | null;
            if (!el) continue;
            rows.push({
              target: sel,
              scrollWidth: el.scrollWidth,
              clientWidth: el.clientWidth,
              overflowsBy: Math.max(0, el.scrollWidth - el.clientWidth),
            });
          }
          return rows;
        }, scenario.containers);

        const sticky: StickyRect[] = await page.evaluate(() => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const nodes = Array.from(document.querySelectorAll<HTMLElement>("*"));
          const rows: StickyRect[] = [];
          for (const el of nodes) {
            const cs = getComputedStyle(el);
            if (cs.position !== "fixed" && cs.position !== "sticky") continue;
            const r = el.getBoundingClientRect();
            if (r.width < 24 || r.height < 24) continue;
            const inViewport =
              r.right <= vw + 0.5 && r.left >= -0.5 && r.bottom <= vh + 0.5 && r.top >= -0.5;
            rows.push({
              selector:
                el.tagName.toLowerCase() +
                (el.id ? `#${el.id}` : "") +
                (el.getAttribute("data-testid")
                  ? `[data-testid=${el.getAttribute("data-testid")}]`
                  : ""),
              top: Math.round(r.top),
              right: Math.round(r.right),
              bottom: Math.round(r.bottom),
              left: Math.round(r.left),
              width: Math.round(r.width),
              height: Math.round(r.height),
              position: cs.position,
              inViewport,
            });
            if (rows.length >= 12) break;
          }
          return rows;
        });

        const safeArea = await page.evaluate(() => {
          const probe = document.createElement("div");
          probe.style.cssText =
            "position:fixed;left:0;top:0;width:0;height:0;padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);";
          document.body.appendChild(probe);
          const cs = getComputedStyle(probe);
          const out = {
            top: cs.paddingTop,
            right: cs.paddingRight,
            bottom: cs.paddingBottom,
            left: cs.paddingLeft,
          };
          probe.remove();
          return out;
        });

        const evidence = {
          scenario: scenario.slug,
          route: scenario.route,
          width,
          measurements,
          sticky,
          safeArea,
          capturedAt: new Date().toISOString(),
        };
        await testInfo.attach("mobile-evidence.json", {
          body: JSON.stringify(evidence, null, 2),
          contentType: "application/json",
        });
        const shot = await page.screenshot({ fullPage: false, type: "png" });
        await testInfo.attach("mobile-screenshot.png", { body: shot, contentType: "image/png" });

        for (const m of measurements) {
          expect(
            m.overflowsBy,
            `${scenario.slug} @ ${width}px — ${m.target} overflows by ${m.overflowsBy}px`,
          ).toBe(0);
        }
        for (const s of sticky) {
          expect(
            s.inViewport,
            `${scenario.slug} @ ${width}px — sticky ${s.selector} (${s.left},${s.top},${s.right},${s.bottom}) escapes viewport`,
          ).toBe(true);
        }
      });
    }
  }
});
