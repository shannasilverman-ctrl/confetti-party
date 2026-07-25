import { describe, expect, it } from "vitest";
import { normalizeAuthReturnTo } from "@/lib/auth-redirect";

describe("normalizeAuthReturnTo", () => {
  it("preserves safe same-origin app paths", () => {
    expect(normalizeAuthReturnTo("/account")).toBe("/account");
    expect(normalizeAuthReturnTo("/party/abc?tab=guests#top")).toBe("/party/abc?tab=guests#top");
  });

  it("rejects external, protocol-relative, recursive auth, and malformed targets", () => {
    for (const target of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/auth?returnTo=/auth",
      "/reset-password",
      "javascript:alert(1)",
      "",
      null,
    ]) {
      expect(normalizeAuthReturnTo(target)).toBe("/app");
    }
  });
});
