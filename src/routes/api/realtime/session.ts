// POST /api/realtime/session — mints a short-lived OpenAI Realtime client
// secret for the browser. The long-lived OPENAI_API_KEY never leaves the server.
//
// Contract: uses the current /v1/realtime/client_secrets endpoint with the
// nested `session` schema and gpt-realtime-2.1 (docs current 2026-01). See
// OPENAI_REALTIME.md.
//
// Privacy invariants (enforced by tests):
//   * The Supabase user id, the salted safety id, the bearer token, the
//     OpenAI API key, and raw provider bodies NEVER appear in any log
//     payload. Only a per-request `req_...` correlation id, a sanitized
//     failure category, and the OpenAI request id are logged.
//   * `OPENAI_SAFETY_ID_SALT` is required whenever `OPENAI_API_KEY` is
//     configured, and it is only ever used to compute the outbound
//     `OpenAI-Safety-Identifier` header — never stored, never logged.
//
// Fail-closed ordering — authenticate BEFORE revealing configuration
// state so an unauthenticated caller cannot probe deployment health:
//   1. Bearer header presence          → 401 if missing/malformed
//   2. Bearer verification (Supabase)  → 401 if invalid/expired
//   3. Server configuration            → 503 if key or salt missing
//   4. Atomic DB reservation RPC       → transaction advisory-locks per user,
//                                        enforces 5/hour + 2 concurrent across
//                                        every Worker, and inserts the row
//   5. Mint client secret              → 502 on upstream failure
//                                        (reservation is closed and the
//                                        cleanup itself never leaks)

import { createFileRoute } from "@tanstack/react-router";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { TALK_SYSTEM_PROMPT } from "@/lib/gathering-draft";
import {
  REALTIME_CLIENT_SECRETS_URL,
  REALTIME_MODEL,
  REALTIME_VOICE,
  buildRealtimeSessionBody,
  computeSafetyIdentifier,
  newCorrelationId,
  parseClientSecretResponse,
} from "@/lib/realtime-session";

function isNewKey(k: string) {
  return k.startsWith("sb_publishable_") || k.startsWith("sb_secret_");
}

type TalkSupabase = SupabaseClient<Database>;

export interface RealtimeDeps {
  /** Build a Supabase client scoped to the caller's bearer token. */
  supabaseFactory: (token: string) => TalkSupabase;
  /** fetch impl used to call OpenAI. Injectable for tests. */
  fetchImpl: typeof fetch;
}

