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
//   4. Rate + concurrency read         → 503 on DB error, 429 on limits
//   5. Reserve talk_sessions row       → 503 on insert failure
//   6. Recount to detect single-node   → 429 + rollback if exceeded
//      races that TOCTOU-slipped past  → race is single-node only; see
//                                        RESIDUAL DISTRIBUTED RACE below
//   7. Mint client secret              → 502 on upstream failure
//                                        (reservation is closed and the
//                                        cleanup itself never leaks)
//
// RESIDUAL DISTRIBUTED RACE — voice not production-ready:
//   The 2-concurrent / 5-hour limits are enforced by an in-process
//   per-user mutex plus a post-insert recount. That guarantees single-
//   node atomicity. Two Worker isolates running the mint at the same
//   moment on different edges can each pass their own recount and admit
//   a 3rd concurrent session. A true fix requires either a Postgres
//   unique partial index / advisory lock RPC (schema change) or a
//   dedicated reservation table. Publishing voice as a rate-limited
//   production feature is BLOCKED until that lands.

import { createFileRoute } from "@tanstack/react-router";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { TALK_SYSTEM_PROMPT } from "@/lib/gathering-draft";
import {
  REALTIME_CLIENT_SECRETS_URL,
  REALTIME_MODEL,
  REALTIME_SESSION_STALE_MS,
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

// ---- In-process per-user serialization -------------------------------------
// Serializes SELECT-then-INSERT reservations on the same node so a single
// isolate cannot admit more than the allowed concurrent count for one user.
// Cross-node distributed race remains (documented above as a release blocker).
const userMutex = new Map<string, Promise<unknown>>();
function withUserMutex<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const prev = userMutex.get(userId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  userMutex.set(
    userId,
    next.finally(() => {
      if (userMutex.get(userId) === next) userMutex.delete(userId);
    }),
  );
  return next;
}

const CONCURRENCY_LIMIT = 2;
const HOURLY_LIMIT = 5;

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

    // ---- 4-6. Reservation, serialized per user on this node --------------
    return withUserMutex(userId, async () => {
      const oneHourAgoISO = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const staleCutoffISO = new Date(Date.now() - REALTIME_SESSION_STALE_MS).toISOString();

      const { data: recent, error: recentErr } = await supabase
        .from("talk_sessions")
        .select("id, ended_at, started_at")
        .eq("user_id", userId)
        .gte("started_at", oneHourAgoISO);

      if (recentErr) {
        console.error("[realtime] rate_lookup_failed", {
          cid,
          code: recentErr.code ?? null,
        });
        return Response.json(
          { error: "voice_unavailable", message: "Voice is temporarily unavailable." },
          { status: 503 },
        );
      }

      if ((recent?.length ?? 0) >= HOURLY_LIMIT) {
        return Response.json(
          {
            error: "rate_limited",
            message: "You've started a lot of voice sessions in the last hour. Try again in a bit.",
          },
          { status: 429 },
        );
      }
      const concurrent = (recent ?? []).filter(
        (r) => !r.ended_at && r.started_at >= staleCutoffISO,
      ).length;
      if (concurrent >= CONCURRENCY_LIMIT) {
        return Response.json(
          { error: "too_many_concurrent", message: "You already have a voice session open." },
          { status: 429 },
        );
      }

      // Reserve BEFORE minting. Insert the intended model so the DB row is
      // meaningful even if the OpenAI response is missing session.model.
      const { data: sessionRow, error: sessionErr } = await supabase
        .from("talk_sessions")
        .insert({
          user_id: userId,
          draft_id: bodyIn.draftId ?? null,
          model: REALTIME_MODEL,
        })
        .select("id")
        .single();

      if (sessionErr || !sessionRow?.id) {
        console.error("[realtime] session_reserve_failed", {
          cid,
          code: sessionErr?.code ?? null,
        });
        return Response.json(
          { error: "voice_unavailable", message: "Voice is temporarily unavailable." },
          { status: 503 },
        );
      }
      const sessionId = sessionRow.id;

      // Recount AFTER insert to catch single-node races that raced past the
      // pre-check. If we overshot, close our own reservation and 429.
      const { data: postRecent } = await supabase
        .from("talk_sessions")
        .select("id, ended_at, started_at")
        .eq("user_id", userId)
        .gte("started_at", oneHourAgoISO);
      const postConcurrent = (postRecent ?? []).filter(
        (r) => !r.ended_at && r.started_at >= staleCutoffISO,
      ).length;
      if (postConcurrent > CONCURRENCY_LIMIT) {
        await closeReservedSession(supabase, sessionId, "recount_overshoot", cid);
        return Response.json(
          { error: "too_many_concurrent", message: "You already have a voice session open." },
          { status: 429 },
        );
      }

      // ---- 7. Mint the ephemeral client secret ----------------------------
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
