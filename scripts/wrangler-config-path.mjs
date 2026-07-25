// Resolve the wrangler.json produced by the Nitro Cloudflare build.
//
// The @lovable.dev/vite-tanstack-config wrapper writes the Nitro output
// to `dist/` inside the Lovable sandbox and to Nitro's default `.output/`
// everywhere else (including GitHub Actions runners). Both locations must
// be supported — hardcoding either breaks one environment.
//
// Contract: this file is the single source of truth for the config path.
// playwright.config.ts, scripts/verify-webserver.mjs, and the
// package.json `e2e:server` script all derive from it, so a stale build
// directory can never mask a missing config again.
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const WRANGLER_CONFIG_CANDIDATES = [
  ".output/server/wrangler.json", // GitHub Actions / any non-sandbox Nitro build
  "dist/server/wrangler.json", // Lovable sandbox override
];

/**
 * @param {{ cwd?: string, requireExists?: boolean }} [opts]
 * @returns {string} repo-relative path to wrangler.json (POSIX separators)
 */
export function resolveWranglerConfigPath(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const requireExists = opts.requireExists ?? true;
  for (const rel of WRANGLER_CONFIG_CANDIDATES) {
    if (existsSync(resolve(cwd, rel))) return rel;
  }
  if (!requireExists) return WRANGLER_CONFIG_CANDIDATES[0];
  throw new Error(
    `[wrangler-config-path] No wrangler.json found. Ran \`bun run build\`? ` +
      `Looked for: ${WRANGLER_CONFIG_CANDIDATES.join(", ")}`,
  );
}
