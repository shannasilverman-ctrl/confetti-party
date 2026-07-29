import { describe, expect, it } from "vitest";

import { withSecurityHeaders } from "@/lib/security-headers";

describe("withSecurityHeaders", () => {
  it("preserves the response while applying the browser security boundary", async () => {
    const response = withSecurityHeaders(
      new Request("https://confetti.example/party"),
      new Response("party", {
        status: 201,
        statusText: "Created",
        headers: { "content-type": "text/plain", "x-existing": "kept" },
      }),
    );

    expect(response.status).toBe(201);
    expect(response.statusText).toBe("Created");
    expect(await response.text()).toBe("party");
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(response.headers.get("x-existing")).toBe("kept");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("content-security-policy")).toContain("wss://*.supabase.co");
    expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(response.headers.get("permissions-policy")).toContain("microphone=(self)");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });

  it("does not advertise HSTS from an HTTP development server", () => {
    const response = withSecurityHeaders(
      new Request("http://127.0.0.1:4173/"),
      new Response("local"),
    );

    expect(response.headers.has("strict-transport-security")).toBe(false);
  });

  it("prevents valid or invalid RSVP bearer pages from entering HTTP caches", () => {
    for (const path of ["/rsvp/valid-token", "/rsvp/not-a-valid-token"]) {
      const response = withSecurityHeaders(
        new Request(`https://confetti.example${path}`),
        new Response("invite", { headers: { "cache-control": "public, max-age=3600" } }),
      );

      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("pragma")).toBe("no-cache");
    }
  });

  it("preserves existing cache policy outside RSVP bearer pages", () => {
    for (const path of ["/", "/assets/app.js"]) {
      const response = withSecurityHeaders(
        new Request(`https://confetti.example${path}`),
        new Response("public", { headers: { "cache-control": "public, max-age=3600" } }),
      );

      expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
      expect(response.headers.has("pragma")).toBe(false);
    }
  });
});
