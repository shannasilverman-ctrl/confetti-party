import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  WRANGLER_CONFIG_CANDIDATES,
  resolveWranglerConfigPath,
} from "../../scripts/wrangler-config-path.mjs";

describe("wrangler config path contract", () => {
  it("only accepts .output/ or dist/ Nitro layouts (no stale/hardcoded dirs)", () => {
    expect(WRANGLER_CONFIG_CANDIDATES).toEqual([
      ".output/server/wrangler.json",
      "dist/server/wrangler.json",
    ]);
  });

  it("resolves to a config that actually exists on disk after `bun run build`", () => {
    const rel = resolveWranglerConfigPath();
    expect(WRANGLER_CONFIG_CANDIDATES).toContain(rel);
    expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
  });

  it("throws when neither build layout exists (prevents stale-dir masking)", () => {
    expect(() => resolveWranglerConfigPath({ cwd: "/tmp/definitely-no-build-here" })).toThrow(
      /No wrangler\.json found/,
    );
  });
});
