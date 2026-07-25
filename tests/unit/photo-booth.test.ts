import { describe, expect, it } from "vitest";
import {
  buildPartyBoothUrl,
  coverCrop,
  photoBoothFilename,
  photoBoothTitle,
} from "@/lib/photo-booth";

describe("private party photo booth", () => {
  it("normalizes event titles without inventing a public identity", () => {
    expect(photoBoothTitle("  Silverman   Hanukkah  ")).toBe("Silverman Hanukkah");
    expect(photoBoothTitle("   ")).toBe("A Confetti celebration");
    expect(photoBoothTitle("x".repeat(100))).toHaveLength(80);
  });

  it("creates a safe and recognizable download filename", () => {
    expect(photoBoothFilename("Joseph's Bar Mitzvah")).toBe(
      "confetti-joseph-s-bar-mitzvah-photo.jpg",
    );
    expect(photoBoothFilename("Fête 2026!")).toBe("confetti-fete-2026-photo.jpg");
  });

  it("builds a server-private booth fragment without discarding existing query state", () => {
    expect(buildPartyBoothUrl("https://confetti.test/rsvp/token")).toBe(
      "https://confetti.test/rsvp/token#party-booth",
    );
    expect(buildPartyBoothUrl("/sample-invite?from=sign#party")).toBe(
      "/sample-invite?from=sign#party-booth",
    );
    expect(buildPartyBoothUrl("/sample-invite#old")).toBe("/sample-invite#party-booth");
  });

  it("centers a landscape source when covering a portrait canvas", () => {
    expect(coverCrop(2000, 1000, 1080, 1350)).toEqual({
      sx: 600,
      sy: 0,
      sw: 800,
      sh: 1000,
    });
  });

  it("centers a portrait source when covering a wider canvas", () => {
    expect(coverCrop(1000, 2000, 1000, 1000)).toEqual({
      sx: 0,
      sy: 500,
      sw: 1000,
      sh: 1000,
    });
  });

  it("fails closed for invalid crop dimensions", () => {
    expect(coverCrop(0, 100, 100, 100)).toEqual({ sx: 0, sy: 0, sw: 0, sh: 0 });
  });
});
