import { describe, expect, it } from "vitest";
import {
  attendanceCopy,
  contextualRsvpCopy,
  resolveRsvpLoaderData,
  rsvpResponseDetails,
} from "@/lib/rsvp.functions";

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

  it("keeps generic attendance concise while offering a private comfort prompt", () => {
    expect(attendanceCopy()).toEqual({
      adultLabel: "Adults",
      kidLabel: "Kids",
      kidHint: null,
      intro: null,
    });
    expect(contextualRsvpCopy()).toMatchObject({
      arrivalQuestion: null,
      accessPrompt: "Anything that would help you participate or feel comfortable?",
    });
  });

  it("starts a child birthday with the invited child, not one generic adult", () => {
    expect(contextualRsvpCopy({ kind: "school-age-birthday" })).toMatchObject({
      adultLabel: "Adults staying",
      kidLabel: "Children coming",
      defaultAdults: 0,
      defaultKids: 1,
      arrivalQuestion: null,
    });
  });

  it("asks an adult birthday only for plan-changing arrival and access context", () => {
    expect(contextualRsvpCopy({ kind: "adult-birthday" })).toMatchObject({
      adultLabel: "Adults coming",
      defaultAdults: 1,
      defaultKids: 0,
      arrivalQuestion: "When do you expect to join?",
      accessPrompt: "Anything that would make seating, sound, or access more comfortable?",
    });
  });

  it("plans baby-shower attendance around the whole guest group", () => {
    expect(contextualRsvpCopy({ kind: "baby-shower" })).toEqual({
      adultLabel: "Adults coming",
      kidLabel: "Children coming",
      kidHint: "Include everyone in your group so seating, food, and space match.",
      intro: "Count everyone joining so the host can plan a comfortable gathering.",
      defaultAdults: 1,
      defaultKids: 0,
      arrivalQuestion: "Will you join from the start or arrive later?",
      accessPrompt: "Anything that would make seating, sound, access, or participation easier?",
    });
  });

  it("asks graduation guests for the timing that changes food waves and seating", () => {
    expect(contextualRsvpCopy({ kind: "graduation" })).toEqual({
      adultLabel: "Adults coming",
      kidLabel: "Children coming",
      kidHint: "Include everyone in your group so food waves and seating match.",
      intro: "Count everyone joining so the host can plan the celebration around the real group.",
      defaultAdults: 1,
      defaultKids: 0,
      arrivalQuestion: "When do you expect to join the celebration?",
      accessPrompt: "Anything that would make parking, seating, sound, or access easier?",
    });
  });
});

describe("private RSVP response details", () => {
  it("keeps bounded yes/maybe details and trims the note", () => {
    expect(rsvpResponseDetails("maybe", "arriving-later", "  A quiet seat would help.  ")).toEqual({
      arrivalPlan: "arriving-later",
      accessNotes: "A quiet seat would help.",
    });
    expect(rsvpResponseDetails("yes", "", "x".repeat(240))).toEqual({
      accessNotes: "x".repeat(200),
    });
  });

  it("omits empty details and clears every private detail for a no", () => {
    expect(rsvpResponseDetails("yes", "", "   ")).toBeUndefined();
    expect(rsvpResponseDetails("no", "arriving-later", "Keep this private")).toBeUndefined();
  });
});
