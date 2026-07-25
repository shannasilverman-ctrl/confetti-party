import { describe, expect, it } from "vitest";
import { normalizeAuthReturnTo } from "@/lib/auth-redirect";

describe("normalizeAuthReturnTo — safe path preservation", () => {
  it("preserves safe same-origin app paths with query and hash", () => {
    expect(normalizeAuthReturnTo("/account")).toBe("/account");
    expect(normalizeAuthReturnTo("/party/abc?tab=guests#top")).toBe("/party/abc?tab=guests#top");
    expect(normalizeAuthReturnTo("/talk")).toBe("/talk");
  });
});

describe("normalizeAuthReturnTo — adversarial matrix", () => {
  const rejected = [
    // External / protocol-based
    "https://evil.example",
    "http://evil.example/path",
    "//evil.example",
    "//evil.example/path",
    // Backslash confusion (some browsers coerce \ → /)
    "/\\evil.example",
    "\\\\evil.example",
    "/path\\..\\etc",
    // JS / data URLs
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:alert(1)",
    // Recursive auth targets
    "/auth",
    "/auth?returnTo=/auth",
    "/reset-password",
    "/reset-password?x=1",
    // Encoded/malformed
    "%2F%2Fevil.example",
    " /app",
    "\t/app",
    "\n/app",
    // Non-string / empty
    "",
    null,
    undefined,
    123,
    {},
    [],
    // Absurd length
    "/" + "a".repeat(600),
  ];

  it.each(rejected)("rejects %j", (target) => {
    expect(normalizeAuthReturnTo(target as unknown)).toBe("/app");
  });
});
