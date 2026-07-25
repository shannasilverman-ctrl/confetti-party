import { pathToFileURL } from "node:url";

export const DEFAULT_DEPLOYMENT_URL =
  "https://confetti-independent-preview.shannasilverman-apps.workers.dev";

const HTML_ROUTES = ["/", "/app", "/talk"];
const ASSETS = [
  ["/manifest.webmanifest", "application/manifest+json"],
  ["/apple-touch-icon.png", "image/png"],
  ["/app-icon-192.png", "image/png"],
  ["/app-icon-512.png", "image/png"],
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

export async function verifyDeployment(baseUrl, { fetchImpl = fetch } = {}) {
  const normalizedBase = normalizeDeploymentUrl(baseUrl);
  const cacheBust = `release-${Date.now()}`;

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
    htmlRoutes: HTML_ROUTES.length,
    assets: ASSETS.length,
  };
}

async function main() {
  const baseUrl = process.argv[2] ?? process.env.CONFETTI_DEPLOYMENT_URL ?? DEFAULT_DEPLOYMENT_URL;
  const result = await verifyDeployment(baseUrl);
  console.log(
    `[deployment] ${result.baseUrl}: ${result.htmlRoutes} routes and ${result.assets} assets verified`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`[deployment] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
