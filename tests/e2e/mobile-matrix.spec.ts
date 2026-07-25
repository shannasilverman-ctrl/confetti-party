import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/**
 * Route × width overflow matrix. Records `scrollWidth <= clientWidth` at
 * 320 / 375 / 390 / 430 (the four thumb widths the workspace targets) for
 * every public + demo workspace route. Writes machine-readable evidence to
 * PHASE4_QA_evidence.json for the QA doc to link to.
 */
const ROUTES = [
  "/",
  "/talk",
  "/app",
  "/party/ava-liam-wedding",
  "/party/ava-liam-wedding/reveal",
  "/party/ava-liam-wedding/day-of",
  "/rsvp/00000000-0000-0000-0000-000000000000",
];
const WIDTHS = [320, 375, 390, 430];

type Measurement = {
  route: string;
  width: number;
  scrollWidth: number;
  clientWidth: number;
  overflowsBy: number;
};

const measurements: Measurement[] = [];

test.describe("mobile matrix — no horizontal overflow", () => {
  for (const route of ROUTES) {
    for (const width of WIDTHS) {
      test(`${route} @ ${width}px does not overflow`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== "mobile", "mobile matrix runs once");
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await page.evaluate(() => document.fonts?.ready);
        const dims = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        measurements.push({
          route,
          width,
          scrollWidth: dims.scrollWidth,
          clientWidth: dims.clientWidth,
          overflowsBy: Math.max(0, dims.scrollWidth - dims.clientWidth),
        });
        expect(
          dims.scrollWidth,
          `${route} @ ${width}px: scrollWidth ${dims.scrollWidth} > clientWidth ${dims.clientWidth}`,
        ).toBeLessThanOrEqual(dims.clientWidth);
      });
    }
  }

  test.afterAll(() => {
    if (!measurements.length) return;
    const out = path.join(process.cwd(), "PHASE4_QA_evidence.json");
    fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), measurements }, null, 2));
  });
});
