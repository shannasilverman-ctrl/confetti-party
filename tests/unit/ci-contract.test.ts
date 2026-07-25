import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * CI contract: every package.json script must invoke a binary that is
 * either a Node built-in tool (node/bun/bunx) or resolvable from a
 * declared dependency. Undeclared globals (e.g. `tsgo`) break clean
 * GitHub runners even when they work locally.
 */
describe("CI contract: package.json scripts", () => {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, "../../package.json"), "utf8")) as {
    scripts: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]);

  // Runners/interpreters always present on the CI image.
  const runners = new Set(["bun", "bunx", "node", "npm", "npx", "pnpm", "yarn", "bash", "sh"]);
  // First-token binaries produced by declared packages. Extend as new
  // devDependencies with non-obvious bin names are added.
  const knownBins: Record<string, string> = {
    tsc: "typescript",
    vite: "vite",
    vitest: "vitest",
    eslint: "eslint",
    prettier: "prettier",
    playwright: "@playwright/test",
    wrangler: "wrangler",
  };

  for (const [name, cmd] of Object.entries(pkg.scripts)) {
    it(`"${name}" uses only declared or built-in binaries`, () => {
      const first = cmd.trim().split(/\s+/)[0];
      if (runners.has(first)) return;
      const owner = knownBins[first];
      expect(owner, `script "${name}" invokes unknown binary "${first}"`).toBeDefined();
      expect(
        declared.has(owner!),
        `script "${name}" needs devDependency "${owner}" for "${first}"`,
      ).toBe(true);
    });
  }
});
