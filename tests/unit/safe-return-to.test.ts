import { describe, it, expect } from "vitest";
import { sanitizeReturnTo } from "@/lib/safe-return-to";

describe("sanitizeReturnTo", () => {
  it.each([
    "/talk",
    "/app",
    "/app?tab=guests",
    "/app#foo",
    "/party/abc123",
    "/party/abc/reveal",
    "/sample-invite",
    "/reveal",
    "/day-of",
  ])("accepts %s", (v) => {
    expect(sanitizeReturnTo(v)).toBe(v);
  });

  it.each([
    // Not a string
    [null],
    [undefined],
    [123],
    [{}],
    [[]],
    // Wrong prefix / not allowlisted
    [""],
    ["/"],
    ["/admin"],
    ["/settings"],
    ["/rsvp/abc"],
    ["/auth"],
    // Absolute / protocol-relative / scheme
    ["//evil.com/app"],
    ["http://evil.com"],
    ["https://evil.com/app"],
    ["javascript:alert(1)"],
    ["JAVASCRIPT:alert(1)"],
    ["data:text/html,foo"],
    ["mailto:a@b"],
    ["vbscript:msgbox"],
    ["custom-scheme:x"],
    // Backslash / mixed-slash tricks
    ["/\\evil.com"],
    ["\\/app"],
    // Traversal
    ["/app/../admin"],
    ["/talk/../../secret"],
    // Whitespace / control chars / null byte
    ["/app "],
    [" /app"],
    ["/app\nlogin"],
    ["/app\x00x"],
    // Missing leading slash
    ["app"],
    ["talk"],
    // Too long
    ["/app/" + "a".repeat(600)],
  ])("rejects %o", (v) => {
    expect(sanitizeReturnTo(v)).toBeNull();
  });
});
