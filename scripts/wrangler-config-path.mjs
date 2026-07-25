// Resolve the wrangler.json produced by the Nitro Cloudflare build.
//
// Canonical CI/clean-build output is `.output/server/wrangler.json` — this is
// what GitHub Actions and any non-sandbox Nitro build emit. The Lovable
// sandbox wrapper emits to `dist/` instead. To keep CI honest, a pre-existing
// `dist/` must NEVER satisfy the contract when we're in CI: only `.output/`
// counts. Outside CI (local dev / Lovable sandbox), `dist/` is accepted only
// when `.output/` is absent — never as a silent fallback next to a fresh
// `.output/`.
//
// Contract: this file is the single source of truth for the config path.
// playwright.config.ts, scripts/verify-webserver.mjs, and the
// package.json `e2e:server` script all derive from it.
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const CANONICAL_WRANGLER_CONFIG = ".output/server/wrangler.json";
export const SANDBOX_WRANGLER_CONFIG = "dist/server/wrangler.json";

/**
 * Environments where only the canonical `.output/` layout is valid.
 * GitHub Actions sets `GITHUB_ACTIONS=true` automatically. Generic `CI=1`
 * is intentionally NOT enough on its own — sandbox smoke runs set `CI=1` to
 * force Playwright's no-reuse webServer mode, and must still accept the
 * sandbox's `dist/` output. Set `WRANGLER_STRICT_OUTPUT=1` to opt any
 * environment into canonical-only mode explicitly.
 * @param {NodeJS.ProcessEnv} env
 */
function isCanonicalOnly(env) {
  return env.GITHUB_ACTIONS === "true" || env.WRANGLER_STRICT_OUTPUT === "1";
}

/**
 * The ordered list of relative paths this environment will accept.
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 * @returns {string[]}
 */
export function wranglerConfigCandidates(opts = {}) {
  const env = opts.env ?? process.env;
  if (isCanonicalOnly(env)) return [CANONICAL_WRANGLER_CONFIG];
  return [CANONICAL_WRANGLER_CONFIG, SANDBOX_WRANGLER_CONFIG];
}

/**
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, requireExists?: boolean }} [opts]
 * @returns {string} repo-relative path to wrangler.json (POSIX separators)
 */
export function resolveWranglerConfigPath(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const env = opts.env ?? process.env;
  const requireExists = opts.requireExists ?? true;
  const candidates = wranglerConfigCandidates({ env });
  for (const rel of candidates) {
    if (existsSync(resolve(cwd, rel))) return rel;
  }
  if (!requireExists) return candidates[0];
  throw new Error(
    `[wrangler-config-path] No wrangler.json found. Ran \`bun run build\`? ` +
      `Looked for: ${candidates.join(", ")}`,
  );
}
