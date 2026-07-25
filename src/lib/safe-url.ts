// Strict outbound URL guard. Used at every trust boundary where user- or
// third-party-supplied strings become anchors, images, QR codes, share
// targets, or calendar/directions links.
//
// Rules (all must hold):
//   - Parses as an absolute URL.
//   - Scheme is exactly "https:".
//   - No userinfo (user/pass) segments.
//   - No control characters or whitespace anywhere in the raw string.
//   - Length <= 2048.
//   - Hostname is not empty, not localhost, not a loopback / link-local /
//     private-range / unspecified IP literal (IPv4 or IPv6), and not a
//     bare numeric IPv4 unless explicitly allowed by the caller.
//   - Port, if present, is not a well-known dangerous port.
//   - Optional host allowlist (exact host or ".suffix" match).
//
// Never invent replacements: return null/error on any doubt.

export type SafeUrlOptions = {
  /** Restrict to these hosts. Match is exact or ".suffix" (e.g. "dropbox.com"
   * matches "www.dropbox.com"). Empty/undefined = any host allowed. */
  allowedHosts?: readonly string[];
  /** Allow bare IPv4 literals (still blocks private/loopback). Default false. */
  allowIpLiterals?: boolean;
};

export type SafeUrlResult =
  | { ok: true; url: string; hostname: string; href: string }
  | { ok: false; error: string };

const MAX_LEN = 2048;

// Ports commonly abused for SSRF-style outbound tricks or clearly not for
// public HTTPS traffic. We only speak HTTPS, but block these defensively.
const BLOCKED_PORTS = new Set([
  "22",
  "23",
  "25",
  "110",
  "143",
  "465",
  "587",
  "993",
  "995",
  "3306",
  "3389",
  "5432",
  "6379",
  "9200",
  "11211",
  "27017",
]);

function hasControlOrWhitespace(raw: string): boolean {
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c <= 0x20 || c === 0x7f) return true;
  }
  return false;
}

function isIPv4Literal(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  return m.slice(1).every((p) => {
    const n = Number(p);
    return n >= 0 && n <= 255 && String(n) === p;
  });
}

function isPrivateIPv4(host: string): boolean {
  if (!isIPv4Literal(host)) return false;
  const [a, b] = host.split(".").map(Number);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isBadIPv6(host: string): boolean {
  // URL.hostname wraps IPv6 in [ ] — normalize.
  if (!(host.startsWith("[") && host.endsWith("]"))) return false;
  const inner = host.slice(1, -1).toLowerCase();
  if (inner === "::" || inner === "::1") return true;
  if (inner.startsWith("fe80:") || inner.startsWith("fc") || inner.startsWith("fd")) return true;
  if (inner.startsWith("::ffff:")) {
    const tail = inner.slice("::ffff:".length);
    if (isIPv4Literal(tail) && isPrivateIPv4(tail)) return true;
    // Browser URL parsers normalize ::ffff:127.0.0.1 → ::ffff:7f00:1.
    // Any hex-form ::ffff: mapping to 127.0.0.0/8 or 10/172.16/192.168 is bad.
    const parts = tail.split(":");
    if (parts.length === 2 && parts.every((p) => /^[0-9a-f]{1,4}$/.test(p))) {
      const hi = parseInt(parts[0], 16);
      const lo = parseInt(parts[1], 16);
      const a = (hi >> 8) & 0xff;
      const b = hi & 0xff;
      const dotted = `${a}.${b}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      if (isPrivateIPv4(dotted)) return true;
    }
  }
  return false;
}

function hostAllowed(host: string, allow?: readonly string[]): boolean {
  if (!allow || allow.length === 0) return true;
  const h = host.toLowerCase();
  return allow.some((a) => {
    const cand = a.toLowerCase();
    return h === cand || h.endsWith("." + cand);
  });
}

export function validateSafeUrl(raw: unknown, opts: SafeUrlOptions = {}): SafeUrlResult {
  if (typeof raw !== "string") return { ok: false, error: "URL is required." };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "URL is required." };
  if (trimmed.length > MAX_LEN) return { ok: false, error: "URL is too long." };
  if (hasControlOrWhitespace(trimmed)) {
    return { ok: false, error: "URL contains disallowed characters." };
  }

  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return { ok: false, error: "That doesn’t look like a URL." };
  }

  if (u.protocol !== "https:") return { ok: false, error: "URL must start with https://." };
  if (u.username || u.password) {
    return { ok: false, error: "URL cannot include user credentials." };
  }
  if (!u.hostname) return { ok: false, error: "URL is missing a host." };

  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) {
    return { ok: false, error: "Local addresses are not allowed." };
  }
  if (isIPv4Literal(host)) {
    if (isPrivateIPv4(host)) {
      return { ok: false, error: "Private network addresses are not allowed." };
    }
    if (!opts.allowIpLiterals) {
      return { ok: false, error: "Use a domain name, not a numeric address." };
    }
  }
  if (isBadIPv6(host)) {
    return { ok: false, error: "Private network addresses are not allowed." };
  }

  if (u.port && BLOCKED_PORTS.has(u.port)) {
    return { ok: false, error: "That URL uses a blocked port." };
  }

  if (!hostAllowed(host, opts.allowedHosts)) {
    return { ok: false, error: "That URL is not from an allowed host." };
  }

  return { ok: true, url: u.toString(), hostname: host, href: u.toString() };
}

/** Convenience for outbound anchors: returns the safe URL or null. */
export function safeExternalHref(raw: unknown, opts: SafeUrlOptions = {}): string | null {
  const r = validateSafeUrl(raw, opts);
  return r.ok ? r.url : null;
}
