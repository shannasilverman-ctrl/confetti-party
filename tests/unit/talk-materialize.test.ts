import { describe, it, expect } from "vitest";
import {
  materializeDraft,
  mergeDraftLog,
  summarize,
  type DraftPatch,
} from "@/lib/talk-materialize";

// Deterministic id counter so all assertions are stable.
function counterMkId() {
  let i = 0;
  return () => `id-${++i}`;
}

// Fixed "now" so date fallback is deterministic.
const FIXED_NOW = new Date("2026-01-01T00:00:00Z");

describe("mergeDraftLog", () => {
  it("later fields overwrite earlier ones", () => {
    const merged = mergeDraftLog([
      { identity: { workingTitle: "Alpha", occasion: "dinner-party" } },
      { identity: { workingTitle: "Beta" } },
    ]);
    expect(merged.identity?.workingTitle).toBe("Beta");
    expect(merged.identity?.occasion).toBe("dinner-party");
  });

  it("array fields are unioned, not lost, on empty later turns", () => {
    const merged = mergeDraftLog([
      { vibe: { activities: ["Trivia", "Toast"] } },
      { vibe: {} },
      { vibe: { activities: ["Toast", "Dance"] } },
    ]);
    expect(merged.vibe?.activities?.sort()).toEqual(["Dance", "Toast", "Trivia"]);
  });

  it("dedupes contribution seeds by label", () => {
    const merged = mergeDraftLog([
      { contributions: { seeds: [{ label: "Pie" }, { label: "salad" }] } },
      { contributions: { seeds: [{ label: "PIE" }, { label: "wine" }] } },
    ]);
    expect(merged.contributions?.seeds?.map((s) => s.label.toLowerCase()).sort()).toEqual([
      "pie",
      "salad",
      "wine",
    ]);
  });
});

describe("materializeDraft — rich case", () => {
  const rich: DraftPatch = {
    identity: {
      workingTitle: "Silverman Friendsgiving",
      occasion: "holiday",
      holidayPackId: "thanksgiving",
    },
    when: {
      date: "2026-11-26",
      startTime: "5:00 PM",
      anchors: [
        { label: "Kickoff toast", at: "5:15 PM" },
        { label: "Sit down", at: "6:00 PM" },
      ],
    },
    where: {
      display: "Our place",
      contingency: { needed: true, kind: "weather", plan: "move indoors" },
    },
    people: { expectedCount: 22, households: 8, kids: 6 },
    effort: { level: "medium", hostReadyTarget: "one hour before" },
    budget: { total: 450, stance: "flexible" },
    food: { approach: "potluck", peakMoment: "carving the turkey together" },
    constraints: {
      dietary: ["vegetarian"],
      allergies: ["nut"],
      accessibility: ["step-free entry"],
    },
    contributions: {
      mode: "open-signup",
      seeds: [{ label: "Extra pie", qty: 2, category: "Dessert" }],
    },
    vibe: {
      activities: ["Gratitude round", "Post-meal walk"],
      creativeDirection: { vibe: "warm and low-key", palette: ["amber", "cream"] },
      broadcast: { source: "none" },
    },
    rituals: [{ label: "Empty seat for absent loved ones" }],
    hostNote: "Everyone's welcome; kids table by the window.",
  };

  it("maps every captured field into the party row", () => {
    const { party } = materializeDraft(rich, { mkId: counterMkId(), now: FIXED_NOW });
    expect(party.name).toBe("Silverman Friendsgiving");
    expect(party.occasion).toBe("holiday");
    expect(party.holidayPackId).toBe("thanksgiving");
    expect(party.date).toBe("2026-11-26");
    expect(party.startTime).toBe("5:00 PM");
    expect(party.location).toBe("Our place");
    expect(party.guestEstimate).toBe(22);
    expect(party.budget).toBe(450);
    // hostNote is composed of the host-authored note plus deterministic
    // vibe metadata (tone/palette/sound-check), so we assert prefix + parts.
    expect(party.hostNote).toContain("Everyone's welcome; kids table by the window.");
    expect(party.hostNote).toContain("Palette: amber, cream");
    expect(party.theme).toBe("warm and low-key");

    // Derived tasks include host-ready target, backup plan, dietary, accessibility,
    // contributions coordination, rituals, and peak moment.
    const titles = party.tasks.map((t) => t.title.toLowerCase());
    expect(titles.some((t) => t.includes("host-ready by one hour before"))).toBe(true);
    expect(titles.some((t) => t.includes("backup plan for weather"))).toBe(true);
    expect(titles.some((t) => t.includes("dietary needs"))).toBe(true);
    expect(titles.some((t) => t.includes("accessibility check"))).toBe(true);
    expect(titles.some((t) => t.includes("coordinate contributions"))).toBe(true);
    expect(titles.some((t) => t.startsWith("optional: empty seat"))).toBe(true);
    expect(titles.some((t) => t.includes("peak moment: carving"))).toBe(true);

    // Timeline includes both anchors and activities.
    const timelineLabels = party.timeline.map((t) => t.activity);
    expect(timelineLabels).toContain("Kickoff toast");
    expect(timelineLabels).toContain("Sit down");
    expect(timelineLabels).toContain("Gratitude round");
    expect(timelineLabels).toContain("Post-meal walk");

    // Bring board seeded from thanksgiving pack + contribution seed, deduped.
    const bringLabels = party.bringBoard.map((b) => b.label.toLowerCase());
    expect(bringLabels).toContain("extra pie");
    expect(new Set(bringLabels).size).toBe(bringLabels.length);

    // Shopping items are populated from the "holiday" generator and deduped.
    expect(party.shoppingItems.length).toBeGreaterThan(0);
    const shopNames = party.shoppingItems.map((s) => s.name.toLowerCase());
    expect(new Set(shopNames).size).toBe(shopNames.length);

    // Task titles are deduped case-insensitively.
    const lowered = titles.map((t) => t.trim());
    expect(new Set(lowered).size).toBe(lowered.length);
  });

  it("is deterministic for host-authored fields (tasks / bring / timeline / essentials)", () => {
    const a = materializeDraft(rich, { mkId: counterMkId(), now: FIXED_NOW });
    const b = materializeDraft(rich, { mkId: counterMkId(), now: FIXED_NOW });
    // Shopping seeds mint their own ids via the existing shopping generator,
    // so exact equality of shoppingItems is out of scope for this contract.
    const strip = (p: typeof a.party) => ({
      ...p,
      shoppingItems: p.shoppingItems.map((s) => ({ ...s, id: "_" })),
    });
    expect(strip(a.party)).toEqual(strip(b.party));
    expect(a.assumptions).toEqual(b.assumptions);
    expect(a.openQuestions).toEqual(b.openQuestions);
  });
});

