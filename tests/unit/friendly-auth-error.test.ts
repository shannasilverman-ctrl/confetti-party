import { describe, expect, it } from "vitest";
import { friendlyAuthError } from "@/lib/friendly-auth-error";

describe("friendlyAuthError", () => {
  it("maps invalid-credentials variants", () => {
    expect(friendlyAuthError({ message: "Invalid login credentials" }).kind).toBe(
      "invalid_credentials",
    );
    expect(friendlyAuthError(new Error("invalid_grant: bad password")).kind).toBe(
      "invalid_credentials",
    );
  });
  it("maps network throws", () => {
    expect(friendlyAuthError(new TypeError("Failed to fetch")).kind).toBe("network");
    expect(friendlyAuthError({ message: "network timeout" }).kind).toBe("network");
  });
  it("maps rate limits", () => {
    expect(friendlyAuthError({ message: "429 Too Many Requests" }).kind).toBe("rate_limited");
  });
  it("maps unconfirmed email", () => {
    expect(friendlyAuthError({ message: "Email not confirmed" }).kind).toBe("email_not_confirmed");
  });
  it("maps weak passwords", () => {
    expect(friendlyAuthError({ message: "Password should be at least 8 characters" }).kind).toBe(
      "weak_password",
    );
  });
  it("does not enumerate: email-exists collapses to generic", () => {
    const r = friendlyAuthError({ message: "User already registered" });
    expect(r.kind).toBe("email_taken");
    // Non-enumerating copy: no mention of "exists" or "registered"
    expect(r.message.toLowerCase()).not.toMatch(/exist|registered|already/);
  });
  it("never returns raw provider text", () => {
    const raw = "PGRST116: some-internal-postgres-thing";
    const r = friendlyAuthError({ message: raw }, "unknown");
    expect(r.message).not.toContain("PGRST");
    expect(r.message).not.toContain("postgres");
  });
  it("falls back for empty inputs", () => {
    expect(friendlyAuthError(undefined).kind).toBe("unknown");
    expect(friendlyAuthError(null, "rate_limited").kind).toBe("rate_limited");
  });
});
