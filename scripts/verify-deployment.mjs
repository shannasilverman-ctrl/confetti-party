import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const DEFAULT_DEPLOYMENT_URL =
  "https://confetti-independent-preview.shannasilverman-apps.workers.dev";
export const DEFAULT_VERIFY_ATTEMPTS = 15;
export const DEFAULT_VERIFY_DELAY_MS = 3_000;

const HTML_ROUTES = [
  "/",
  "/app",
  "/talk",
  "/sample-invite",
  "/party/maya-8th",
  "/party/ava-liam-wedding",
  "/party/ava-liam-wedding/reveal",
  "/party/ava-liam-wedding/day-of",
  "/party/grad-bbq",
  "/party/world-cup-final-watch",
];
const ASSETS = [
  ["/sw.js", "javascript"],
  ["/manifest.webmanifest", "application/manifest+json"],
  ["/apple-touch-icon.png", "image/png"],
  ["/app-icon-192.png", "image/png"],
  ["/app-icon-512.png", "image/png"],
  ["/brand/ava-liam.jpg", "image/jpeg"],
  ["/brand/birthday-hero-v1.jpg", "image/jpeg"],
  ["/brand/kids-party-v1.jpg", "image/jpeg"],
  ["/brand/hosting-dinner-v1.jpg", "image/jpeg"],
  ["/brand/world-cup-watch-v1.jpg", "image/jpeg"],
  ["/brand/confetti-hero-poster.jpg", "image/jpeg"],
  ["/brand/confetti-hero-loop-v1.webm", "video/webm"],
];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function normalizeDeploymentUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid deployment URL: ${value}`);
  }
  invariant(url.protocol === "https:", "Deployment verification requires HTTPS.");
  invariant(!url.username && !url.password, "Deployment URL must not contain credentials.");
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function resolveExpectedReleaseSha(env = process.env) {
  const configured = env.CONFETTI_EXPECTED_RELEASE_SHA ?? env.CONFETTI_RELEASE_SHA;
  if (configured) {
    invariant(/^[0-9a-f]{40}$/i.test(configured), "Expected release SHA is invalid.");
    return configured.toLowerCase();
  }

  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: import.meta.dirname,
      encoding: "utf8",
    })
      .trim()
      .toLowerCase();
  } catch {
    throw new Error(
      "Could not resolve the expected release SHA. Set CONFETTI_EXPECTED_RELEASE_SHA.",
    );
  }
}

export function assertHtmlSecurityHeaders(headers, route) {
  const expected = {
    "strict-transport-security": /max-age=/i,
    "content-security-policy": /default-src\s+'self'/i,
    "cross-origin-opener-policy": /^same-origin$/i,
    "permissions-policy": /\S/,
    "referrer-policy": /^strict-origin-when-cross-origin$/i,
    "x-content-type-options": /^nosniff$/i,
    "x-frame-options": /^DENY$/i,
  };

  for (const [name, pattern] of Object.entries(expected)) {
    const value = headers.get(name) ?? "";
    invariant(pattern.test(value), `${route}: missing or invalid ${name} header`);
  }
}

async function fetchChecked(fetchImpl, url, expectedType) {
  const response = await fetchImpl(url, {
    redirect: "error",
    headers: { "cache-control": "no-cache" },
  });
  invariant(response.ok, `${url.pathname}: expected 2xx, received ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  invariant(
    contentType.toLowerCase().includes(expectedType),
    `${url.pathname}: expected ${expectedType}, received ${contentType || "no content type"}`,
  );
  return response;
}

async function verifyTelemetryPrivacyContract(fetchImpl, normalizedBase, cacheBust) {
  const url = new URL("/api/telemetry", `${normalizedBase}/`);
  url.searchParams.set("verify", cacheBust);
  const response = await fetchImpl(url, {
    method: "POST",
    redirect: "error",
    headers: {
      "cache-control": "no-cache",
      "content-type": "application/json",
    },
    // This deliberately invalid payload proves the deployed route rejects
    // arbitrary private fields without adding a synthetic product event.
    body: JSON.stringify({
      event: "plan_created",
      surface: "quick_start",
      partyId: "deployment-probe-must-not-pass",
    }),
  });
  invariant(
    response.status === 400,
    `/api/telemetry: expected privacy rejection 400, received ${response.status}`,
  );
  invariant(
    response.headers.get("cache-control")?.toLowerCase() === "no-store",
    "/api/telemetry: privacy rejection must be no-store",
  );
  assertHtmlSecurityHeaders(response.headers, "/api/telemetry");
}

