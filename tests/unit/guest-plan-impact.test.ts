import { describe, expect, it } from "vitest";
import { guestPlanSnapshot } from "@/lib/guest-plan-impact";
import { makeParty, type Guest, type Party } from "@/lib/party-context";

function birthdayParty(
  guests: Guest[],
  expected: { adults?: number; kids?: number } = { adults: 2, kids: 4 },
): Party {
  return {
    ...makeParty(
      {
        name: "Maya turns four",
        occasion: "birthday",
        date: "2027-04-10",
        guestEstimate: (expected.adults ?? 0) + (expected.kids ?? 0),
        budget: 400,
        theme: "Rainbows",
        planningProfile: {
          version: 1,
          honoreeAge: 4,
          expectedAdults: expected.adults,
          expectedKids: expected.kids,
        },
      },
      "p1",
    ),
    guests,
  };
}

describe("guest plan impact", () => {
  it("turns reply details into explainable host actions and a higher planning floor", () => {
    const snapshot = guestPlanSnapshot(
      birthdayParty(
        [
          {
            id: "kid-1",
            name: "Ari",
            kind: "kid",
            rsvp: "yes",
            allergens: ["Peanuts"],
            dietary: ["Vegetarian"],
            responseDetails: { accessNotes: "A quiet seat would help." },
          },
          { id: "kid-2", name: "Noa", kind: "kid", rsvp: "yes" },
          {
            id: "adult-1",
            name: "Sam",
            kind: "adult",
            rsvp: "maybe",
            responseDetails: { arrivalPlan: "arriving-later" },
          },
          { id: "pending", name: "Lee", kind: "kid", rsvp: "invited" },
        ],
        { adults: 0, kids: 1 },
      ),
    );

    expect(snapshot).toMatchObject({
      confirmed: { adults: 0, kids: 2, total: 2 },
      maybe: { adults: 1, kids: 0, total: 1 },
      pending: { adults: 0, kids: 1, total: 1 },
      countSuggestion: { adults: 1, kids: 2, total: 3 },
      allergens: ["Peanuts"],
      dietary: ["Vegetarian"],
      laterArrivals: 1,
      accessNotes: 1,
    });
    expect(snapshot?.impacts.map((impact) => impact.id)).toEqual([
      "headcount",
      "allergens",
      "dietary",
      "access",
      "arrival",
      "supervision",
    ]);
    expect(snapshot?.impacts.find((impact) => impact.id === "allergens")?.reason).toMatch(
      /confirm ingredients/i,
    );
  });

  it("does not lower quantities while invited guests can still reply", () => {
    const snapshot = guestPlanSnapshot(
      birthdayParty(
        [
          { id: "yes", name: "Ari", kind: "kid", rsvp: "yes" },
          { id: "pending", name: "Noa", kind: "kid", rsvp: "invited" },
        ],
        { adults: 2, kids: 6 },
      ),
    );

    expect(snapshot?.countSuggestion).toBeNull();
    expect(snapshot?.impacts[0]).toMatchObject({
      id: "headcount",
      title: "Keep the 8-person estimate while replies are open",
      priority: "watch",
    });
  });

  it("can align quantities downward once every guest has replied", () => {
    const snapshot = guestPlanSnapshot(
      birthdayParty(
        [
          { id: "yes", name: "Ari", kind: "kid", rsvp: "yes" },
          { id: "maybe", name: "Sam", kind: "adult", rsvp: "maybe" },
          { id: "no", name: "Noa", kind: "kid", rsvp: "no" },
        ],
        { adults: 4, kids: 8 },
      ),
    );

    expect(snapshot?.pending.total).toBe(0);
    expect(snapshot?.countSuggestion).toMatchObject({ adults: 1, kids: 1, total: 2 });
    expect(snapshot?.countSuggestion?.rationale).toMatch(/everyone has replied/i);
  });

  it("deduplicates active food signals and ignores declined guests", () => {
    const snapshot = guestPlanSnapshot(
      birthdayParty([
        {
          id: "yes",
          name: "Ari",
          kind: "adult",
          rsvp: "yes",
          dietary: [" Vegetarian ", "vegetarian"],
          allergens: ["Peanuts"],
        },
        {
          id: "no",
          name: "Noa",
          kind: "adult",
          rsvp: "no",
          allergens: ["Sesame"],
        },
      ]),
    );

    expect(snapshot?.dietary).toEqual(["Vegetarian"]);
    expect(snapshot?.allergens).toEqual(["Peanuts"]);
  });

  it("stays out of the way before any guest responds", () => {
    expect(
      guestPlanSnapshot(
        birthdayParty([{ id: "pending", name: "Ari", kind: "kid", rsvp: "invited" }]),
      ),
    ).toBeNull();
  });
});
