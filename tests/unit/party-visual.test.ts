import { describe, expect, it } from "vitest";
import { occasionHeroImage, partyHeroImage } from "@/lib/party-visual";

describe("party visual fallbacks", () => {
  it("keeps a curated image on every supported occasion", () => {
    for (const occasion of [
      "birthday",
      "baby-shower",
      "graduation",
      "holiday",
      "dinner-party",
      "game-day",
      "cookout",
      "other",
    ] as const) {
      expect(occasionHeroImage(occasion)).toMatch(/^\/brand\/.+\.(jpg|webp|png)$/);
    }
  });

  it("prefers an explicit banner over a theme and a theme over the occasion fallback", () => {
    expect(
      partyHeroImage({
        heroImageUrl: "/brand/ava-liam.jpg",
        themeId: "unicorn-rainbow",
        occasion: "birthday",
      }),
    ).toBe("/brand/ava-liam.jpg");

    expect(
      partyHeroImage({
        themeId: "unicorn-rainbow",
        occasion: "birthday",
      }),
    ).toContain("unicorn-rainbow");

    expect(
      partyHeroImage({
        themeId: undefined,
        occasion: "holiday",
      }),
    ).toBe("/brand/hosting-dinner-v1.jpg");
  });

  it("falls back safely for legacy or unknown occasion data", () => {
    expect(occasionHeroImage("legacy-event")).toBe("/brand/confetti-hero.jpg");
  });
});
