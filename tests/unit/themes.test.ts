import { describe, expect, it } from "vitest";
import { themeGalleryForOccasion, themesForOccasion } from "@/lib/themes";
import type { OccasionType } from "@/lib/party-context";

describe("theme gallery coverage", () => {
  const occasions: OccasionType[] = [
    "birthday",
    "baby-shower",
    "graduation",
    "holiday",
    "dinner-party",
    "game-day",
    "cookout",
    "other",
  ];

  it.each(occasions)("%s has a usable gallery instead of a dead end", (occasion) => {
    const result = themeGalleryForOccasion(occasion);
    expect(result.themes.length).toBeGreaterThanOrEqual(3);
    expect(new Set(result.themes.map((theme) => theme.id)).size).toBe(result.themes.length);
  });

  it("labels only cross-occasion recommendations as flexible fallbacks", () => {
    expect(themeGalleryForOccasion("birthday").isFlexibleFallback).toBe(false);
    expect(themeGalleryForOccasion("game-day").isFlexibleFallback).toBe(true);
    expect(themeGalleryForOccasion("cookout").themes.map((theme) => theme.id)).toContain(
      "backyard-fiesta",
    );
    expect(themesForOccasion("cookout")).toEqual([]);
  });
});
