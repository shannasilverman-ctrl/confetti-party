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
  // Keep the production Worker and Chromium inside the constrained GitHub
  // runner's memory envelope. Two workers can outlive the local Worker and
  // turn otherwise-valid routes into a cascade of ERR_CONNECTION_REFUSED.
  // Keep local verification deterministic too. An unrestricted CPU-derived
  // worker count can overwhelm the single Wrangler preview process and turn
  // healthy routes into ERR_CONNECTION_REFUSED noise.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    // Allow overriding the browser binary for constrained local environments.
    // CI installs system deps and uses the bundled binary.
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
    // Invoke the project-pinned Wrangler binary directly so the harness works
    // with either Bun or npm. Keep this in lockstep with
    // scripts/verify-webserver.mjs so the CI-contract smoke covers it.
    command: `./node_modules/.bin/wrangler dev --config ${WRANGLER_CONFIG} --port ${PORT} --ip 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: { WRANGLER_SEND_METRICS: "false" },
  },
});
