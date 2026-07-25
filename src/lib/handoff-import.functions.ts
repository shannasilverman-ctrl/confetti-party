// Server functions to support signup-continuity: importing a signed-out
// Talk handoff into an authenticated gathering_drafts row idempotently.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { emptyDraftBody } from "./gathering-draft";
import { DraftPatchZ } from "./talk-schemas";

const importInput = z.object({
  idempotencyKey: z.string().uuid(),
  summary: z.string().max(500).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().max(4000),
      }),
    )
    .max(60)
    .default([]),
  patch: DraftPatchZ.default({}),
});

/**
 * Import a signed-out Talk handoff into an authenticated draft.
 *
 * Idempotent: `import_idempotency_key` has a partial unique index scoped
 * to `user_id`. A repeat call (refresh, double-click, retry) reuses the
 * existing row. The returned `{ id, alreadyImported }` lets the client
 * clear local state only after a canonical server success.
 *
 * We never trust caller-supplied ownership fields — user_id is derived
 * from the authenticated context.
 */
export const importHandoffDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => importInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1) Fast path: does a row for this idempotency key already exist?
    const existing = await supabase
      .from("gathering_drafts")
      .select("id")
      .eq("user_id", userId)
      .eq("import_idempotency_key", data.idempotencyKey)
      .maybeSingle();
    if (existing.error) {
      console.error("[handoff] lookup_failed", { code: existing.error.code ?? null });
      throw new Error("import_failed");
    }
    if (existing.data?.id) {
      return { id: existing.data.id, alreadyImported: true };
    }

    // 2) Insert a new draft carrying the imported patch as the initial
    //    draft body (safe, structural JSON only — no messages persisted
    //    on the draft row; transcripts follow the existing retention flow).
    const body = emptyDraftBody();
    // Best-effort overlay of patch onto the empty structural body — we do
    // not deep-merge every field, we just stash the patch under a scoped
    // key so the Talk brain can re-seed its next turn.
    const draftJson = JSON.parse(
      JSON.stringify({ ...body, importedPatch: data.patch, importedSummary: data.summary ?? "" }),
    );

    const inserted = await supabase
      .from("gathering_drafts")
      .insert({
        user_id: userId,
        draft: draftJson,
        import_idempotency_key: data.idempotencyKey,
      })
      .select("id")
      .single();

    if (inserted.error) {
      // Unique-violation race: another concurrent call won. Look it up.
      const race = await supabase
        .from("gathering_drafts")
        .select("id")
        .eq("user_id", userId)
        .eq("import_idempotency_key", data.idempotencyKey)
        .maybeSingle();
      if (race.data?.id) return { id: race.data.id, alreadyImported: true };
      console.error("[handoff] insert_failed", { code: inserted.error.code ?? null });
      throw new Error("import_failed");
    }
    return { id: inserted.data.id, alreadyImported: false };
  });
