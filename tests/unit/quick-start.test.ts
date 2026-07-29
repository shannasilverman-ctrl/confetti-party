import { describe, expect, it } from "vitest";
import { resolveQuickStart, type QuickStartInput } from "@/lib/quick-start";
import { materializeDraft } from "@/lib/talk-materialize";

const NOW = new Date(2026, 6, 28, 12);

function input(overrides: Partial<QuickStartInput> = {}): QuickStartInput {
  return {
    idea: "",
    occasion: null,
    date: "",
    startTime: "",
    location: "",
    guestEstimate: "",
    budget: "",
    holidayStarter: null,
    honoreeAge: "",
    expectedKids: "",
    expectedAdults: "",
    effort: "balanced",
    partyFormat: "help-me-choose",
    ...overrides,
  };
}

describe("truthful intelligent quick start", () => {
  it("turns a detailed sentence into captured facts and a useful plan", () => {
    const resolved = resolveQuickStart(
      input({
        idea: "A low-key neighborhood potluck in three weeks for about 12 people, with two kids and one gluten-free guest",
      }),
      { now: NOW },
    );
    const { party, optionalUnknowns, blockingUnknowns } = materializeDraft(resolved.patch, {
      now: NOW,
      mkId: (() => {
        let id = 0;
        return () => `id-${++id}`;
      })(),
    });

    expect(party).toMatchObject({
      name: "Potluck",
      occasion: "other",
      date: "2026-08-18",
      guestEstimate: 12,
      planningProfile: {
        expectedKids: 2,
        expectedAdults: 10,
        effort: "easy",
      },
    });
    expect(party.tasks.map((task) => task.title)).toEqual(
      expect.arrayContaining([
        "Confirm dietary needs (gluten-free)",
        "Coordinate contributions (open signup)",
        "Plan for 2 kids (activities / menu)",
      ]),
    );
    expect(blockingUnknowns.map((unknown) => unknown.field)).not.toContain("date");
    expect(optionalUnknowns.map((unknown) => unknown.field)).not.toContain("guestEstimate");
    expect(resolved.capturedFacts).toContain("Potluck");
  });

  it("keeps a short host-authored title exactly as written", () => {
    expect(
      resolveQuickStart(input({ idea: "Neighborhood potluck" }), { now: NOW }).patch.identity
        ?.workingTitle,
    ).toBe("Neighborhood potluck");
  });

  it("lets dedicated fields override extracted text without erasing other captured facts", () => {
    const resolved = resolveQuickStart(
      input({
        idea: "A backyard birthday next Friday for 12 people with a $500 budget",
        occasion: "cookout",
        date: "2026-09-05",
        guestEstimate: "20",
        budget: "750",
        location: "Community pavilion",
        expectedKids: "6",
        expectedAdults: "14",
        effort: "easy",
        partyFormat: "venue",
      }),
      { now: NOW },
    );

    expect(resolved.patch).toMatchObject({
      identity: { occasion: "cookout" },
      when: { date: "2026-09-05" },
      where: { display: "Community pavilion", venueKind: "venue" },
      people: { expectedCount: 20, kids: 6, adults: 14 },
      budget: { total: 750 },
      effort: { level: "low" },
    });
  });

  it("leaves unsupported facts open instead of inventing them", () => {
    const { party, blockingUnknowns, optionalUnknowns } = materializeDraft(
      resolveQuickStart(input({ idea: "A gathering for some friends" }), { now: NOW }).patch,
      { now: NOW },
    );
    expect(party.name).toBe("A gathering for some friends");
    expect(party.guestEstimate).toBe(0);
    expect(party.budget).toBe(0);
    expect(blockingUnknowns.map((unknown) => unknown.field)).toContain("date");
    expect(optionalUnknowns.map((unknown) => unknown.field)).toEqual(
      expect.arrayContaining(["guestEstimate", "budget"]),
    );
  });
});
