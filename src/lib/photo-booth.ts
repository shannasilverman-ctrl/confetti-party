export type PhotoBoothFrame = "confetti" | "editorial" | "keepsake";

export const PHOTO_BOOTH_FRAMES: Array<{
  id: PhotoBoothFrame;
  name: string;
  description: string;
}> = [
  {
    id: "confetti",
    name: "Party pop",
    description: "Color, movement, and a bold event signature.",
  },
  {
    id: "editorial",
    name: "Editorial",
    description: "A polished magazine-style title card.",
  },
  {
    id: "keepsake",
    name: "Keepsake",
    description: "A timeless framed-photo finish.",
  },
];

export function photoBoothTitle(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.slice(0, 80) || "A Confetti celebration";
}

export function photoBoothFilename(eventName: string): string {
  const slug = photoBoothTitle(eventName)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `confetti-${slug || "party"}-photo.jpg`;
}

export function buildPartyBoothUrl(inviteUrl: string): string {
  const hashIndex = inviteUrl.indexOf("#");
  const withoutHash = hashIndex >= 0 ? inviteUrl.slice(0, hashIndex) : inviteUrl;
  return `${withoutHash}#party-booth`;
}

export function coverCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): { sx: number; sy: number; sw: number; sh: number } {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    return { sx: 0, sy: 0, sw: 0, sh: 0 };
  }

  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  if (sourceRatio > targetRatio) {
    const sw = sourceHeight * targetRatio;
    return { sx: (sourceWidth - sw) / 2, sy: 0, sw, sh: sourceHeight };
  }

  const sh = sourceWidth / targetRatio;
  return { sx: 0, sy: (sourceHeight - sh) / 2, sw: sourceWidth, sh };
}
