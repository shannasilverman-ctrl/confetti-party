import { describe, expect, it } from "vitest";
import { resolveRsvpLoaderData } from "@/lib/rsvp.functions";

const cfg = { origin: "https://x", supabaseUrl: "https://u", supabaseKey: "sb_publishable_x" };
const T = "00000000-0000-0000-0000-000000000001";

describe("resolveRsvpLoaderData", () => {
  it("returns not_found for missing token", async () => {
    const r = await resolveRsvpLoaderData(undefined, cfg);
    expect(r.status).toBe("not_found");
    expect(r.party).toBeNull();
  });

  it("returns temporarily_unavailable when server config is missing", async () => {
    const r = await resolveRsvpLoaderData("t", {
      ...cfg,
      supabaseUrl: undefined,
      supabaseKey: undefined,
    });
    expect(r.status).toBe("temporarily_unavailable");
  });

  it("returns temporarily_unavailable on RPC error", async () => {
    const r = await resolveRsvpLoaderData("t", {
      ...cfg,
      rpc: async () => ({ data: null, error: { message: "boom" } }),
    });
    expect(r.status).toBe("temporarily_unavailable");
  });

  it("returns temporarily_unavailable on thrown network error", async () => {
    const r = await resolveRsvpLoaderData("t", {
      ...cfg,
      rpc: async () => {
        throw new Error("net");
      },
    });
    expect(r.status).toBe("temporarily_unavailable");
  });

  it("returns not_found when RPC succeeds with no party", async () => {
    const r = await resolveRsvpLoaderData("t", {
      ...cfg,
      rpc: async () => ({ data: null, error: null }),
    });
    expect(r.status).toBe("not_found");
    expect(r.party).toBeNull();
  });

  it("returns ok with the party payload", async () => {
    const payload = { name: "Ava & Liam", date: "2026-08-01" };
    const r = await resolveRsvpLoaderData("t", {
      ...cfg,
      rpc: async () => ({ data: payload, error: null }),
    });
    expect(r.status).toBe("ok");
    expect(r.party).toMatchObject(payload);
  });
});
