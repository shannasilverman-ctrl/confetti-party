import { describe, expect, it } from "vitest";
import {
  DEFAULT_VERIFY_ATTEMPTS,
  DEFAULT_VERIFY_DELAY_MS,
  assertHtmlSecurityHeaders,
  normalizeDeploymentUrl,
  resolveExpectedReleaseSha,
  verifyDeployment,
  verifyDeploymentWithRetry,
} from "../../scripts/verify-deployment.mjs";

const RELEASE_SHA = "0123456789abcdef0123456789abcdef01234567";

function secureHeaders(overrides: Record<string, string> = {}) {
  return new Headers({
    "content-security-policy": "default-src 'self'; object-src 'none'",
    "cross-origin-opener-policy": "same-origin",
    "permissions-policy": "camera=(), geolocation=()",
    "referrer-policy": "strict-origin-when-cross-origin",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    ...overrides,
  });
}

describe("deployment verification", () => {
  it("allows a bounded Cloudflare edge-propagation window", () => {
    expect(DEFAULT_VERIFY_ATTEMPTS).toBe(15);
    expect(DEFAULT_VERIFY_DELAY_MS).toBe(3_000);
    expect((DEFAULT_VERIFY_ATTEMPTS - 1) * DEFAULT_VERIFY_DELAY_MS).toBe(42_000);
  });

  it("normalizes an HTTPS deployment origin", () => {
    expect(normalizeDeploymentUrl("https://preview.example.com///?old=1#frag")).toBe(
      "https://preview.example.com",
    );
  });

  it("rejects unsafe or credential-bearing targets", () => {
    expect(() => normalizeDeploymentUrl("http://preview.example.com")).toThrow(/requires HTTPS/);
    expect(() => normalizeDeploymentUrl("https://user:secret@example.com")).toThrow(
      /must not contain credentials/,
    );
  });

  it("accepts the complete HTML response security contract", () => {
    expect(() => assertHtmlSecurityHeaders(secureHeaders(), "/app")).not.toThrow();
  });

  it("reports a missing or weakened security header", () => {
    expect(() =>
      assertHtmlSecurityHeaders(secureHeaders({ "x-frame-options": "SAMEORIGIN" }), "/app"),
    ).toThrow("/app: missing or invalid x-frame-options header");
  });

  it("accepts a configured release SHA and rejects malformed provenance", () => {
    expect(resolveExpectedReleaseSha({ CONFETTI_EXPECTED_RELEASE_SHA: RELEASE_SHA })).toBe(
      RELEASE_SHA,
    );
    expect(() =>
      resolveExpectedReleaseSha({ CONFETTI_EXPECTED_RELEASE_SHA: "not-a-commit" }),
    ).toThrow(/invalid/);
  });

  it("verifies the complete route, asset, metadata, and manifest contract", async () => {
    const fetchImpl = async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.pathname === "/release.json") {
        return Response.json(
          { release: RELEASE_SHA },
          {
            headers: secureHeaders({
              "cache-control": "no-store",
              "content-type": "application/json",
            }),
          },
        );
      }
      if (
        [
          "/",
          "/app",
          "/talk",
          "/sample-invite",
          "/party/maya-8th",
          "/party/ava-liam-wedding",
          "/party/ava-liam-wedding/reveal",
          "/party/ava-liam-wedding/day-of",
          "/party/grad-bbq",
          "/party/world-cup-final-watch",
        ].includes(url.pathname)
      ) {
        return new Response(
          [
            '<meta name="theme-color" content="#3B1E5E">',
            '<link rel="manifest" href="/manifest.webmanifest">',
            '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
            '<link rel="canonical" href="https://www.confettiapp.ai/">',
          ].join(""),
          { headers: secureHeaders({ "content-type": "text/html; charset=utf-8" }) },
        );
      }
      if (url.pathname === "/manifest.webmanifest") {
        return Response.json(
          {
            name: "Confetti — Your calm co-host",
            short_name: "Confetti",
            start_url: "/app",
            display: "standalone",
            icons: [
              { src: "/app-icon-192.png", sizes: "192x192" },
              { src: "/app-icon-512.png", sizes: "512x512" },
            ],
          },
          { headers: { "content-type": "application/manifest+json" } },
        );
      }
      const contentType = url.pathname.endsWith(".js")
        ? "application/javascript"
        : url.pathname.endsWith(".jpg")
          ? "image/jpeg"
          : url.pathname.endsWith(".webm")
            ? "video/webm"
            : "image/png";
      return new Response("asset", { headers: { "content-type": contentType } });
    };

    await expect(
      verifyDeployment("https://preview.example.com", {
        fetchImpl,
        expectedReleaseSha: RELEASE_SHA,
      }),
    ).resolves.toEqual({
      baseUrl: "https://preview.example.com",
      releaseSha: RELEASE_SHA,
      htmlRoutes: 10,
      assets: 12,
    });
  });

  it("rejects a healthy deployment that serves the wrong release", async () => {
    const fetchImpl = async () =>
      Response.json(
        { release: "fedcba9876543210fedcba9876543210fedcba98" },
        { headers: secureHeaders({ "content-type": "application/json" }) },
      );

    await expect(
      verifyDeployment("https://preview.example.com", {
        fetchImpl,
        expectedReleaseSha: RELEASE_SHA,
      }),
    ).rejects.toThrow(`/release.json: expected ${RELEASE_SHA}`);
  });

  it("retries a partial edge response and then verifies the deployment", async () => {
    let calls = 0;
    const retryAttempts: number[] = [];
    const fetchImpl = async (input: string | URL | Request) => {
      calls += 1;
      if (calls === 1) return new Response("stale edge", { status: 503 });

      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (url.pathname === "/release.json") {
        return Response.json(
          { release: RELEASE_SHA },
          { headers: secureHeaders({ "content-type": "application/json" }) },
        );
      }
      if (
        [
          "/",
          "/app",
          "/talk",
          "/sample-invite",
          "/party/maya-8th",
          "/party/ava-liam-wedding",
          "/party/ava-liam-wedding/reveal",
          "/party/ava-liam-wedding/day-of",
          "/party/grad-bbq",
          "/party/world-cup-final-watch",
        ].includes(url.pathname)
      ) {
        return new Response(
          [
            '<meta name="theme-color" content="#3B1E5E">',
            '<link rel="manifest" href="/manifest.webmanifest">',
            '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
            '<link rel="canonical" href="https://www.confettiapp.ai/">',
          ].join(""),
          { headers: secureHeaders({ "content-type": "text/html; charset=utf-8" }) },
        );
      }
      if (url.pathname === "/manifest.webmanifest") {
        return Response.json(
          {
            name: "Confetti — Your calm co-host",
            short_name: "Confetti",
            start_url: "/app",
            display: "standalone",
            icons: [
              { src: "/app-icon-192.png", sizes: "192x192" },
              { src: "/app-icon-512.png", sizes: "512x512" },
            ],
          },
          { headers: { "content-type": "application/manifest+json" } },
        );
      }
      const contentType = url.pathname.endsWith(".js")
        ? "application/javascript"
        : url.pathname.endsWith(".jpg")
          ? "image/jpeg"
          : url.pathname.endsWith(".webm")
            ? "video/webm"
            : "image/png";
      return new Response("asset", { headers: { "content-type": contentType } });
    };

    await expect(
      verifyDeploymentWithRetry("https://preview.example.com", {
        attempts: 2,
        delayMs: 0,
        fetchImpl,
        expectedReleaseSha: RELEASE_SHA,
        onRetry: ({ attempt }) => retryAttempts.push(attempt),
      }),
    ).resolves.toMatchObject({ baseUrl: "https://preview.example.com" });
    expect(retryAttempts).toEqual([1]);
  });

  it("validates retry configuration", async () => {
    await expect(
      verifyDeploymentWithRetry("https://preview.example.com", { attempts: 0 }),
    ).rejects.toThrow(/positive integer/);
    await expect(
      verifyDeploymentWithRetry("https://preview.example.com", { delayMs: -1 }),
    ).rejects.toThrow(/non-negative/);
  });
});
