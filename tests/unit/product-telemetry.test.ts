import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isProductTelemetryPayload,
  productTelemetrySurface,
  trackProductEvent,
} from "@/lib/product-telemetry";
import { createProductTelemetryHandler } from "@/routes/api/telemetry";

function request(body: string, headers: Record<string, string> = {}): Request {
  return new Request("https://confetti.example/api/telemetry", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("product telemetry contract", () => {
  it("reduces dynamic routes to token-free surface names", () => {
    expect(productTelemetrySurface("/")).toBe("landing");
    expect(productTelemetrySurface("/party/private-party-id")).toBe("party");
    expect(productTelemetrySurface("/party/private-party-id/day-of")).toBe("day_of");
    expect(productTelemetrySurface("/rsvp/private-bearer-token")).toBe("rsvp");
    expect(productTelemetrySurface("/something/unrecognized")).toBe("other");
  });

  it("accepts only allowlisted keys and values", () => {
    expect(isProductTelemetryPayload({ event: "plan_created", surface: "talk" })).toBe(true);
    expect(
      isProductTelemetryPayload({
        event: "plan_created",
        surface: "talk",
        partyId: "must-not-pass",
      }),
    ).toBe(false);
    expect(isProductTelemetryPayload({ event: "invented", surface: "talk" })).toBe(false);
    expect(isProductTelemetryPayload({ event: "plan_created", surface: "/rsvp/token" })).toBe(
      false,
    );
  });

  it("logs only the fixed event, surface, type, and build release", async () => {
    const log = vi.fn();
    const response = await createProductTelemetryHandler(log)(
      request(JSON.stringify({ event: "rsvp_completed", surface: "rsvp" })),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toEqual({
      type: "product_event",
      event: "rsvp_completed",
      surface: "rsvp",
      release: expect.any(String),
    });
  });

  it("rejects malformed, oversized, non-JSON, and extra-field payloads without logging", async () => {
    const log = vi.fn();
    const handler = createProductTelemetryHandler(log);

    await expect(handler(request("{"))).resolves.toMatchObject({ status: 400 });
    await expect(handler(request("{}", { "content-type": "text/plain" }))).resolves.toMatchObject({
      status: 415,
    });
    await expect(
      handler(
        request(
          JSON.stringify({
            event: "invite_opened",
            surface: "rsvp",
            token: "secret",
          }),
        ),
      ),
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      handler(request(JSON.stringify({ event: "invite_opened", surface: "rsvp" }).padEnd(300))),
    ).resolves.toMatchObject({ status: 413 });
    expect(log).not.toHaveBeenCalled();
  });

  it("sends no credentials or referrer and never leaks the dynamic path", async () => {
    window.history.replaceState({}, "", "/rsvp/private-bearer-token");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    trackProductEvent("invite_opened");
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/telemetry");
    expect(init.credentials).toBe("omit");
    expect(init.referrerPolicy).toBe("no-referrer");
    expect(init.body).toBe(JSON.stringify({ event: "invite_opened", surface: "rsvp" }));
    expect(String(init.body)).not.toContain("private-bearer-token");
  });
});
