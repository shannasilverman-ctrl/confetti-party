// Pure helpers for the Realtime session mint. Extracted so they can be
// unit-tested without spinning up the TanStack server route.
//
// Contract references (OpenAI Realtime, current as of 2025):
//   * Endpoint: POST https://api.openai.com/v1/realtime/client_secrets
//   * Model:    gpt-realtime-2.1
//   * Voice:    marin (default) — supported preset
//   * No OpenAI-Beta header, no /v1/realtime/sessions endpoint.
//
// See OPENAI_REALTIME.md for the full boundary and privacy notes.

export const REALTIME_MODEL = "gpt-realtime-2.1";
export const REALTIME_VOICE = "marin";
export const REALTIME_CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";

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
 * - Uses Web Crypto (SubtleCrypto), which is available in the Cloudflare
 *   Worker SSR runtime and in Node ≥ 20.
 * - If OPENAI_SAFETY_ID_SALT is set on the server, it's mixed in so the
 *   digest is unlinkable across projects. Without a salt the digest is
 *   still opaque (SHA-256 of the user id), but linkable across deployments
 *   that share the same user-id space. This limitation is documented in
 *   OPENAI_REALTIME.md.
 * - Never returns raw PII. Never throws for a well-formed string input.
 */
export async function computeSafetyIdentifier(
  userId: string,
  salt?: string | null,
): Promise<string> {
  const material = `${salt ?? ""}:${userId}`;
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
 * Shape of a successful `/v1/realtime/client_secrets` response. Only the
 * fields we actually consume.
 */
export interface ClientSecretResponse {
  value: string;
  expires_at: number;
  session?: { id?: string; model?: string };
}

export function parseClientSecretResponse(raw: unknown): ClientSecretResponse | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.value !== "string" || typeof r.expires_at !== "number") {
    return null;
  }
  const session =
    r.session && typeof r.session === "object"
      ? (r.session as { id?: string; model?: string })
      : undefined;
  return { value: r.value, expires_at: r.expires_at, session };
}
