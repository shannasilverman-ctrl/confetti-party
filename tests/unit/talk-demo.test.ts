import { describe, expect, it } from "vitest";
import { analyzePlanningIdea, demoReply, DEMO_MAX_TURNS, type DemoMsg } from "@/lib/talk-demo";

const NOW = new Date(2026, 6, 28, 12);

function conversation(...userTurns: string[]): DemoMsg[] {
  return userTurns.flatMap((content, index) => [
    { role: "user" as const, content },
    ...(index < userTurns.length - 1
      ? [{ role: "assistant" as const, content: "Tell me one more thing." }]
      : []),
  ]);
}

describe("input-aware local Talk planner", () => {
  it("is finite and becomes buildable at the demo boundary", () => {
    expect(DEMO_MAX_TURNS).toBe(3);
    const result = demoReply(
      conversation("A dinner party", "I do not know the date", "Keep everything else open"),
      { now: NOW },
    );
    expect(result.complete).toBe(true);
    expect(result.reply).toContain("build the useful browser plan");
  });

  it("tailors the reply and patch to the host's actual words", () => {
    const result = demoReply(
      conversation(
        "A relaxed backyard birthday for 18 friends on August 15 with a $600 budget and vegetarian food",
      ),
      { now: NOW },
    );

    expect(result.reply).toContain("Birthday");
    expect(result.reply).toContain("18 guests");
    expect(result.reply).toContain("$600 budget");
    expect(result.draftPatch).toMatchObject({
      identity: { workingTitle: "Birthday", occasion: "birthday", tone: "relaxed" },
      when: { date: "2026-08-15", dateCertainty: "fixed" },
      where: { display: "Backyard", venueKind: "backyard" },
      people: { expectedCount: 18 },
      budget: { total: 600, stance: "flexible" },
      effort: { level: "low" },
      constraints: { dietary: ["vegetarian"] },
    });
    expect(result.complete).toBe(true);
  });

  it("asks one useful next question without inventing absent facts", () => {
    const result = demoReply(conversation("A cozy dinner at home"), { now: NOW });

    expect(result.draftPatch).toMatchObject({
      identity: { workingTitle: "Dinner Party", occasion: "dinner-party", tone: "cozy" },
      where: { display: "Home", venueKind: "home" },
    });
    expect(result.draftPatch.when?.date).toBeUndefined();
    expect(result.draftPatch.people?.expectedCount).toBeUndefined();
    expect(result.draftPatch.budget?.total).toBeUndefined();
    expect(result.openQuestions).toEqual(["What date, or should that stay open for now?"]);
    expect(result.reply).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b/);
  });

  it("understands relative weekday dates deterministically", () => {
    expect(
      demoReply(conversation("A watch party next Friday for 12 people"), {
        now: NOW,
      }).draftPatch.when?.date,
    ).toBe("2026-08-07");
    expect(
      demoReply(conversation("A watch party this Friday for 12 people"), {
        now: NOW,
      }).draftPatch.when?.date,
    ).toBe("2026-07-31");
  });

  it("understands bounded relative day and week dates deterministically", () => {
    expect(
      analyzePlanningIdea("A potluck in three weeks", { now: NOW }).draftPatch.when?.date,
    ).toBe("2026-08-18");
    expect(analyzePlanningIdea("A dinner in 10 days", { now: NOW }).draftPatch.when?.date).toBe(
      "2026-08-07",
    );
    expect(analyzePlanningIdea("A gathering in 999 days", { now: NOW }).draftPatch.when?.date).toBe(
      undefined,
    );
  });

  it("summarizes only facts actually present in a free-text idea", () => {
    const analysis = analyzePlanningIdea(
      "A low-key neighborhood potluck in three weeks for about 12 people, with two kids and one gluten-free guest",
      { now: NOW },
    );

    expect(analysis.draftPatch).toMatchObject({
      identity: { workingTitle: "Potluck", occasion: "other", tone: "low-key" },
      when: { date: "2026-08-18", dateCertainty: "fixed" },
      people: { expectedCount: 12 },
      effort: { level: "low" },
      food: { approach: "potluck" },
      constraints: { dietary: ["gluten-free"] },
    });
    expect(analysis.capturedFacts).toEqual(
      expect.arrayContaining(["Potluck", "Aug 18, 2026", "12 people", "Low effort", "gluten-free"]),
    );
  });

  it("preserves an explicit year instead of substituting the current year", () => {
    expect(
      demoReply(conversation("A backyard birthday on August 15, 2027"), {
        now: NOW,
      }).draftPatch.when?.date,
    ).toBe("2027-08-15");
  });

  it("uses explicit adult and kid counts instead of double-counting a generic number", () => {
    const result = demoReply(
      conversation("An easy birthday for 8 kids and 5 adults, $450 budget"),
      { now: NOW },
    );

    expect(result.draftPatch.people).toEqual({
      expectedCount: 13,
      kids: 8,
      adults: 5,
    });
    expect(result.draftPatch.budget?.total).toBe(450);
  });

  it("recognizes a holiday pack while keeping rituals optional downstream", () => {
    const result = demoReply(conversation("Shabbat dinner this Friday for 10 guests"), {
      now: NOW,
    });

    expect(result.suggestedPackId).toBe("shabbat");
    expect(result.draftPatch.identity).toMatchObject({
      occasion: "holiday",
      holidayPackId: "shabbat",
    });
    expect(result.usedDemo).toBe(true);
  });

  it("never uses exclamation marks or emoji in generated replies", () => {
    const cases = [
      conversation("A birthday"),
      conversation("A graduation for 30 people"),
      conversation("I am overwhelmed and need help"),
    ];
    for (const messages of cases) {
      const result = demoReply(messages, { now: NOW });
      expect(result.reply.length).toBeGreaterThan(20);
      expect(result.reply).not.toMatch(/!/);
      expect(result.reply).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    }
  });
});
