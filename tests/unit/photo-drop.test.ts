import { describe, expect, it } from "vitest";
import { sanitizePublicPhotoDrop, validatePhotoDropUrl } from "@/lib/photo-drop";

describe("Photo Drop URL safety", () => {
  it("accepts the configured provider host and normalizes the URL", () => {
    expect(
      validatePhotoDropUrl("dropbox_request", " https://www.dropbox.com/request/abc "),
    ).toEqual({
      ok: true,
      url: "https://www.dropbox.com/request/abc",
    });
  });

  it("rejects insecure, lookalike, and credential-bearing public links", () => {
    expect(validatePhotoDropUrl("dropbox_request", "http://www.dropbox.com/request/abc").ok).toBe(
      false,
    );
    expect(validatePhotoDropUrl("dropbox_request", "https://dropbox.com.evil.test/x").ok).toBe(
      false,
    );
    expect(
      sanitizePublicPhotoDrop({
        provider: "custom",
        url: "https://user:password@example.com/upload",
      }),
    ).toBeNull();
    expect(sanitizePublicPhotoDrop({ provider: "custom", url: "javascript:alert(1)" })).toBeNull();
  });

  it("normalizes bounded guest copy and supports the historic note key", () => {
    expect(
      sanitizePublicPhotoDrop({
        provider: "custom",
        url: "https://uploads.example.com/drop",
        label: "  Family\u0000 photos  ",
        note: "  Add your favorites\nplease  ",
        ignored: "never exposed",
      }),
    ).toEqual({
      provider: "custom",
      url: "https://uploads.example.com/drop",
      label: "Family  photos",
      notes: "Add your favorites please",
      hostname: "uploads.example.com",
    });
  });

  it("rejects malformed public projections instead of rendering a risky link", () => {
    for (const value of [
      null,
      [],
      {},
      { provider: "unknown", url: "https://example.com" },
      { provider: "custom", url: 42 },
    ]) {
      expect(sanitizePublicPhotoDrop(value)).toBeNull();
    }
  });
});
