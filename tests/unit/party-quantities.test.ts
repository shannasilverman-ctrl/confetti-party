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
    expect(plan?.note).toMatch(/editable planning estimates/i);
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
});
