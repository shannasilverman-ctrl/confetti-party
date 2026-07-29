import { describe, expect, it } from "vitest";
import { safeParseDraftPatch } from "@/lib/talk-schemas";

describe("Talk birthday life-stage schema", () => {
  it.each(["child", "teen", "adult"] as const)("accepts the %s stage", (stage) => {
    expect(
      safeParseDraftPatch({
        identity: {
          workingTitle: "Birthday",
          occasion: "birthday",
          honoreeLifeStage: stage,
        },
      }),
    ).toEqual({
      patch: {
        identity: {
          workingTitle: "Birthday",
          occasion: "birthday",
          honoreeLifeStage: stage,
        },
      },
      issues: [],
    });
  });

  it("rejects an invented stage instead of passing it to persistence", () => {
    const result = safeParseDraftPatch({
      identity: {
        occasion: "birthday",
        honoreeLifeStage: "senior",
      },
    });
    expect(result.patch).toEqual({});
    expect(result.issues).toEqual(["identity.honoreeLifeStage:invalid_enum_value"]);
  });
});
