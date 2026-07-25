#!/usr/bin/env node
/**
 * CI contract smoke: spawn the exact command declared by playwright.config.ts
 * webServer, wait for the URL to serve HTTP 200, then terminate cleanly.
 *
 * Runs with no ambient reuse (no `reuseExistingServer` shortcut). If the
 * process fails to bind, exits early, or the URL never returns 200 within
 * the timeout, this script exits non-zero so CI cannot ship a broken
 * webServer contract.
 *
 * Usage: node scripts/verify-webserver.mjs
 * Env:   PW_PORT (default 4173)
 */
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { resolveWranglerConfigPath } from "./wrangler-config-path.mjs";

const PORT = Number(process.env.PW_PORT ?? 4173);
const URL = `http://127.0.0.1:${PORT}/`;
const START_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 500;

// Resolve the current build's wrangler.json — .output/ on GitHub, dist/ in
// the Lovable sandbox. Fails loudly (non-zero) if the build has not been
// produced yet, which is the actual CI failure this smoke exists to catch.
const CONFIG = resolveWranglerConfigPath();

// The command below MUST stay in sync with playwright.config.ts webServer.command.
const CMD = "bunx";
const ARGS = [
  "wrangler",
  "dev",
  "--config",
  CONFIG,
  "--port",
  String(PORT),
  "--ip",
  "127.0.0.1",
];

console.log(`[verify-webserver] spawning: ${CMD} ${ARGS.join(" ")}`);
const child = spawn(CMD, ARGS, {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" },
});

let earlyExitCode = null;
child.on("exit", (code, signal) => {
  earlyExitCode = code ?? (signal ? `signal:${signal}` : "unknown");
});
child.stdout.on("data", (b) => process.stdout.write(`[server] ${b}`));
child.stderr.on("data", (b) => process.stderr.write(`[server:err] ${b}`));

const deadline = Date.now() + START_TIMEOUT_MS;
let lastError = null;

async function poll() {
  while (Date.now() < deadline) {
    if (earlyExitCode !== null) {
      throw new Error(`webServer exited before ready (code=${earlyExitCode})`);
    }
    try {
      const res = await fetch(URL, { method: "GET" });
      if (res.status === 200) return res;
      lastError = new Error(`unexpected status ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error(`timed out waiting for ${URL} (last=${lastError?.message ?? "n/a"})`);
}

let ok = false;
try {
  const res = await poll();
  console.log(`[verify-webserver] OK: ${URL} -> ${res.status}`);
  ok = true;
} catch (err) {
  console.error(`[verify-webserver] FAIL: ${err.message}`);
} finally {
  if (earlyExitCode === null) {
    child.kill("SIGTERM");
    const killDeadline = Date.now() + 5_000;
    while (earlyExitCode === null && Date.now() < killDeadline) {
      await delay(100);
    }
    if (earlyExitCode === null) child.kill("SIGKILL");
  }
}

process.exit(ok ? 0 : 1);
