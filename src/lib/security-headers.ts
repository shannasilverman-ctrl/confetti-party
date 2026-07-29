const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-src 'none'",
].join("; ");

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(self), payment=(), usb=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

/**
 * Apply one security boundary to SSR pages, static fallbacks, and API routes.
 * Rebuilding the response avoids relying on mutable upstream headers.
 */
export function withSecurityHeaders(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  const url = new URL(request.url);

  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }

  // RSVP paths are bearer-capability pages whose HTML can contain the token
  // and private event details. Never let a browser or intermediary retain
  // either valid or invalid token responses.
  if (url.pathname.startsWith("/rsvp/")) {
    headers.set("Cache-Control", "no-store");
    headers.set("Pragma", "no-cache");
  }

  if (url.protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
