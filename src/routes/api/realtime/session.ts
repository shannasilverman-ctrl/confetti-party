// POST /api/realtime/session — mints a short-lived OpenAI Realtime client
// secret for the browser. The long-lived OPENAI_API_KEY never leaves the server.
//
// Contract: uses the current /v1/realtime/client_secrets endpoint with the
// nested `session` schema and gpt-realtime-2.1 (docs current 2026-01). See
// OPENAI_REALTIME.md.
//
// Privacy invariants (enforced by tests):
//   * The Supabase user id is never logged, never returned to the browser,
//     never sent to OpenAI. Only a per-request `req_...` correlation id
//     and a salted `conf_...` safety identifier appear in logs.
//   * Raw OpenAI response bodies are never logged and never proxied to the
//     browser. Callers get a sanitized `error` code + friendly `message`.
//   * `OPENAI_SAFETY_ID_SALT` is required whenever `OPENAI_API_KEY` is
//     configured. Missing salt fails closed with 503.
//
// Fail-closed ordering:
//   1. Auth + config + rate/concurrency reads. Any Supabase read error →
//      503 (do NOT treat as zero recent sessions).
//   2. Insert a "pending" talk_sessions row. If insert fails → 503 and
//      the OpenAI mint is never called.
//   3. Mint the client secret. On upstream failure → mark the row ended
//      and return sanitized 502.
//   4. Return the secret only after the reserving row is durable.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { TALK_SYSTEM_PROMPT } from "@/lib/gathering-draft";
import {
  REALTIME_CLIENT_SECRETS_URL,
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

// Injection seams so route-level tests can substitute the Supabase client and
// OpenAI fetch without hitting the network. Production paths use the defaults.
export interface RealtimeDeps {
  supabaseFactory?: (token: string) => ReturnType<typeof createClient<Database>>;
  fetchImpl?: typeof fetch;
}

let overrides: RealtimeDeps = {};
export function __setRealtimeDepsForTests(next: RealtimeDeps) {
  overrides = next;
}
export function __resetRealtimeDepsForTests() {
  overrides = {};
}

function defaultSupabase(token: string) {
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

/**
 * Core handler. Exported so tests can call it directly with a mocked
 * `Request` and injected deps without spinning the TanStack server.
 */
export async function handleMintRealtimeSession(request: Request): Promise<Response> {
  const cid = newCorrelationId();
  const openaiKey = process.env.OPENAI_API_KEY;
  const safetySalt = process.env.OPENAI_SAFETY_ID_SALT;

  if (!openaiKey) {
    return Response.json(
      { error: "voice_unavailable", message: "Voice is not configured." },
      { status: 503 },
    );
  }
  // Salt is mandatory when the key is present. Fail closed rather than
  // hash an unsalted user id.
  if (!safetySalt || safetySalt.length < 8) {
    console.error("[realtime] missing_safety_salt", { cid });
    return Response.json(
      { error: "voice_unavailable", message: "Voice is not configured." },
      { status: 503 },
    );
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }
  const token = authHeader.slice(7);

  const supabase = (overrides.supabaseFactory ?? defaultSupabase)(token);

  const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userRes?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = userRes.user.id;

  // Compute the correlation-only safety id up-front so we can tag logs
  // without ever emitting the raw user id.
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

  // Rate limit: 5 mints/hour, 2 concurrent (Phase 1 contract).
  // Concurrency ignores rows older than REALTIME_SESSION_STALE_MS so a
  // crashed / abandoned client can't lock a user out forever.
  const oneHourAgoISO = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const staleCutoffISO = new Date(Date.now() - REALTIME_SESSION_STALE_MS).toISOString();

  const { data: recent, error: recentErr } = await supabase
    .from("talk_sessions")
    .select("id, ended_at, started_at")
    .eq("user_id", userId)
    .gte("started_at", oneHourAgoISO);

  if (recentErr) {
    // Fail closed — do not treat a DB read failure as "zero sessions".
    console.error("[realtime] rate_lookup_failed", { cid, safetyId, code: recentErr.code ?? null });
    return Response.json(
      { error: "voice_unavailable", message: "Voice is temporarily unavailable." },
      { status: 503 },
    );
  }

  if ((recent?.length ?? 0) >= 5) {
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
  if (concurrent >= 2) {
    return Response.json(
      { error: "too_many_concurrent", message: "You already have a voice session open." },
      { status: 429 },
    );
  }

  let bodyIn: { draftId?: string } = {};
  try {
    bodyIn = (await request.json()) as { draftId?: string };
  } catch {
    // empty body is fine
  }

  // Step 2: reserve a session row BEFORE minting. If this insert fails,
  // we never call OpenAI, so we never hand out an untracked secret.
  const { data: sessionRow, error: sessionErr } = await supabase
    .from("talk_sessions")
    .insert({
      user_id: userId,
      draft_id: bodyIn.draftId ?? null,
      model: null,
    })
    .select("id")
    .single();

  if (sessionErr || !sessionRow?.id) {
    console.error("[realtime] session_reserve_failed", {
      cid,
      safetyId,
      code: sessionErr?.code ?? null,
    });
    return Response.json(
      { error: "voice_unavailable", message: "Voice is temporarily unavailable." },
      { status: 503 },
    );
  }
  const sessionId = sessionRow.id;

  const mintFetch = overrides.fetchImpl ?? fetch;

  // Step 3: mint the ephemeral client secret.
  let openaiRes: Response;
  try {
    openaiRes = await mintFetch(REALTIME_CLIENT_SECRETS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
        "OpenAI-Safety-Identifier": safetyId,
      },
      body: JSON.stringify(buildRealtimeSessionBody({ instructions: TALK_SYSTEM_PROMPT })),
    });
  } catch {
    console.error("[realtime] mint_fetch_failed", { cid, safetyId });
    await closeReservedSession(supabase, sessionId, "mint_fetch_failed");
    return Response.json(
      { error: "upstream_unreachable", message: "Voice service is unreachable." },
      { status: 502 },
    );
  }

  // Capture the OpenAI request id if the header exists — safe to log.
  const openaiReqId =
    openaiRes.headers.get("x-request-id") ?? openaiRes.headers.get("openai-request-id") ?? null;

  if (!openaiRes.ok) {
    // Do NOT log or return the raw body.
    // Consume-and-discard so the connection can be released.
    await openaiRes.text().catch(() => "");
    console.error("[realtime] mint_upstream_non_2xx", {
      cid,
      safetyId,
      status: openaiRes.status,
      openaiReqId,
    });
    await closeReservedSession(supabase, sessionId, "mint_non_2xx");
    return Response.json(
      { error: "upstream_error", message: "Voice service refused." },
      { status: 502 },
    );
  }

  const rawJson = await openaiRes.json().catch(() => null);
  const parsed = parseClientSecretResponse(rawJson);
  if (!parsed) {
    console.error("[realtime] mint_unparseable", { cid, safetyId, openaiReqId });
    await closeReservedSession(supabase, sessionId, "mint_unparseable");
    return Response.json(
      { error: "upstream_error", message: "Voice service returned an unexpected response." },
      { status: 502 },
    );
  }

  // Best-effort: record the model on the reserved row. Not fatal.
  if (parsed.session?.model) {
    await supabase
      .from("talk_sessions")
      .update({ model: parsed.session.model })
      .eq("id", sessionId);
  }

  return Response.json({
    clientSecret: parsed.value,
    expiresAt: parsed.expires_at,
    model: parsed.session?.model ?? null,
    sessionId,
    voice: REALTIME_VOICE,
  });
}

async function closeReservedSession(
  supabase: ReturnType<typeof createClient<Database>>,
  sessionId: string,
  reason: string,
) {
  try {
    await supabase
      .from("talk_sessions")
      .update({ ended_at: new Date().toISOString(), disconnect_reason: reason })
      .eq("id", sessionId);
  } catch {
    /* nothing we can do; the stale-cutoff will collect it. */
  }
}

export const Route = createFileRoute("/api/realtime/session")({
  server: {
    handlers: {
      POST: ({ request }) => handleMintRealtimeSession(request),
    },
  },
});
