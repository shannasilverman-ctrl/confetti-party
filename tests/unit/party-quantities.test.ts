import { describe, expect, it } from "vitest";
import { partyQuantityPlan } from "@/lib/party-quantities";

describe("party quantity planning", () => {
  it("turns the child/adult split into transparent ranges", () => {
    const plan = partyQuantityPlan({
      version: 1,
      honoreeAge: 4,
      expectedKids: 5,
      expectedAdults: 6,
      effort: "easy",
      format: "venue",
    });

    expect(plan).toMatchObject({ children: 5, adults: 6, total: 11 });
    expect(plan?.estimates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "pizza",
          recommendation: "3–4",
          confidence: "estimate",
        }),
        expect.objectContaining({ id: "cake", recommendation: "13" }),
        expect.objectContaining({ id: "tableware", recommendation: "14" }),
        expect.objectContaining({ id: "favors", recommendation: "6" }),
      ]),
    );
    expect(plan).toMatchObject({
      confidence: "starting",
      openQuestions: ["food-role", "duration", "service-style"],
    });
    expect(plan?.assumptions).toHaveLength(3);
    expect(plan?.note).toMatch(/not a vendor guarantee/i);
  });

  it("does not manufacture quantities before the audience is known", () => {
    expect(partyQuantityPlan({ version: 1, honoreeAge: 4 })).toBeNull();
    expect(
      partyQuantityPlan({
        version: 1,
        honoreeAge: 4,
        expectedKids: 0,
        expectedAdults: 0,
      }),
    ).toBeNull();
  });

  it("does not create child favors for an adult-only event profile", () => {
    const plan = partyQuantityPlan({
      version: 1,
      expectedKids: 0,
      expectedAdults: 12,
    });
    expect(plan?.estimates.some((item) => item.id === "favors")).toBe(false);
  });

  it("uses meal math—not pizza and favors—for a holiday table", () => {
    const plan = partyQuantityPlan(
      { version: 1, expectedKids: 3, expectedAdults: 8 },
      { occasion: "holiday", holidayPackId: "shabbat" },
    );

    expect(plan?.estimates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "meal-servings", recommendation: "13" }),
        expect.objectContaining({ id: "side-servings", recommendation: "22–33" }),
        expect.objectContaining({ id: "dessert-servings", recommendation: "13" }),
      ]),
    );
    expect(plan?.estimates.some((item) => item.id === "pizza")).toBe(false);
    expect(plan?.estimates.some((item) => item.id === "favors")).toBe(false);
  });

  it("plans food waves and ice for a multi-hour watch party", () => {
    const plan = partyQuantityPlan(
      { version: 1, expectedKids: 4, expectedAdults: 12 },
      { occasion: "game-day" },
    );

    expect(plan?.estimates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "snack-servings", recommendation: "64–96" }),
        expect.objectContaining({ id: "ice", recommendation: "2–3" }),
      ]),
    );
  });

  it("separates cookout mains, sides, drinks, and cooler assumptions", () => {
    const plan = partyQuantityPlan(
      { version: 1, expectedKids: 4, expectedAdults: 10 },
      { occasion: "cookout" },
    );

    expect(plan?.estimates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "grill-mains", recommendation: "17–26" }),
        expect.objectContaining({ id: "side-servings", recommendation: "28–42" }),
        expect.objectContaining({
          id: "ice",
          assumption: expect.stringMatching(/food coolers need their own/i),
        }),
      ]),
    );
  });

  it("replaces occasion assumptions with a tuned light-bites plan", () => {
    const plan = partyQuantityPlan(
      {
        version: 1,
        expectedKids: 5,
        expectedAdults: 6,
        foodRole: "light-bites",
        durationMinutes: 90,
        foodServiceStyle: "served",
      },
      { occasion: "birthday" },
    );

    expect(plan).toMatchObject({
      confidence: "tuned",
      openQuestions: [],
      assumptions: [],
    });
    expect(plan?.knownFacts).toEqual(
      expect.arrayContaining(["Light bites—not a meal", "1 hr 30 min", "Portioned per guest"]),
    );
    expect(plan?.estimates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "snack-servings", recommendation: "33–55" }),
        expect.objectContaining({ id: "drinks", recommendation: "11–22" }),
        expect.objectContaining({ id: "tableware", recommendation: "13" }),
      ]),
    );
    expect(plan?.estimates.some((item) => item.id === "pizza")).toBe(false);
  });

  it("uses duration-aware first-hour and later-hour math for grazing", () => {
    const plan = partyQuantityPlan(
      {
        version: 1,
        expectedKids: 2,
        expectedAdults: 8,
        foodRole: "grazing",
        durationMinutes: 180,
        foodServiceStyle: "self-serve",
      },
      { occasion: "game-day" },
    );

    expect(plan?.estimates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "snack-servings",
          recommendation: "140–220",
          assumption: expect.stringMatching(/first hour/i),
        }),
        expect.objectContaining({ id: "drinks", recommendation: "20–30" }),
      ]),
    );
  });
});
