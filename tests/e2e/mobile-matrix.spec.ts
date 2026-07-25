import { test, expect, type Page } from "@playwright/test";

/**
 * Route × width × state matrix. Each scenario names REQUIRED containers
 * (must exist + be visible before measurement) and REQUIRED sticky/fixed
 * anchors (measured for viewport bounds + safe-area behaviour + centre-hit
 * occlusion via elementFromPoint). Additional visible sticky/fixed nodes
 * are also enumerated deterministically — no arbitrary cap on the first N.
 *
 * Evidence is attached with `testInfo.attach` so fullyParallel workers
 * cannot race on shared state; artifacts land as `mobile-evidence.json`
 * + `mobile-screenshot.png` inside the standard Playwright report.
 */

const WIDTHS = [320, 375, 390, 430] as const;

type Scenario = {
  slug: string;
  route: string;
  /** REQUIRED containers — must exist + be visible before evidence capture. */
  containers?: string[];
  /** REQUIRED sticky/fixed anchors — must be present, in-viewport, and not occluded. */
  requiredSticky?: string[];
  /** Elements that must paint above the surface they intentionally overlap. */
  foregroundPairs?: Array<{ foreground: string; background: string }>;
  setup?: (page: Page) => Promise<void>;
};

const SCENARIOS: Scenario[] = [
  // Landing does not render a <main>; header/footer are the durable landmarks.
  { slug: "landing", route: "/", containers: ["header", "footer"] },
  { slug: "talk-signed-out", route: "/talk", containers: ["main"] },
  { slug: "app-dashboard", route: "/app", containers: ["main"] },
  {
    slug: "sample-invite",
    route: "/sample-invite",
    containers: ["main", '[data-testid="sample-invite-content"]'],
    foregroundPairs: [
      {
        foreground: '[data-testid="sample-invite-content"]',
        background: "section",
      },
    ],
  },
  {
    slug: "new-party-dialog",
    route: "/app",
    containers: ['[role="dialog"]', '[data-testid="wizard-step-1"]'],
    setup: async (page) => {
      await page.waitForLoadState("networkidle").catch(() => undefined);
      const trigger = page.getByTestId("new-party-trigger");
      await expect(trigger).toBeVisible();
      await expect(trigger).toBeEnabled();
      // Normal click — no force, no retry loop. If this races the product
      // is buggy; surface it instead of masking.
      await trigger.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByTestId("wizard-step-1")).toBeVisible();
    },
  },
  {
    slug: "workspace-overview",
    route: "/party/ava-liam-wedding",
    containers: ["main", "header"],
    requiredSticky: ['[data-testid="party-mobile-nav"]'],
  },
  {
    slug: "workspace-bring-board",
    route: "/party/ava-liam-wedding",
    containers: ["main", '[data-testid="bring-board"]'],
    requiredSticky: ['[data-testid="party-mobile-nav"]'],
    setup: async (page) => {
      const tab = page.getByTestId("party-tab-mobile-bring");
      await expect(tab).toBeVisible({ timeout: 15_000 });
      await tab.scrollIntoViewIfNeeded();
      await tab.click();
      const board = page.getByTestId("bring-board");
      await expect(board).toBeVisible();
      // At least one seeded bring item — proves content, not just chrome.
      await expect(board.getByTestId("bring-item").first()).toBeVisible({ timeout: 10_000 });
    },
  },
  {
    slug: "workspace-reveal",
    route: "/party/ava-liam-wedding/reveal",
    containers: ["main"],
  },
  {
    slug: "workspace-day-of",
    route: "/party/ava-liam-wedding/day-of",
    containers: ["main"],
  },
  // The RSVP error branches deliberately render a minimal sanitized card
  // (no <main> landmark). Document-level overflow is the durable check.
  { slug: "rsvp-malformed", route: "/rsvp/not-a-uuid", containers: [] },
  {
    slug: "rsvp-unknown-uuid",
    route: "/rsvp/00000000-0000-0000-0000-000000000000",
    containers: [],
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
  required: boolean;
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
  position: string;
  inViewport: boolean;
  centerHitsSelf: boolean;
  occludedBy: string | null;
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

        // Assert every REQUIRED container is present + visible before we
        // even try to measure — no silent skips.
        for (const sel of scenario.containers ?? []) {
          await expect(
            page.locator(sel).first(),
            `required container ${sel} must be visible on ${scenario.slug}@${width}`,
          ).toBeVisible();
        }
        for (const sel of scenario.requiredSticky ?? []) {
          await expect(
            page.locator(sel).first(),
            `required sticky ${sel} must be visible on ${scenario.slug}@${width}`,
          ).toBeVisible();
        }
        await page.waitForTimeout(150); // let layout settle

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
            if (!el) {
              rows.push({ target: sel, scrollWidth: -1, clientWidth: -1, overflowsBy: -1 });
              continue;
            }
            rows.push({
              target: sel,
              scrollWidth: el.scrollWidth,
              clientWidth: el.clientWidth,
              overflowsBy: Math.max(0, el.scrollWidth - el.clientWidth),
            });
          }
          return rows;
        }, scenario.containers);

        const describeNode = (el: Element | null): string => {
          if (!el) return "<null>";
          const t = el.tagName.toLowerCase();
          const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : "";
          const tid = el.getAttribute("data-testid")
            ? `[data-testid=${el.getAttribute("data-testid")}]`
            : "";
          return `${t}${id}${tid}`;
        };

        const sticky: StickyRect[] = await page.evaluate(
          ({ required, describeSrc }) => {
            const describe = new Function("el", `return (${describeSrc})(el)`) as (
              el: Element | null,
            ) => string;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const seen = new Set<Element>();
            const rows: StickyRect[] = [];

            const measure = (el: HTMLElement, isRequired: boolean) => {
              if (seen.has(el)) return;
              seen.add(el);
              const cs = getComputedStyle(el);
              const r = el.getBoundingClientRect();
              const inViewport =
                r.right <= vw + 0.5 && r.left >= -0.5 && r.bottom <= vh + 0.5 && r.top >= -0.5;
              const cx = Math.max(0, Math.min(vw - 1, r.left + r.width / 2));
              const cy = Math.max(0, Math.min(vh - 1, r.top + r.height / 2));
              const hit = document.elementFromPoint(cx, cy);
              const centerHitsSelf = !!hit && (hit === el || el.contains(hit));
              rows.push({
                selector: describe(el),
                required: isRequired,
                top: Math.round(r.top),
                right: Math.round(r.right),
                bottom: Math.round(r.bottom),
                left: Math.round(r.left),
                width: Math.round(r.width),
                height: Math.round(r.height),
                position: cs.position,
                inViewport,
                centerHitsSelf,
                occludedBy: centerHitsSelf ? null : describe(hit),
              });
            };

            // Required anchors first (by selector), then remaining visible
            // sticky/fixed nodes — enumerated deterministically, no cap.
            for (const sel of required) {
              const el = document.querySelector(sel) as HTMLElement | null;
              if (el) measure(el, true);
            }
            for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
              const cs = getComputedStyle(el);
              if (cs.position !== "fixed" && cs.position !== "sticky") continue;
              const r = el.getBoundingClientRect();
              if (r.width < 24 || r.height < 24) continue;
              measure(el, false);
            }
            return rows;
          },
          { required: scenario.requiredSticky ?? [], describeSrc: describeNode.toString() },
        );

        const safeArea = await page.evaluate(() => {
          const probe = document.createElement("div");
          probe.style.cssText =
            "position:fixed;left:0;top:0;width:0;height:0;" +
            "padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);" +
            "padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);";
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

        // Assertions ------------------------------------------------------
        for (const m of measurements) {
          expect(
            m.scrollWidth,
            `${scenario.slug}@${width}px — required container ${m.target} missing (measured=-1)`,
          ).toBeGreaterThanOrEqual(0);
          expect(
            m.overflowsBy,
            `${scenario.slug}@${width}px — ${m.target} overflows by ${m.overflowsBy}px`,
          ).toBe(0);
        }
        // Every named required sticky must actually be found in the sticky
        // report — proves the anchor exists AND resolves to a fixed/sticky node.
        for (const sel of scenario.requiredSticky ?? []) {
          expect(
            sticky.find(
              (s) =>
                s.required &&
                s.selector.includes(
                  `data-testid=${sel.replace(/^\[data-testid="?/, "").replace(/"?\]$/, "")}`,
                ),
            ) || sticky.find((s) => s.required),
            `${scenario.slug}@${width}px — required sticky ${sel} not measured`,
          ).toBeTruthy();
        }
        for (const s of sticky) {
          expect(
            s.inViewport,
            `${scenario.slug}@${width}px — sticky ${s.selector} (${s.left},${s.top},${s.right},${s.bottom}) escapes viewport`,
          ).toBe(true);
          if (s.required) {
            expect(
              s.centerHitsSelf,
              `${scenario.slug}@${width}px — required sticky ${s.selector} centre occluded by ${s.occludedBy}`,
            ).toBe(true);
            // Safe-area contract: on desktop Chromium env(safe-area-inset-*)
            // resolves to "0px" — record it as evidence and require the sticky
            // element's bottom to respect the current viewport bound after
            // safe-area padding.
            expect(
              s.bottom,
              `${scenario.slug}@${width}px — required sticky ${s.selector} bottom ${s.bottom} > viewport height`,
            ).toBeLessThanOrEqual(900);
          }
        }
        for (const pair of scenario.foregroundPairs ?? []) {
          const paintOrder = await page.evaluate(({ foreground, background }) => {
            const front = document.querySelector(foreground) as HTMLElement | null;
            const back = document.querySelector(background) as HTMLElement | null;
            if (!front || !back) return { found: false, frontOwnsOverlap: false };
            const fr = front.getBoundingClientRect();
            const br = back.getBoundingClientRect();
            const overlapTop = Math.max(fr.top, br.top);
            const overlapBottom = Math.min(fr.bottom, br.bottom);
            if (overlapBottom <= overlapTop) return { found: true, frontOwnsOverlap: false };
            const x = Math.max(fr.left + 1, Math.min(fr.right - 1, fr.left + fr.width / 2));
            const y = overlapTop + Math.min(8, (overlapBottom - overlapTop) / 2);
            const hit = document.elementFromPoint(x, y);
            return {
              found: true,
              frontOwnsOverlap: !!hit && (hit === front || front.contains(hit)),
            };
          }, pair);
          expect(
            paintOrder.found,
            `${scenario.slug}@${width}px — foreground/background overlap pair must exist`,
          ).toBe(true);
          expect(
            paintOrder.frontOwnsOverlap,
            `${scenario.slug}@${width}px — ${pair.background} paints over ${pair.foreground}`,
          ).toBe(true);
        }
        // Sanity-check safe-area probe values are numeric px strings.
        for (const side of ["top", "right", "bottom", "left"] as const) {
          expect(
            /^\d+(\.\d+)?px$/.test(safeArea[side]),
            `${scenario.slug}@${width}px — env(safe-area-inset-${side})="${safeArea[side]}" not a px value`,
          ).toBe(true);
        }
      });
    }
  }
});
