import { defineConfig, devices } from "@playwright/test";
import { resolveWranglerConfigPath } from "./scripts/wrangler-config-path.mjs";

const PORT = Number(process.env.PW_PORT ?? 4173);
const BASE_URL = `http://127.0.0.1:${PORT}`;
// Fail fast at Playwright config load time if the build output is missing.
// Playwright's webServer.command is a string, so we must resolve the path
// eagerly rather than at spawn time.
const WRANGLER_CONFIG = resolveWranglerConfigPath();

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    // Allow overriding the browser binary (used locally on the Lovable sandbox
    // where a Nix chromium is provided). CI installs system deps via
    // `playwright install --with-deps` and uses the bundled binary.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    // Serve the production build via the Cloudflare Worker preview
    // (nodejs_compat) so E2E hits the same runtime as the deployed site.
    // Invoke wrangler directly (no `bun run … --` layer) and drop the
    // wrangler v4 no-op `--local` flag so a clean GitHub runner sees the
    // exact same command locally. Keep this in lockstep with
    // scripts/verify-webserver.mjs so the CI-contract smoke covers it.
    command: `bunx wrangler dev --config ${WRANGLER_CONFIG} --port ${PORT} --ip 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: { WRANGLER_SEND_METRICS: "false" },
  },
});
