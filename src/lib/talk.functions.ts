// Server functions for the Talk it out flow.
// Uses requireSupabaseAuth so RLS scopes every read/write to the caller.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { emptyDraftBody } from "./gathering-draft";

const endSessionInput = z.object({
  sessionId: z.string().uuid(),
  durationS: z.number().int().min(0).max(60 * 60).optional(),
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
        draft: emptyDraftBody() as unknown as Record<string, unknown>,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: data.id };
  });

/** Mark a talk_sessions row as ended (records duration + disconnect reason). */
export const endSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => endSessionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("talk_sessions")
      .update({
        ended_at: new Date().toISOString(),
        duration_s: data.durationS ?? null,
        disconnect_reason: data.disconnectReason ?? null,
      })
      .eq("id", data.sessionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Hard-delete a draft and its transcripts (retention control). */
export const deleteDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ draftId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("gathering_drafts")
      .delete()
      .eq("id", data.draftId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
