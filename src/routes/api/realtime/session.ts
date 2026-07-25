// POST /api/realtime/session — mints a short-lived OpenAI Realtime client
// secret for the browser. The long-lived OPENAI_API_KEY never leaves the server.
//
// Auth: requires a Supabase bearer token. Anonymous callers get 401.
// Rate limit: max 5 mints/hour and 2 concurrent sessions per user (tracked in talk_sessions).
//
// Contract: uses the current /v1/realtime/client_secrets endpoint with the
// nested `session` schema and gpt-realtime-2.1. See OPENAI_REALTIME.md.

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { TALK_SYSTEM_PROMPT } from "@/lib/gathering-draft";
import {
  REALTIME_CLIENT_SECRETS_URL,
  REALTIME_VOICE,
  buildRealtimeSessionBody,
  computeSafetyIdentifier,
  parseClientSecretResponse,
} from "@/lib/realtime-session";

function isNewKey(k: string) {
  return k.startsWith("sb_publishable_") || k.startsWith("sb_secret_");
}

function supabaseWithToken(token: string) {
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

export const Route = createFileRoute("/api/realtime/session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) {
          return Response.json(
            { error: "voice_unavailable", message: "Voice is not configured." },
            { status: 503 },
          );
        }

        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = authHeader.slice("Bearer ".length);

        const supabase = supabaseWithToken(token);
        const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userRes?.user) {
          return new Response("Unauthorized", { status: 401 });
        }
        const userId = userRes.user.id;

        // Rate limit: 5 mints/hour, 2 concurrent (preserved from Phase 1).
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: recent } = await supabase
          .from("talk_sessions")
          .select("id, ended_at")
          .eq("user_id", userId)
          .gte("started_at", oneHourAgo);
        if ((recent?.length ?? 0) >= 5) {
          return Response.json(
            {
              error: "rate_limited",
              message:
                "You've started a lot of voice sessions in the last hour. Try again in a bit.",
            },
            { status: 429 },
          );
        }
        const concurrent = (recent ?? []).filter((r) => !r.ended_at).length;
        if (concurrent >= 2) {
          return Response.json(
            { error: "too_many_concurrent", message: "You already have a voice session open." },
            { status: 429 },
          );
        }

        let body: { draftId?: string } = {};
        try {
          body = (await request.json()) as { draftId?: string };
        } catch {
          // empty body is fine
        }

        const safetyId = await computeSafetyIdentifier(
          userId,
          process.env.OPENAI_SAFETY_ID_SALT ?? null,
        );

        // Mint ephemeral client secret from OpenAI Realtime.
        let openaiRes: Response;
        try {
          openaiRes = await fetch(REALTIME_CLIENT_SECRETS_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openaiKey}`,
              "Content-Type": "application/json",
              "OpenAI-Safety-Identifier": safetyId,
            },
            body: JSON.stringify(
              buildRealtimeSessionBody({ instructions: TALK_SYSTEM_PROMPT }),
            ),
          });
        } catch (err) {
          console.error("[realtime] mint fetch failed", { userId, err: (err as Error).message });
          return Response.json(
            { error: "upstream_unreachable", message: "Voice service is unreachable." },
            { status: 502 },
          );
        }

        if (!openaiRes.ok) {
          const text = await openaiRes.text().catch(() => "");
          console.error("[realtime] mint failed", {
            userId,
            status: openaiRes.status,
            body: text.slice(0, 500),
          });
          return Response.json(
            {
              error: "upstream_error",
              status: openaiRes.status,
              message: "Voice service refused.",
            },
            { status: 502 },
          );
        }

        const parsed = parseClientSecretResponse(await openaiRes.json().catch(() => null));
        if (!parsed) {
          console.error("[realtime] mint returned unexpected shape", { userId });
          return Response.json(
            { error: "upstream_error", message: "Voice service returned an unexpected response." },
            { status: 502 },
          );
        }

        // Record the session (owner-scoped).
        const { data: sessionRow, error: sessionErr } = await supabase
          .from("talk_sessions")
          .insert({
            user_id: userId,
            draft_id: body.draftId ?? null,
            model: parsed.session?.model ?? null,
          })
          .select("id")
          .single();

        if (sessionErr) {
          console.error("[realtime] session row insert failed", {
            userId,
            err: sessionErr.message,
          });
          // Non-fatal — we can still return the client secret.
        }

        return Response.json({
          clientSecret: parsed.value,
          expiresAt: parsed.expires_at,
          model: parsed.session?.model ?? null,
          sessionId: sessionRow?.id ?? null,
          voice: REALTIME_VOICE,
        });
      },
    },
  },
});
