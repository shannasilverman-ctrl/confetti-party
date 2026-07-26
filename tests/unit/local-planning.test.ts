import { describe, expect, it } from "vitest";
import { localPlanningSuggestions, locationIsSpecific, mapsSearchUrl } from "@/lib/local-planning";

describe("local planning recommendations", () => {
  it("does not treat generic home labels as a specific locality", () => {
    expect(locationIsSpecific("Our backyard")).toBe(false);
    expect(locationIsSpecific("Our place")).toBe(false);
    expect(locationIsSpecific("Winter Garden, FL 34787")).toBe(true);
  });

  it("builds encoded Maps searches without inventing a vendor record", () => {
    const suggestions = localPlanningSuggestions({
      occasion: "birthday",
      guestEstimate: 18,
      budget: 600,
      location: "Winter Garden, FL 34787",
    });
    expect(suggestions).toHaveLength(3);
    expect(suggestions[0]?.searchUrl).toContain("google.com/maps/search/");
    expect(decodeURIComponent(suggestions[0]?.searchUrl ?? "")).toContain(
      "near Winter Garden, FL 34787",
    );
    expect(suggestions.some((suggestion) => suggestion.action === "theme")).toBe(true);
    expect(JSON.stringify(suggestions)).not.toMatch(/rating|available now/i);
  });

  it("falls back to a near-me search when the host has not added a city", () => {
    expect(decodeURIComponent(mapsSearchUrl("party catering", "Our place"))).toContain(
      "party catering near me",
    );
  });

  it("uses the current headcount to flag larger venue searches", () => {
    const [venue] = localPlanningSuggestions({
      occasion: "graduation",
      guestEstimate: 35,
      budget: 900,
    });
    expect(venue?.reason).toContain("35 guests");
  });

  it("ranks a preschool venue path using the facts that actually change the decision", () => {
    const suggestions = localPlanningSuggestions({
      occasion: "birthday",
      guestEstimate: 11,
      budget: 650,
      location: "Winter Garden, FL",
      planningProfile: {
        version: 1,
        honoreeAge: 4,
        expectedKids: 5,
        expectedAdults: 6,
        effort: "easy",
        format: "venue",
      },
    });

    expect(suggestions.map((suggestion) => suggestion.id)).toEqual([
      "birthday-preschool-venue",
      "birthday-preschool-food",
      "birthday-preschool-home",
    ]);
    expect(suggestions[0]?.reason).toContain("90-minute flow");
    expect(suggestions[0]?.reason).toContain("5 children and 6 adults");
    expect(decodeURIComponent(suggestions[0]?.searchUrl ?? "")).toContain(
      "preschool 4 year old birthday party indoor play gym venue near Winter Garden, FL",
    );
  });

  it("puts the at-home path first when the host chose home", () => {
    const [first] = localPlanningSuggestions({
      occasion: "birthday",
      guestEstimate: 8,
      budget: 300,
      planningProfile: {
        version: 1,
        honoreeAge: 5,
        effort: "balanced",
        format: "home",
      },
    });
    expect(first?.id).toBe("birthday-preschool-home");
  });

  it("ranks low-effort dinner shortcuts first and carries the real audience split", () => {
    const suggestions = localPlanningSuggestions({
      occasion: "dinner-party",
      guestEstimate: 12,
      budget: 450,
      planningProfile: {
        version: 1,
        expectedKids: 2,
        expectedAdults: 10,
        effort: "easy",
        format: "help-me-choose",
      },
    });

    expect(suggestions[0]?.id).toBe("dinner-food");
    expect(suggestions[0]?.reason).toContain("2 children and 10 adults");
  });

  it("puts a venue-first watch-party path first when the host chose a venue", () => {
    const suggestions = localPlanningSuggestions({
      occasion: "game-day",
      guestEstimate: 24,
      budget: 600,
      planningProfile: {
        version: 1,
        expectedKids: 4,
        expectedAdults: 20,
        effort: "balanced",
        format: "venue",
      },
    });

    expect(suggestions[0]?.id).toBe("game-day-watch");
  });
});
