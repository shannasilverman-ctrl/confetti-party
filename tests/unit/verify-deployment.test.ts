import { describe, expect, it } from "vitest";
import {
  assertHtmlSecurityHeaders,
  normalizeDeploymentUrl,
  verifyDeployment,
} from "../../scripts/verify-deployment.mjs";

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

  it("verifies the complete route, asset, metadata, and manifest contract", async () => {
    const fetchImpl = async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : input.toString());
      if (["/", "/app", "/talk"].includes(url.pathname)) {
        return new Response(
          [
            '<meta name="theme-color" content="#3B1E5E">',
            '<link rel="manifest" href="/manifest.webmanifest">',
            '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
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
      return new Response("png", { headers: { "content-type": "image/png" } });
    };

    await expect(verifyDeployment("https://preview.example.com", { fetchImpl })).resolves.toEqual({
      baseUrl: "https://preview.example.com",
      htmlRoutes: 3,
      assets: 4,
    });
  });
});
