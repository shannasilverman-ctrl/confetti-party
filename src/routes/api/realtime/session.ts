// POST /api/realtime/session — mints a short-lived OpenAI Realtime client
// secret for the browser. The long-lived OPENAI_API_KEY never leaves the server.
//
// Auth: requires a Supabase bearer token. Anonymous callers get 401.
// Rate limit: max 5 mints/hour and 2 concurrent sessions per user (tracked in talk_sessions).

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { TALK_SYSTEM_PROMPT } from "@/lib/gathering-draft";

const REALTIME_MODEL = "gpt-4o-realtime-preview-2024-12-17";
const VOICE = "alloy";

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
        // Prefer the user's JWT for RLS.
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

        // Rate limit: 5 mints/hour, 2 concurrent
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: recent } = await supabase
          .from("talk_sessions")
          .select("id, ended_at")
          .eq("user_id", userId)
          .gte("started_at", oneHourAgo);
        if ((recent?.length ?? 0) >= 5) {
          return Response.json(
            { error: "rate_limited", message: "You've started a lot of voice sessions in the last hour. Try again in a bit." },
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

        // Mint ephemeral client secret from OpenAI Realtime.
        let openaiRes: Response;
        try {
          openaiRes = await fetch("https://api.openai.com/v1/realtime/sessions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openaiKey}`,
              "Content-Type": "application/json",
              "OpenAI-Beta": "realtime=v1",
            },
            body: JSON.stringify({
              model: REALTIME_MODEL,
              voice: VOICE,
              modalities: ["audio", "text"],
              instructions: TALK_SYSTEM_PROMPT,
              turn_detection: {
                type: "server_vad",
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 500,
                create_response: true,
                interrupt_response: true,
              },
              input_audio_transcription: { model: "whisper-1" },
              max_response_output_tokens: 512,
            }),
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
          console.error("[realtime] mint failed", { userId, status: openaiRes.status, body: text.slice(0, 500) });
          return Response.json(
            { error: "upstream_error", status: openaiRes.status, message: "Voice service refused." },
            { status: 502 },
          );
        }

        const sessionData = (await openaiRes.json()) as {
          id: string;
          model: string;
          client_secret: { value: string; expires_at: number };
        };

        // Record the session (owner-scoped).
        const { data: sessionRow, error: sessionErr } = await supabase
          .from("talk_sessions")
          .insert({
            user_id: userId,
            draft_id: body.draftId ?? null,
            model: sessionData.model,
          })
          .select("id")
          .single();

        if (sessionErr) {
          console.error("[realtime] session row insert failed", { userId, err: sessionErr.message });
          // Non-fatal — we can still return the client secret. Cost tracking will be missing.
        }

        return Response.json({
          clientSecret: sessionData.client_secret.value,
          expiresAt: sessionData.client_secret.expires_at,
          model: sessionData.model,
          sessionId: sessionRow?.id ?? null,
          voice: VOICE,
        });
      },
    },
  },
});
