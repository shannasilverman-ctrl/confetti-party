import { describe, it, expect } from "vitest";
import { maskEmail } from "@/routes/account";

describe("maskEmail", () => {
  it("returns em-dash for null", () => {
    expect(maskEmail(null)).toBe("—");
  });
  it("masks the middle of a normal local part", () => {
    expect(maskEmail("alice@example.com")).toBe("a***e@example.com");
  });
  it("handles short local parts", () => {
    expect(maskEmail("al@example.com")).toBe("a*@example.com");
    expect(maskEmail("a@example.com")).toBe("a*@example.com");
  });
  it("returns input unchanged when malformed", () => {
    expect(maskEmail("notanemail")).toBe("notanemail");
  });
});
