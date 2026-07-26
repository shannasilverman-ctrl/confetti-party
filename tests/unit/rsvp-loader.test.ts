import { describe, expect, it } from "vitest";
import { attendanceCopy, resolveRsvpLoaderData } from "@/lib/rsvp.functions";

const cfg = { origin: "https://x", supabaseUrl: "https://u", supabaseKey: "sb_publishable_x" };
const T = "00000000-0000-0000-0000-000000000001";

describe("resolveRsvpLoaderData", () => {
  it("returns not_found for missing token", async () => {
    const r = await resolveRsvpLoaderData(undefined, cfg);
    expect(r.status).toBe("not_found");
    expect(r.party).toBeNull();
  });

  it("returns temporarily_unavailable when server config is missing", async () => {
    const r = await resolveRsvpLoaderData(T, {
      ...cfg,
      supabaseUrl: undefined,
      supabaseKey: undefined,
    });
    expect(r.status).toBe("temporarily_unavailable");
  });

  it("returns temporarily_unavailable on RPC error", async () => {
    const failures: unknown[] = [];
    const r = await resolveRsvpLoaderData(T, {
      ...cfg,
      rpc: async () => ({
        data: null,
        error: { message: `secret invite ${T}`, code: "42501" },
      }),
      logFailure: (failure) => failures.push(failure),
    });
    expect(r.status).toBe("temporarily_unavailable");
    expect(failures).toEqual([expect.objectContaining({ event: "rpc_failed", code: "42501" })]);
    expect(JSON.stringify(failures)).not.toContain(T);
    expect(JSON.stringify(failures)).not.toContain("secret invite");
  });

  it("returns temporarily_unavailable on thrown network error", async () => {
    const failures: unknown[] = [];
    const r = await resolveRsvpLoaderData(T, {
      ...cfg,
      rpc: async () => {
        throw new Error(`network leaked ${T}`);
      },
      logFailure: (failure) => failures.push(failure),
    });
    expect(r.status).toBe("temporarily_unavailable");
    expect(failures).toEqual([expect.objectContaining({ event: "network_failed", code: null })]);
    expect(JSON.stringify(failures)).not.toContain(T);
    expect(JSON.stringify(failures)).not.toContain("network leaked");
  });

  it("returns not_found when RPC succeeds with no party", async () => {
    const r = await resolveRsvpLoaderData(T, {
      ...cfg,
      rpc: async () => ({ data: null, error: null }),
    });
    expect(r.status).toBe("not_found");
    expect(r.party).toBeNull();
  });

  it("returns ok with the party payload", async () => {
    const payload = { name: "Ava & Liam", date: "2026-08-01" };
    const r = await resolveRsvpLoaderData(T, {
      ...cfg,
      rpc: async () => ({ data: payload, error: null }),
    });
    expect(r.status).toBe("ok");
    expect(r.party).toMatchObject(payload);
  });
});

describe("adaptive RSVP attendance copy", () => {
  it("explains adults staying and siblings for a preschool birthday", () => {
    expect(
      attendanceCopy({
        kind: "preschool-birthday",
        adultLabel: "Adults staying",
        kidLabel: "Children coming",
        kidHint: "Include invited children and any siblings joining.",
      }),
    ).toEqual({
      adultLabel: "Adults staying",
      kidLabel: "Children coming",
      kidHint: "Include invited children and any siblings joining.",
      intro: "Count the people actually attending so food, seating, and supervision match.",
    });
  });

  it("keeps the generic form concise for other events", () => {
    expect(attendanceCopy()).toEqual({
      adultLabel: "Adults",
      kidLabel: "Kids",
      kidHint: null,
      intro: null,
    });
  });
});
