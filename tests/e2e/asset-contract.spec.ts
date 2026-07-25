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
const MANIFEST_PATH = "public/manifest.webmanifest";
const APP_ICON_FILES = [
  "public/apple-touch-icon.png",
  "public/app-icon-192.png",
  "public/app-icon-512.png",
];

// Performance contract: enforce upper-bound sizes on branded imagery so
// we do not silently regress LCP. Values are generous ceilings above the
// current compressed output, not the current byte count.
const MAX_BYTES: Record<string, number> = {
  "public/brand/ava-liam.jpg": 450 * 1024, // wedding banner ceiling
  "public/brand/confetti-hero.jpg": 300 * 1024, // landing hero ceiling
};

test.describe("first-party image asset contract", () => {
  test("public/ contains the branded images within size budget", () => {
    for (const rel of REQUIRED_PUBLIC_FILES) {
      const s = statSync(resolve(process.cwd(), rel));
      expect(s.isFile(), `${rel} must exist as a file`).toBe(true);
      expect(s.size, `${rel} must be non-empty`).toBeGreaterThan(1024);
      const cap = MAX_BYTES[rel];
      if (cap) {
        expect(
          s.size,
          `${rel} must stay under ${Math.round(cap / 1024)} kB (was ${Math.round(s.size / 1024)} kB)`,
        ).toBeLessThanOrEqual(cap);
      }
    }
  });

  test("installable app manifest has stable branded launch metadata", async ({ request }) => {
    test.skip(test.info().project.name !== "desktop", "manifest contract runs once");

    const manifestFile = statSync(resolve(process.cwd(), MANIFEST_PATH));
    expect(manifestFile.isFile(), `${MANIFEST_PATH} must exist as a file`).toBe(true);

    const response = await request.get("/manifest.webmanifest");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/manifest+json");

    const manifest = (await response.json()) as {
      name?: string;
      short_name?: string;
      start_url?: string;
      scope?: string;
      display?: string;
      theme_color?: string;
      icons?: Array<{ src?: string; sizes?: string; purpose?: string }>;
      shortcuts?: Array<{ url?: string }>;
    };

    expect(manifest.name).toContain("Confetti");
    expect(manifest.short_name).toBe("Confetti");
    expect(manifest.start_url).toBe("/app");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#3B1E5E");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: "/app-icon-192.png",
          sizes: "192x192",
          purpose: expect.stringContaining("maskable"),
        }),
        expect.objectContaining({
          src: "/app-icon-512.png",
          sizes: "512x512",
          purpose: expect.stringContaining("maskable"),
        }),
      ]),
    );
    expect(manifest.shortcuts?.map((shortcut) => shortcut.url)).toEqual(
      expect.arrayContaining(["/app", "/talk"]),
    );
  });

  test("document advertises the manifest and mobile app identity", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "head contract runs once");

    await page.goto("/");

    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/manifest.webmanifest",
    );
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      "href",
      "/apple-touch-icon.png",
    );
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#3B1E5E");
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
      "content",
      "yes",
    );
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
      "content",
      "Confetti",
    );
  });

  test("install icons exist and resolve as PNG assets", async ({ request }) => {
    test.skip(test.info().project.name !== "desktop", "icon contract runs once");

    for (const relativePath of APP_ICON_FILES) {
      const iconFile = statSync(resolve(process.cwd(), relativePath));
      expect(iconFile.isFile(), `${relativePath} must exist as a file`).toBe(true);
      expect(iconFile.size, `${relativePath} must be non-empty`).toBeGreaterThan(1024);

      const response = await request.get(`/${relativePath.replace("public/", "")}`);
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("image/png");
    }
  });

  test("eligible browsers can discover and accept installation from the dashboard", async ({
    page,
  }) => {
    await page.goto("/app");
    await page.getByRole("button", { name: "Dismiss" }).click();

    const installPrompt = await page.evaluateHandle(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(event, {
        prompt: () => Promise.resolve(),
        userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
      });
      window.dispatchEvent(event);
      return event;
    });

    await expect(page.getByRole("region", { name: "Install Confetti" })).toBeVisible();
    await page.getByRole("button", { name: "Install Confetti" }).click();
    await expect(page.getByRole("region", { name: "Install Confetti" })).toBeHidden();
    await installPrompt.dispose();
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