export async function verifyDeployment(
  baseUrl,
  { fetchImpl = fetch, expectedReleaseSha = resolveExpectedReleaseSha() } = {},
) {
  const normalizedBase = normalizeDeploymentUrl(baseUrl);
  const cacheBust = `release-${Date.now()}`;

  const releaseUrl = new URL("/release.json", `${normalizedBase}/`);
  releaseUrl.searchParams.set("verify", cacheBust);
  const releaseResponse = await fetchChecked(fetchImpl, releaseUrl, "application/json");
  assertHtmlSecurityHeaders(releaseResponse.headers, "/release.json");
  const releasePayload = await releaseResponse.json();
  invariant(
    releasePayload?.release === expectedReleaseSha,
    `/release.json: expected ${expectedReleaseSha}, received ${releasePayload?.release ?? "no release"}`,
  );
  await verifyTelemetryPrivacyContract(fetchImpl, normalizedBase, cacheBust);

  for (const route of HTML_ROUTES) {
    const url = new URL(route, `${normalizedBase}/`);
    url.searchParams.set("verify", cacheBust);
    const response = await fetchChecked(fetchImpl, url, "text/html");
    assertHtmlSecurityHeaders(response.headers, route);

    if (route === "/") {
      const html = await response.text();
      invariant(
        /<link[^>]+rel=["']manifest["'][^>]+href=["']\/manifest\.webmanifest["']/i.test(html),
        "/: missing web app manifest link",
      );
      invariant(
        /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']\/apple-touch-icon\.png["']/i.test(
          html,
        ),
        "/: missing Apple touch icon link",
      );
      invariant(/<meta[^>]+name=["']theme-color["']/i.test(html), "/: missing theme-color meta");
      invariant(
        /<link[^>]+rel=["']canonical["'][^>]+href=["']https:\/\/www\.confettiapp\.ai\/["']/i.test(
          html,
        ),
        "/: missing canonical confettiapp.ai URL",
      );
    }
  }

  for (const [route, expectedType] of ASSETS) {
    const url = new URL(route, `${normalizedBase}/`);
    url.searchParams.set("verify", cacheBust);
    await fetchChecked(fetchImpl, url, expectedType);
  }

  const manifestUrl = new URL("/manifest.webmanifest", `${normalizedBase}/`);
  manifestUrl.searchParams.set("verify", `${cacheBust}-manifest`);
  const manifestResponse = await fetchChecked(fetchImpl, manifestUrl, "application/manifest+json");
  const manifest = await manifestResponse.json();
  invariant(
    typeof manifest.name === "string" &&
      manifest.name.startsWith("Confetti") &&
      manifest.short_name === "Confetti",
    "manifest: unexpected app identity",
  );
  invariant(manifest.start_url === "/app", "manifest: start_url must be /app");
  invariant(manifest.display === "standalone", "manifest: display must be standalone");
  invariant(
    Array.isArray(manifest.icons) &&
      manifest.icons.some((icon) => icon.src === "/app-icon-192.png" && icon.sizes === "192x192") &&
      manifest.icons.some((icon) => icon.src === "/app-icon-512.png" && icon.sizes === "512x512"),
    "manifest: required 192px and 512px icons are missing",
  );

  return {
    baseUrl: normalizedBase,
    releaseSha: expectedReleaseSha,
    htmlRoutes: HTML_ROUTES.length,
    assets: ASSETS.length,
  };
}

export async function verifyDeploymentWithRetry(
  baseUrl,
  {
    attempts = DEFAULT_VERIFY_ATTEMPTS,
    delayMs = DEFAULT_VERIFY_DELAY_MS,
    fetchImpl = fetch,
    expectedReleaseSha = resolveExpectedReleaseSha(),
    onRetry = ({ attempt, error }) =>
      console.warn(
        `[deployment] attempt ${attempt} failed; waiting for edge propagation: ${error.message}`,
      ),
  } = {},
) {
  invariant(
    Number.isInteger(attempts) && attempts >= 1,
    "Retry attempts must be a positive integer.",
  );
  invariant(Number.isFinite(delayMs) && delayMs >= 0, "Retry delay must be a non-negative number.");

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await verifyDeployment(baseUrl, { fetchImpl, expectedReleaseSha });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === attempts) break;
      onRetry({ attempt, error: lastError });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

async function main() {
  const baseUrl = process.argv[2] ?? process.env.CONFETTI_DEPLOYMENT_URL ?? DEFAULT_DEPLOYMENT_URL;
  const result = await verifyDeploymentWithRetry(baseUrl);
  console.log(
    `[deployment] ${result.baseUrl}: release ${result.releaseSha.slice(0, 12)}, ${result.htmlRoutes} routes and ${result.assets} assets verified`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`[deployment] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
