/**
 * Map Supabase / network errors to friendly, non-enumerating strings.
 * Never leak raw provider or PostgREST internals into the UI.
 */
export type AuthErrorKind =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "rate_limited"
  | "weak_password"
  | "email_taken"
  | "network"
  | "unknown";

export type FriendlyAuthError = { kind: AuthErrorKind; message: string };

const FRIENDLY: Record<AuthErrorKind, string> = {
  invalid_credentials: "That email and password combination wasn't recognized.",
  email_not_confirmed: "Please confirm your email address before signing in.",
  rate_limited: "Too many attempts. Please wait a moment before trying again.",
  weak_password: "Choose a stronger password with at least 8 characters.",
  // Deliberately non-enumerating: no distinct "email already exists" message.
  email_taken: "Couldn't create that account. Try signing in instead.",
  network: "Couldn't reach the sign-in service. Check your connection and try again.",
  unknown: "Something went wrong. Please try again shortly.",
};

export function friendlyAuthError(raw: unknown, fallback: AuthErrorKind = "unknown"): FriendlyAuthError {
  const text = extractText(raw).toLowerCase();
  if (!text) return { kind: fallback, message: FRIENDLY[fallback] };
  if (/network|fetch|failed to fetch|timeout|offline/.test(text))
    return { kind: "network", message: FRIENDLY.network };
  if (/rate|too many|429/.test(text))
    return { kind: "rate_limited", message: FRIENDLY.rate_limited };
  if (/confirm/.test(text) && /email/.test(text))
    return { kind: "email_not_confirmed", message: FRIENDLY.email_not_confirmed };
  if (/invalid.*(login|credential|password)|invalid_grant/.test(text))
    return { kind: "invalid_credentials", message: FRIENDLY.invalid_credentials };
  if (/password.*(short|weak|characters)/.test(text))
    return { kind: "weak_password", message: FRIENDLY.weak_password };
  if (/already registered|already exists|user.*exists/.test(text))
    return { kind: "email_taken", message: FRIENDLY.email_taken };
  return { kind: fallback, message: FRIENDLY[fallback] };
}

function extractText(raw: unknown): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  if (raw instanceof Error) return raw.message;
  if (typeof raw === "object" && raw !== null && "message" in raw) {
    const m = (raw as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "";
}
