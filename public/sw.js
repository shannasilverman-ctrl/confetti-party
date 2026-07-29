/* Confetti's service worker caches only the application shell and public
 * static assets. Private party data stays in the validated, user-scoped
 * IndexedDB read cache owned by PartyProvider. */

const CACHE_PREFIX = "confetti-shell-";
const release = new URL(self.location.href).searchParams.get("v") || "local";
const CACHE_NAME = `${CACHE_PREFIX}${release.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 64)}`;
const SHELL_URL = "/app";
const PRECACHE_URLS = [
  SHELL_URL,
  "/manifest.webmanifest",
  "/favicon.svg",
  "/apple-touch-icon.png",
  "/app-icon-192.png",
  "/app-icon-512.png",
];

function canCache(response) {
  return response.ok && (response.type === "basic" || response.type === "default");
}

async function cachePublicUrl(cache, url) {
  try {
    const response = await fetch(url, { cache: "reload", credentials: "same-origin" });
    if (canCache(response)) await cache.put(url, response);
  } catch {
    // A partial install is still useful. Missing assets can populate at runtime.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.all(PRECACHE_URLS.map((url) => cachePublicUrl(cache, url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isSensitivePath(pathname) {
  return (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/rsvp/") ||
    pathname.startsWith("/collaborate") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/account") ||
    pathname === "/release.json"
  );
}

function isPublicAsset(pathname) {
  return (
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/brand/") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/favicon.svg" ||
    pathname === "/apple-touch-icon.png" ||
    pathname === "/app-icon-192.png" ||
    pathname === "/app-icon-512.png" ||
    pathname === "/icon-maskable.svg"
  );
}

async function publicAssetResponse(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (canCache(response)) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function navigationResponse(request) {
  try {
    return await fetch(request);
  } catch {
    return (
      (await caches.match(SHELL_URL)) ||
      new Response("Confetti is offline. Reconnect once to make this plan available.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      })
    );
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isSensitivePath(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(navigationResponse(request));
    return;
  }

  if (isPublicAsset(url.pathname)) {
    event.respondWith(publicAssetResponse(request));
  }
});
