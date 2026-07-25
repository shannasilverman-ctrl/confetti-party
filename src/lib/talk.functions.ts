// Server functions for the Talk it out flow.
// Uses requireSupabaseAuth so RLS scopes every read/write to the caller.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { emptyDraftBody } from "./gathering-draft";

const endSessionInput = z.object({
  sessionId: z.string().uuid(),
  durationS: z
    .number()
    .int()
    .min(0)
    .max(60 * 60)
    .optional(),
  disconnectReason: z.string().max(120).optional(),
});

/** Create a new gathering_drafts row for the current user. */
export const createDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("gathering_drafts")
      .insert({
        user_id: userId,
        // Draft body is a nested plain-JSON object — safe cast for the typed client.
        draft: JSON.parse(JSON.stringify(emptyDraftBody())),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: data.id };
  });

/**
 * Pure helper for ending a talk_sessions row. Extracted so route/end tests
 * can drive it with an injectable Supabase mock.
 *
 * Ownership + idempotency invariants (enforced by tests):
 *   * The UPDATE filters by BOTH `id` AND `user_id` so we never rely on
 *     RLS alone to reject a spoofed session id from another user.
 *   * The `.is("ended_at", null)` filter makes a second call a true no-op:
 *     ended_at, duration_s, and disconnect_reason are never rewritten.
 */
export async function performEndSession(
  supabase: {
    from: (t: string) => {
      update: (patch: Record<string, unknown>) => {
        eq: (
          c: string,
          v: string,
        ) => {
          eq: (
            c: string,
            v: string,
          ) => {
            is: (
              c: string,
              v: null,
            ) => {
              select: (cols: string) => Promise<{
                data: Array<{ id: string }> | null;
                error: { message: string; code?: string } | null;
              }>;
            };
          };
        };
      };
    };
  },
  userId: string,
  input: { sessionId: string; durationS?: number; disconnectReason?: string },
): Promise<{ ok: true; changed: boolean }> {
  const { data, error } = await supabase
    .from("talk_sessions")
    .update({
      ended_at: new Date().toISOString(),
      duration_s: input.durationS ?? null,
      disconnect_reason: input.disconnectReason ?? null,
    })
    .eq("id", input.sessionId)
    .eq("user_id", userId)
    .is("ended_at", null)
    .select("id");
  if (error) {
    // Correlation-only log: never include userId, sessionId, or the raw
    // Postgres message (which can echo caller input).
    console.error("[talk] end_session_failed", { code: error.code ?? null });
    throw new Error("end_session_failed");
  }
  return { ok: true, changed: (data?.length ?? 0) > 0 };
}

/** Mark a talk_sessions row as ended (records duration + disconnect reason). */
export const endSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => endSessionInput.parse(input))
  .handler(async ({ data, context }) => {
    return performEndSession(
      context.supabase as unknown as Parameters<typeof performEndSession>[0],
      context.userId,
      data,
    );
  });

/** Hard-delete a draft and its transcripts (retention control). */
export const deleteDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ draftId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("gathering_drafts").delete().eq("id", data.draftId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
