import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { maskEmail } from "@/lib/account-format";
import { stripPartyClaimSecrets } from "@/lib/account.functions";

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

describe("account lifecycle safety", () => {
  it("strips guest release capabilities without mutating unrelated party data", () => {
    const source = {
      name: "Party",
      bring_board: [
        { id: "a", label: "Ice", claimSecret: "private-a" },
        { id: "b", label: "Pie" },
      ],
    };
    expect(stripPartyClaimSecrets(source)).toEqual({
      name: "Party",
      bring_board: [
        { id: "a", label: "Ice" },
        { id: "b", label: "Pie" },
      ],
    });
    expect((source.bring_board[0] as Record<string, unknown>).claimSecret).toBe("private-a");
  });

  it("requires a recent real auth method, not a freshly rotated JWT", () => {
    const migration = readFileSync(
      "supabase/migrations/20260725081600_cf609880-6c8f-413a-9b72-395c17be3be4.sql",
      "utf8",
    );
    expect(migration).toContain("claims->'amr'");
    expect(migration).toContain("method->>'timestamp'");
    expect(migration).not.toMatch(/->>\s*'iat'/);
    expect(migration).toContain("SET search_path = pg_catalog, auth");
  });
});