function defaultSupabaseFactory(token: string): TalkSupabase {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (isNewKey(key) && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        h.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

const DEFAULT_DEPS: RealtimeDeps = {
  supabaseFactory: defaultSupabaseFactory,
  fetchImpl: (input, init) => fetch(input, init),
};

/**
 * Factory returning a Request→Response handler bound to explicit deps.
 * The route's server block calls the default-deps instance; tests call
 * this factory directly with injected mocks. This avoids any module-
 * global mutable state that could ship in the client bundle.
 */
export function createMintRealtimeSessionHandler(
  deps: RealtimeDeps = DEFAULT_DEPS,
): (request: Request) => Promise<Response> {
  return async function handleMintRealtimeSession(request: Request): Promise<Response> {
    const cid = newCorrelationId();

    // ---- 1. Bearer presence: 401 BEFORE any config disclosure -------------
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response("Unauthorized", { status: 401 });
    }
    const token = authHeader.slice(7).trim();
    if (!token) return new Response("Unauthorized", { status: 401 });

    // ---- 2. Bearer verification: still BEFORE config disclosure -----------
    const supabase = deps.supabaseFactory(token);
    const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userRes?.user) {
      return new Response("Unauthorized", { status: 401 });
    }
    const userId = userRes.user.id;

    // ---- 3. Config: only NOW may we reveal 503 unconfigured ---------------
    const openaiKey = process.env.OPENAI_API_KEY;
    const safetySalt = process.env.OPENAI_SAFETY_ID_SALT;
    if (!openaiKey) {
      return Response.json(
        { error: "voice_unavailable", message: "Voice is not configured." },
        { status: 503 },
      );
    }
    if (!safetySalt || safetySalt.length < 8) {
      console.error("[realtime] missing_safety_salt", { cid });
      return Response.json(
        { error: "voice_unavailable", message: "Voice is not configured." },
        { status: 503 },
      );
    }

    // Compute the safety id for the outbound OpenAI header ONLY. It is
    // never logged and never returned.
    let safetyId: string;
    try {
      safetyId = await computeSafetyIdentifier(userId, safetySalt);
    } catch {
      console.error("[realtime] safety_id_failed", { cid });
      return Response.json(
        { error: "voice_unavailable", message: "Voice is not configured." },
        { status: 503 },
      );
    }

    let bodyIn: { draftId?: string } = {};
    try {
      bodyIn = (await request.json()) as { draftId?: string };
    } catch {
      /* empty body allowed */
    }

    // ---- 4. Atomic distributed reservation -------------------------------
    const { data: reservationRaw, error: reservationError } = await (
      supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { code?: string | null } | null }>
    )("reserve_talk_session", {
      _draft_id: bodyIn.draftId ?? undefined,
      _model: REALTIME_MODEL,
    });
    if (reservationError) {
      console.error("[realtime] session_reserve_failed", {
        cid,
        code: reservationError.code ?? null,
      });
      return Response.json(
        { error: "voice_unavailable", message: "Voice is temporarily unavailable." },
        { status: 503 },
      );
    }
    const reservation = reservationRaw as {
      allowed?: boolean;
      reason?: string;
      session_id?: string;
    } | null;
    if (reservation?.allowed === false) {
      if (reservation.reason === "rate_limited") {
        return Response.json(
          {
            error: "rate_limited",
            message: "You've started a lot of voice sessions in the last hour. Try again in a bit.",
          },
          { status: 429 },
        );
      }
      return Response.json(
        { error: "too_many_concurrent", message: "You already have a voice session open." },
        { status: 429 },
      );
    }
    if (!reservation?.session_id) {
      console.error("[realtime] session_reserve_unparseable", { cid });
      return Response.json(
        { error: "voice_unavailable", message: "Voice is temporarily unavailable." },
        { status: 503 },
      );
    }
    const sessionId = reservation.session_id;

    // ---- 5. Mint the ephemeral client secret -----------------------------
    let openaiRes: Response;
    try {
      openaiRes = await deps.fetchImpl(REALTIME_CLIENT_SECRETS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Safety-Identifier": safetyId,
        },
        body: JSON.stringify(buildRealtimeSessionBody({ instructions: TALK_SYSTEM_PROMPT })),
      });
    } catch {
      console.error("[realtime] mint_fetch_failed", { cid });
      await closeReservedSession(supabase, sessionId, "mint_fetch_failed", cid);
      return Response.json(
        { error: "upstream_unreachable", message: "Voice service is unreachable." },
        { status: 502 },
      );
    }

    const openaiReqId =
      openaiRes.headers.get("x-request-id") ?? openaiRes.headers.get("openai-request-id") ?? null;

    if (!openaiRes.ok) {
      await openaiRes.text().catch(() => "");
      console.error("[realtime] mint_upstream_non_2xx", {
        cid,
        status: openaiRes.status,
        openaiReqId,
      });
      await closeReservedSession(supabase, sessionId, "mint_non_2xx", cid);
      return Response.json(
        { error: "upstream_error", message: "Voice service refused." },
        { status: 502 },
      );
    }

    const rawJson = await openaiRes.json().catch(() => null);
    const parsed = parseClientSecretResponse(rawJson);
    if (!parsed) {
      console.error("[realtime] mint_unparseable", { cid, openaiReqId });
      await closeReservedSession(supabase, sessionId, "mint_unparseable", cid);
      return Response.json(
        { error: "upstream_error", message: "Voice service returned an unexpected response." },
        { status: 502 },
      );
    }

    if (parsed.session?.model && parsed.session.model !== REALTIME_MODEL) {
      // Record the actual served model if OpenAI substituted one.
      await supabase
        .from("talk_sessions")
        .update({ model: parsed.session.model })
        .eq("id", sessionId)
        .eq("user_id", userId);
    }

    return Response.json({
      clientSecret: parsed.value,
      expiresAt: parsed.expires_at,
      model: parsed.session?.model ?? REALTIME_MODEL,
      sessionId,
      voice: REALTIME_VOICE,
    });
  };
}

async function closeReservedSession(
  supabase: TalkSupabase,
  sessionId: string,
  reason: string,
  cid: string,
) {
  try {
    const { error } = await supabase
      .from("talk_sessions")
      .update({ ended_at: new Date().toISOString(), disconnect_reason: reason })
      .eq("id", sessionId)
      .is("ended_at", null);
    if (error) {
      // Correlation-only. Stale cutoff will collect the row.
      console.error("[realtime] reservation_cleanup_failed", { cid, code: error.code ?? null });
    }
  } catch {
    console.error("[realtime] reservation_cleanup_threw", { cid });
  }
}

// Default handler used by the route in production.
const defaultHandler = createMintRealtimeSessionHandler();

/**
 * @deprecated Kept only so existing tests keep compiling. Prefer
 * `createMintRealtimeSessionHandler({ ... })` in new tests.
 */
export function handleMintRealtimeSession(request: Request): Promise<Response> {
  return defaultHandler(request);
}

export const Route = createFileRoute("/api/realtime/session")({
  server: {
    handlers: {
      POST: ({ request }) => defaultHandler(request),
    },
  },
});
