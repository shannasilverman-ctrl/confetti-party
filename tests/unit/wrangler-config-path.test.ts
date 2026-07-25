import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CANONICAL_WRANGLER_CONFIG,
  SANDBOX_WRANGLER_CONFIG,
  wranglerConfigCandidates,
  resolveWranglerConfigPath,
} from "../../scripts/wrangler-config-path.mjs";

// The contract must be provable WITHOUT depending on the repo's actual build
// output — unit tests run BEFORE `bun run build` in CI. Every assertion uses
// an isolated temporary fixture directory, then cleans up.

function makeFixture() {
  return mkdtempSync(join(tmpdir(), "wrangler-config-"));
}

function seed(dir: string, rel: string) {
  const abs = join(dir, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, "{}");
}

describe("wrangler config path contract", () => {
  let dir: string;
  beforeEach(() => {
    dir = makeFixture();
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("pins the two canonical path constants", () => {
    expect(CANONICAL_WRANGLER_CONFIG).toBe(".output/server/wrangler.json");
    expect(SANDBOX_WRANGLER_CONFIG).toBe("dist/server/wrangler.json");
  });

  it("GITHUB_ACTIONS=true forces canonical-only mode", () => {
    const env = { GITHUB_ACTIONS: "true" } as NodeJS.ProcessEnv;
    expect(wranglerConfigCandidates({ env })).toEqual([CANONICAL_WRANGLER_CONFIG]);
  });

  it("WRANGLER_STRICT_OUTPUT=1 opt-in also forces canonical-only mode", () => {
    const env = { WRANGLER_STRICT_OUTPUT: "1" } as NodeJS.ProcessEnv;
    expect(wranglerConfigCandidates({ env })).toEqual([CANONICAL_WRANGLER_CONFIG]);
  });

  it("generic CI=1 alone does NOT force canonical-only (sandbox smoke can still use dist/)", () => {
    const env = { CI: "1" } as NodeJS.ProcessEnv;
    expect(wranglerConfigCandidates({ env })).toEqual([
      CANONICAL_WRANGLER_CONFIG,
      SANDBOX_WRANGLER_CONFIG,
    ]);
  });

  it("canonical-only mode: pre-existing dist/ NEVER satisfies the contract (no stale-dir masking)", () => {
    seed(dir, SANDBOX_WRANGLER_CONFIG);
    expect(() =>
      resolveWranglerConfigPath({
        cwd: dir,
        env: { GITHUB_ACTIONS: "true" } as NodeJS.ProcessEnv,
      }),
    ).toThrow(/No wrangler\.json found/);
  });

  it("canonical-only mode: fresh .output/ resolves canonically", () => {
    seed(dir, CANONICAL_WRANGLER_CONFIG);
    expect(
      resolveWranglerConfigPath({
        cwd: dir,
        env: { GITHUB_ACTIONS: "true" } as NodeJS.ProcessEnv,
      }),
    ).toBe(CANONICAL_WRANGLER_CONFIG);
  });

  it("local/sandbox mode: prefers .output/ when both exist (never silently prefers dist)", () => {
    seed(dir, CANONICAL_WRANGLER_CONFIG);
    seed(dir, SANDBOX_WRANGLER_CONFIG);
    expect(resolveWranglerConfigPath({ cwd: dir, env: {} as NodeJS.ProcessEnv })).toBe(
      CANONICAL_WRANGLER_CONFIG,
    );
  });

  it("local/sandbox mode: falls back to dist/ only when .output/ is absent", () => {
    seed(dir, SANDBOX_WRANGLER_CONFIG);
    expect(resolveWranglerConfigPath({ cwd: dir, env: {} as NodeJS.ProcessEnv })).toBe(
      SANDBOX_WRANGLER_CONFIG,
    );
  });

  it("throws with a build-hint message when nothing exists", () => {
    expect(() => resolveWranglerConfigPath({ cwd: dir, env: {} as NodeJS.ProcessEnv })).toThrow(
      /No wrangler\.json found.*bun run build/,
    );
  });

  it("requireExists: false returns the canonical candidate even without files (for path derivation)", () => {
    expect(
      resolveWranglerConfigPath({
        cwd: dir,
        env: {} as NodeJS.ProcessEnv,
        requireExists: false,
      }),
    ).toBe(CANONICAL_WRANGLER_CONFIG);
  });
});
