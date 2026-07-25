// Account lifecycle server functions: export-my-data and delete-my-account.
// Both act as the signed-in user (RLS scoped) via requireSupabaseAuth. We
// deliberately never load supabaseAdmin here — no service role, no
// bypass of RLS, no chance of touching another user's rows.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Bumped whenever the shape of the export payload changes. */
export const EXPORT_SCHEMA_VERSION = 1 as const;

/**
 * The export is returned as a pre-serialized JSON string so the transport
 * layer never has to reason about arbitrary `unknown` shapes. The client
 * parses it once for the summary view and writes it verbatim to disk.
 */
export type AccountExportEnvelope = {
  schemaVersion: typeof EXPORT_SCHEMA_VERSION;
  generatedAt: string;
  userId: string;
  email: string | null;
  partyCount: number;
  draftCount: number;
  sessionCount: number;
  /** Full JSON string — the content of the downloadable file. */
  json: string;
};

/**
 * Fetches every row RLS grants the caller across public.parties,
 * public.gathering_drafts, and public.talk_sessions (session metadata
 * only, no raw transcripts). Never uses the service role; never touches
 * auth.users columns beyond the caller's own email.
 *
 * Guest names/dietary/allergen data live inside `parties.guests` /
 * `parties.bring_board` JSONB — those are part of the party the user
 * owns and are intentionally included so hosts can export what they've
 * captured about their gatherings. Nothing about other users is
 * reachable through RLS.
 */
export const exportMyData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccountExport> => {
    const { supabase, userId, claims } = context;

    // Fetch in parallel; each query is RLS-scoped to auth.uid().
    const [parties, drafts, sessions] = await Promise.all([
      supabase.from("parties").select("*").eq("user_id", userId),
      supabase.from("gathering_drafts").select("*").eq("user_id", userId),
      supabase
        .from("talk_sessions")
        // Metadata only; transcript rows are excluded by design.
        .select("id,draft_id,created_at,updated_at,status,duration_seconds")
        .eq("user_id", userId),
    ]);

    if (parties.error || drafts.error || sessions.error) {
      // Never leak DB error text to the caller.
      console.error("[export] db_failure", {
        parties: parties.error?.code ?? null,
        drafts: drafts.error?.code ?? null,
        sessions: sessions.error?.code ?? null,
      });
      throw new Error("export_failed");
    }

    const email = typeof claims?.email === "string" ? claims.email : null;

    return {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      userId,
      email,
      source: {
        description:
          "All rows the signed-in user owns in Confetti's application database, fetched with row-level security scoped to their user id. No other user's data is included.",
        tables: [
          "public.parties (full row — includes embedded guest names, dietary, allergens, bring board, host updates)",
          "public.gathering_drafts (full row — voice/text intake draft state)",
          "public.talk_sessions (metadata only — no transcripts)",
        ],
        excluded: [
          "auth passwords / tokens / session cookies",
          "claim secrets stored inside bring board items",
          "public.talk_transcripts raw content",
          "service / operational logs",
          "any row owned by another user",
        ],
      },
      parties: (parties.data ?? []).map(stripPartyClaimSecrets),
      gatheringDrafts: drafts.data ?? [],
      talkSessions: sessions.data ?? [],
    };
  });

/**
 * Strips server-issued claim secrets from a party's bring_board before
 * export. Claim secrets let a guest release an item; they're the guest's
 * private token, not export material for the host.
 */
function stripPartyClaimSecrets(party: Record<string, unknown>): Record<string, unknown> {
  const bring = party.bring_board;
  if (!Array.isArray(bring)) return party;
  const cleaned = bring.map((item) => {
    if (!item || typeof item !== "object") return item;
    const { claimSecret: _drop, ...rest } = item as Record<string, unknown>;
    return rest;
  });
  return { ...party, bring_board: cleaned };
}

/**
 * Deletes the caller's account via the SECURITY DEFINER RPC. The RPC
 * deletes the auth.users row; ON DELETE CASCADE removes all owned
 * public rows transactionally. Returns a generic ok/reauth signal.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true } | { ok: false; reason: "reauth" }> => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("delete_own_account");
    if (error) {
      const msg = String(error.message ?? "").toLowerCase();
      if (msg.includes("reauth")) return { ok: false, reason: "reauth" };
      console.error("[delete_account] rpc_failed", { code: error.code ?? null });
      throw new Error("delete_failed");
    }
    // Generic success — never echo raw RPC payload.
    void data;
    return { ok: true };
  });
