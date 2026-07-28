import { describe, expect, it } from "vitest";
import { bringBoardSuggestions, missingBringBoardSuggestions } from "@/lib/bring-board-suggestions";

describe("bring board suggestions", () => {
  it("stages game-day contributions around food waves", () => {
    const suggestions = bringBoardSuggestions({
      occasion: "game-day",
      planningProfile: { version: 1, expectedAdults: 12, expectedKids: 4 },
    });

    expect(suggestions.map((item) => item.label)).toEqual(
      expect.arrayContaining(["Pregame snack", "Halftime hot dish", "Bagged ice"]),
    );
    expect(suggestions.find((item) => item.label === "Handheld dessert")?.qty).toBe(16);
  });

  it("gives Shabbat a respectful, table-specific board", () => {
    const suggestions = bringBoardSuggestions({
      occasion: "holiday",
      holidayPackId: "shabbat",
      guestEstimate: 10,
    });

    expect(suggestions.map((item) => item.label)).toEqual(
      expect.arrayContaining(["Challah", "Wine or grape juice", "Ready-to-serve side"]),
    );
    expect(suggestions.some((item) => item.label === "Bagged ice")).toBe(false);
  });

  it("scales simple quantities from the working audience", () => {
    const suggestions = bringBoardSuggestions({
      occasion: "cookout",
      planningProfile: { version: 1, expectedAdults: 18, expectedKids: 7 },
    });

    expect(suggestions.find((item) => item.label === "Bagged ice")).toMatchObject({
      qty: 3,
      unit: "10-lb bags",
    });
    expect(suggestions.find((item) => item.label === "Outdoor-friendly dessert")?.qty).toBe(25);
  });

  it("does not suggest responsibilities already on the board", () => {
    const suggestions = missingBringBoardSuggestions(
      { occasion: "dinner-party", guestEstimate: 8 },
      [
        {
          id: "existing",
          category: "Dessert",
          label: "dessert",
          qty: 1,
          status: "open",
          source: "host",
        },
      ],
    );

    expect(suggestions.some((item) => item.label === "Dessert")).toBe(false);
    expect(suggestions.some((item) => item.label === "Arrival snack")).toBe(true);
  });
});
