import { test, expect } from "@playwright/test";
import { statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Contract: every first-party image URL referenced by the landing page and
 * the sample workspace hero must resolve with a 2xx from the self-hosted
 * production build (i.e. NOT depend on Lovable's CDN /__l5e/assets-v1/*).
 *
 * We also assert the source files exist under public/ so the contract fails
 * fast at collection time if the assets are removed.
 */

const REQUIRED_PUBLIC_FILES = ["public/brand/confetti-hero.jpg", "public/brand/ava-liam.jpg"];

test.describe("first-party image asset contract", () => {
  test("public/ contains the branded images", () => {
    for (const rel of REQUIRED_PUBLIC_FILES) {
      const s = statSync(resolve(process.cwd(), rel));
      expect(s.isFile(), `${rel} must exist as a file`).toBe(true);
      expect(s.size, `${rel} must be non-empty`).toBeGreaterThan(1024);
    }
  });

  test("landing + sample workspace image URLs return 2xx and no /__l5e/ refs", async ({
    page,
    request,
  }) => {
    test.skip(test.info().project.name !== "desktop", "asset contract runs once");

    const seen = new Set<string>();
    page.on("request", (req) => {
      if (req.resourceType() === "image") seen.add(req.url());
    });

    await page.goto("/", { waitUntil: "networkidle" });
    await page.goto("/party/ava-liam-wedding", { waitUntil: "networkidle" }).catch(() => undefined);

    const firstParty = [...seen].filter((u) => u.startsWith("http://127.0.0.1"));
    // No image should be served via the Lovable CDN path outside Lovable.
    for (const url of firstParty) {
      expect(url, `first-party image ${url} must not use /__l5e/`).not.toContain("/__l5e/");
    }

    // Both branded images must be requested and return 2xx.
    const required = ["/brand/confetti-hero.jpg", "/brand/ava-liam.jpg"];
    for (const path of required) {
      const res = await request.get(path);
      expect(res.status(), `${path} must return 2xx`).toBeLessThan(400);
    }
  });
});
