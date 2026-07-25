// Safe returnTo handling for the auth surface.
//
// Only accepts same-origin path strings that begin with a single "/" and
// belong to a hardcoded allowlist prefix. Rejects everything else — most
// importantly:
//   - absolute URLs and protocol-relative "//host" URLs
//   - "javascript:", "data:", "mailto:", "vbscript:", etc.
//   - backslash-prefixed / mixed-slash tricks ("/\\evil.com")
//   - anything with ".." (parent traversal / normalization tricks)
//   - null bytes, CR/LF, whitespace
//   - anything above 512 chars
//
// Returns the sanitized path, or null if the input is unsafe/absent.
// Callers must fall back to a safe default like "/app".

const ALLOWED_PREFIXES = [
  "/talk",
  "/app",
  "/party/",
  "/sample-invite",
  // Read-only public surfaces a signed-out user might have bookmarked
  // before signing up. We do not include /auth (would loop) or /rsvp
  // (has its own token flow).
  "/reveal",
  "/day-of",
] as const;

const MAX_LEN = 512;

export function sanitizeReturnTo(input: unknown): string | null {
  if (typeof input !== "string") return null;
  if (input.length === 0 || input.length > MAX_LEN) return null;

  // Reject control chars, whitespace, backslashes, null bytes, CR/LF up-front.
  // eslint-disable-next-line no-control-regex
  if (/[\s\x00-\x1f\x7f\\]/.test(input)) return null;

  // Must start with a single "/" followed by a non-"/" char. This rejects
  // "" (empty), "foo", "//evil.com", "/\evil".
  if (input[0] !== "/") return null;
  if (input[1] === "/" || input[1] === undefined) return null;

  // Reject any parent-traversal segment.
  if (input.includes("..")) return null;

  // Reject explicit protocol prefixes that could survive a lax check.
  const lower = input.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("data:") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("vbscript:")
  ) {
    return null;
  }

  // Reject anything that parses as an absolute URL with a scheme.
  // "http://x" would already have failed the "/" check, but be defensive.
  if (/^[a-z][a-z0-9+.-]*:/i.test(input)) return null;

  // Split off query and hash before matching the allowlist prefix — we
  // only allow known route prefixes for the pathname.
  const pathnameEnd = input.search(/[?#]/);
  const pathname = pathnameEnd === -1 ? input : input.slice(0, pathnameEnd);

  const matched = ALLOWED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/") || pathname === p.replace(/\/$/, ""),
  );
  if (!matched) return null;

  return input;
}

export const ALLOWED_RETURN_PREFIXES: readonly string[] = ALLOWED_PREFIXES;
