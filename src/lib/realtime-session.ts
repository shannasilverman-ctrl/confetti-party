// Pure helpers for the Realtime session mint. Extracted so they can be
// unit-tested without spinning up the TanStack server route.
//
// Contract references (OpenAI Realtime, current as of 2026-01):
//   * Endpoint: POST https://api.openai.com/v1/realtime/client_secrets
//   * Model:    gpt-realtime-2.1
//   * Voice:    marin (default) — supported preset
//   * No OpenAI-Beta header, no /v1/realtime/sessions endpoint.
//
// See OPENAI_REALTIME.md for the full boundary and privacy notes.

export const REALTIME_MODEL = "gpt-realtime-2.1";
export const REALTIME_VOICE = "marin";
export const REALTIME_CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";

// A minted client secret is treated as expired this many seconds before the
// stated `expires_at`, so we don't hand out a secret that will die in flight.
export const REALTIME_EXPIRY_SKEW_S = 5;

// Server-side hard cap on how long a talk session may remain "open" without
// an ended_at row before the concurrency guard ignores it. Enforced by the
// mint route; also mirrored by a client-side keepalive/end call.
export const REALTIME_SESSION_STALE_MS = 15 * 60 * 1000;

export interface BuildSessionBodyInput {
  instructions: string;
  model?: string;
  voice?: string;
}

/**
 * Build the JSON body for the client-secret mint request. Uses the current
 * nested Realtime schema: everything lives under `session` with an explicit
 * `type: "realtime"` discriminator.
 */
export function buildRealtimeSessionBody(input: BuildSessionBodyInput) {
  return {
    session: {
      type: "realtime" as const,
      model: input.model ?? REALTIME_MODEL,
      instructions: input.instructions,
      audio: {
        input: {
          transcription: { model: "gpt-4o-mini-transcribe" },
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
            create_response: true,
            interrupt_response: true,
          },
        },
        output: {
          voice: input.voice ?? REALTIME_VOICE,
        },
      },
    },
  };
}

/**
 * Derive a privacy-preserving, stable "safety identifier" from an
 * authenticated user id. Used only in the `OpenAI-Safety-Identifier`
 * header on the server-side mint request so OpenAI can correlate abuse
 * signals without ever seeing the raw Supabase user id or email.
 *
 * A non-empty salt is REQUIRED. The route layer refuses to mint without
 * one, so an unsalted digest can never leave the server. Passing an
 * empty/nullish salt here throws instead of silently degrading privacy.
 */
export async function computeSafetyIdentifier(
  userId: string,
  salt: string,
): Promise<string> {
  if (typeof salt !== "string" || salt.length < 8) {
    throw new Error("OPENAI_SAFETY_ID_SALT missing or too short");
  }
  const material = `${salt}:${userId}`;
  const bytes = new TextEncoder().encode(material);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // Prefix so log scrapers can tell at a glance this is not a raw user id.
  // 32 hex chars = 128 bits — plenty for correlation, well under the header
  // length cap and still fully opaque.
  return `conf_${hex.slice(0, 32)}`;
}

/**
 * Cryptographically random correlation id used to tag one mint request in
 * server logs. Not user-identifying; safe to log.
 */
export function newCorrelationId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `req_${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * Shape of a successful `/v1/realtime/client_secrets` response. Only the
 * fields we actually consume.
 */
export interface ClientSecretResponse {
  value: string;
  expires_at: number;
  session?: { id?: string; model?: string };
}

/**
 * Strictly validate the upstream mint response. Rejects:
 *  - non-object payloads
 *  - missing/empty `value`
 *  - non-finite / non-positive `expires_at`
 *  - `expires_at` already past (with a small skew to avoid handing out
 *    a secret that will die in transit).
 *
 * `nowS` is injectable for tests; defaults to wall-clock seconds.
 */
export function parseClientSecretResponse(
  raw: unknown,
  nowS: number = Math.floor(Date.now() / 1000),
): ClientSecretResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.value !== "string" || r.value.length === 0) return null;
  if (typeof r.expires_at !== "number" || !Number.isFinite(r.expires_at)) return null;
  if (r.expires_at <= nowS + REALTIME_EXPIRY_SKEW_S) return null;
  const session =
    r.session && typeof r.session === "object"
      ? (r.session as { id?: string; model?: string })
      : undefined;
  return { value: r.value, expires_at: r.expires_at, session };
}
