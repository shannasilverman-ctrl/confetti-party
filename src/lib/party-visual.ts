import type { OccasionType, Party } from "@/lib/party-context";
import { themeById } from "@/lib/themes";

/**
 * Every gathering deserves a finished visual treatment, even before the host
 * chooses a theme or uploads a banner. These are broad, first-party fallbacks
 * rather than invented event or vendor photography.
 */
const OCCASION_HERO: Record<OccasionType, string> = {
  birthday: "/brand/kids-party-v1.jpg",
  "baby-shower": "/brand/confetti-hero.jpg",
  graduation: "/brand/confetti-hero.jpg",
  holiday: "/brand/hosting-dinner-v1.jpg",
  "dinner-party": "/brand/hosting-dinner-v1.jpg",
  "game-day": "/brand/world-cup-watch-v1.jpg",
  cookout: "/brand/hosting-dinner-v1.jpg",
  other: "/brand/confetti-hero.jpg",
};

export function occasionHeroImage(occasion: OccasionType | string | null | undefined): string {
  return OCCASION_HERO[occasion as OccasionType] ?? OCCASION_HERO.other;
}

export function partyHeroImage(
  party: Pick<Party, "heroImageUrl" | "themeId" | "occasion">,
): string {
  return (
    party.heroImageUrl?.trim() ||
    themeById(party.themeId)?.heroImage ||
    occasionHeroImage(party.occasion)
  );
}
