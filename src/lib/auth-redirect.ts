const DEFAULT_AUTH_TARGET = "/app";

/** Accept only same-origin path targets. This prevents `returnTo` from
 * becoming an open redirect while still supporting deep app routes. */
export function normalizeAuthReturnTo(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 500) {
    return DEFAULT_AUTH_TARGET;
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return DEFAULT_AUTH_TARGET;
  }
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return DEFAULT_AUTH_TARGET;
  }
  try {
    const parsed = new URL(value, "https://confetti.invalid");
    if (parsed.origin !== "https://confetti.invalid") return DEFAULT_AUTH_TARGET;
    if (parsed.pathname === "/auth" || parsed.pathname === "/reset-password") {
      return DEFAULT_AUTH_TARGET;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_AUTH_TARGET;
  }
}
