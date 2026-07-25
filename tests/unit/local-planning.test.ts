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
});