describe("materializeDraft — missing / empty patch", () => {
  it("falls back to safe defaults and surfaces open questions", () => {
    const { party, assumptions, openQuestions } = materializeDraft(
      {},
      { mkId: counterMkId(), now: FIXED_NOW },
    );
    expect(party.name).toBe("Untitled gathering");
    expect(party.occasion).toBe("other");
    expect(party.guestEstimate).toBe(12);
    expect(party.budget).toBe(300);
    expect(party.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(party.holidayPackId).toBeNull();
    expect(party.location).toBeNull();
    expect(party.startTime).toBeNull();
    // Empty patch = every optional field triggers an assumption or open question.
    expect(assumptions.some((a) => a.includes("Placeholder date"))).toBe(true);
    expect(assumptions.some((a) => a.includes("Guest estimate"))).toBe(true);
    expect(assumptions.some((a) => a.includes("Budget"))).toBe(true);
    expect(openQuestions).toContain("Where will it be?");
    expect(openQuestions).toContain("What time does it start?");
  });

  it("clamps invalid numeric inputs safely", () => {
    const { party } = materializeDraft(
      {
        people: { expectedCount: -50 },
        budget: { total: 999_999_999 },
      },
      { mkId: counterMkId() },
    );
    expect(party.guestEstimate).toBeGreaterThanOrEqual(1);
    expect(party.budget).toBeLessThanOrEqual(100_000);
  });
});

describe("summarize", () => {
  it("returns counts matching the materialized party", () => {
    const s = summarize(
      {
        identity: { workingTitle: "Test", occasion: "cookout" },
        people: { expectedCount: 15 },
        budget: { total: 200 },
      },
      { mkId: counterMkId(), now: FIXED_NOW },
    );
    expect(s.essentials.name).toBe("Test");
    expect(s.essentials.occasion).toBe("cookout");
    expect(s.counts.tasks).toBeGreaterThan(0);
    expect(s.counts.budgetCategories).toBe(4);
    expect(s.counts.shoppingItems).toBeGreaterThan(0);
  });
});
