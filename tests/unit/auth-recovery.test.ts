import { describe, expect, it } from "vitest";
import { isRecoveryRedirect } from "@/lib/auth-recovery";

describe("isRecoveryRedirect", () => {
  it.each([
    ["?type=recovery", ""],
    ["", "#type=recovery&access_token=redacted"],
    ["?next=%2Fapp", "#type=recovery"],
  ])("accepts an explicit recovery marker", (search, hash) => {
    expect(isRecoveryRedirect(search, hash)).toBe(true);
  });

  it.each([
    ["", ""],
    ["?type=signup", ""],
    ["?returnTo=%2Fapp", "#access_token=redacted"],
    ["?type=RECOVERY", ""],
  ])("does not infer recovery from an ordinary session", (search, hash) => {
    expect(isRecoveryRedirect(search, hash)).toBe(false);
  });
});
