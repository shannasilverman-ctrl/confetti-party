import { describe, expect, it } from "vitest";
import {
  assertReleaseSha,
  assertVersionId,
  deployArguments,
  parseRollbackArguments,
  rollbackArguments,
} from "../../scripts/release-operations.mjs";

const RELEASE = "95b543e8c9343de759737b8b4fd330fccea5184f";
const VERSION = "1dca6eed-b408-48f8-aafc-a207728977c3";

describe("release operations", () => {
  it("requires full commit and Cloudflare version identities", () => {
    expect(assertReleaseSha(RELEASE.toUpperCase())).toBe(RELEASE);
    expect(assertVersionId(VERSION.toUpperCase())).toBe(VERSION);
    expect(() => assertReleaseSha("95b543e")).toThrow(/40-character/);
    expect(() => assertVersionId("latest")).toThrow(/valid UUID/);
  });

  it("attaches the exact release identity to deployments", () => {
    expect(deployArguments(RELEASE)).toEqual(
      expect.arrayContaining(["--message", `Confetti release ${RELEASE}`]),
    );
  });

  it("keeps rollback dry-run unless execution is explicit", () => {
    expect(parseRollbackArguments(["--version", VERSION, "--release", RELEASE])).toEqual({
      execute: false,
      versionId: VERSION,
      releaseSha: RELEASE,
    });
    expect(
      parseRollbackArguments(["--version", VERSION, "--release", RELEASE, "--execute"]).execute,
    ).toBe(true);
  });

  it("builds an exact non-interactive rollback command", () => {
    expect(rollbackArguments(VERSION, RELEASE)).toEqual([
      "rollback",
      VERSION,
      "--name",
      "confetti-independent-preview",
      "--message",
      `Confetti rollback to ${RELEASE}`,
    ]);
  });
});
