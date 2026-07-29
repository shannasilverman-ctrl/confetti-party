// Account lifecycle server functions: export-my-data and delete-my-account.
// Both act as the signed-in user (RLS scoped) via requireSupabaseAuth. We
// deliberately never load supabaseAdmin here — no service role, no
// bypass of RLS, no chance of touching another user's rows.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Bumped whenever the shape of the export payload changes. */
export const EXPORT_SCHEMA_VERSION = 2 as const;

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
  membershipCount: number;
  draftCount: number;
  sessionCount: number;
  transcriptCount: number;
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
  .handler(async ({ context }): Promise<AccountExportEnvelope> => {
    const { supabase, userId, claims } = context;

    // Fetch in parallel; each query is RLS-scoped to auth.uid().
    const [parties, memberships, drafts, sessions, transcripts] = await Promise.all([
      supabase.from("parties").select("*").eq("user_id", userId),
      supabase
        .from("party_memberships")
        .select("party_id,user_id,role,display_name,created_at,joined_at")
        .eq("user_id", userId),
      supabase.from("gathering_drafts").select("*").eq("user_id", userId),
      supabase
        .from("talk_sessions")
        // Metadata only; transcript rows are excluded by design. Uses the
        // actual column set present on the table (no updated_at/status).
        .select("id,draft_id,created_at,started_at,ended_at,duration_s,disconnect_reason")
        .eq("user_id", userId),
      // Normally empty because the beta defaults to summary-only retention,
      // but include every caller-owned row if full retention was ever used.
      supabase.from("talk_transcripts").select("*").eq("user_id", userId),
    ]);

    if (parties.error || memberships.error || drafts.error || sessions.error || transcripts.error) {
      // Never leak DB error text to the caller.
      console.error("[export] db_failure", {
        parties: parties.error?.code ?? null,
        memberships: memberships.error?.code ?? null,
        drafts: drafts.error?.code ?? null,
        sessions: sessions.error?.code ?? null,
        transcripts: transcripts.error?.code ?? null,
      });
      throw new Error("export_failed");
    }

    const email = typeof claims?.email === "string" ? claims.email : null;

    const cleanedParties = (parties.data ?? []).map((row) =>
      stripPartyClaimSecrets(row as Record<string, unknown>),
    );
    const draftRows = drafts.data ?? [];
    const membershipRows = memberships.data ?? [];
    const sessionRows = sessions.data ?? [];
    const transcriptRows = transcripts.data ?? [];

    const generatedAt = new Date().toISOString();
    const doc = {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      generatedAt,
      userId,
      email,
      source: {
        description:
          "Rows the signed-in user owns, plus their own party-membership records, fetched with row-level security. Other collaborators' membership records are excluded.",
        tables: [
          "public.parties (full row — includes embedded guest names, dietary, allergens, bring board, host updates)",
          "public.party_memberships (only the signed-in user's own role records)",
          "public.gathering_drafts (full row — voice/text intake draft state)",
          "public.talk_sessions (metadata only — no transcripts)",
          "public.talk_transcripts (caller-owned rows, when full transcript retention was enabled)",
        ],
        excluded: [
          "auth passwords / tokens / session cookies",
          "claim secrets stored inside bring board items",
          "service / operational logs",
          "any row owned by another user",
        ],
      },
      parties: cleanedParties,
      partyMemberships: membershipRows,
      gatheringDrafts: draftRows,
      talkSessions: sessionRows,
      talkTranscripts: transcriptRows,
    };

    return {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      generatedAt,
      userId,
      email,
      partyCount: cleanedParties.length,
      membershipCount: membershipRows.length,
      draftCount: draftRows.length,
      sessionCount: sessionRows.length,
      transcriptCount: transcriptRows.length,
      json: JSON.stringify(doc, null, 2),
    };
  });

/**
 * Strips server-issued claim secrets from a party's bring_board before
 * export. Claim secrets let a guest release an item; they're the guest's
 * private token, not export material for the host.
 */
export function stripPartyClaimSecrets(party: Record<string, unknown>): Record<string, unknown> {
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
  .handler(
    async ({
      context,
    }): Promise<{ ok: true } | { ok: false; reason: "reauth" | "shared_parties" }> => {
      const { supabase } = context;
      const { data, error } = await supabase.rpc("delete_own_account");
      if (error) {
        const msg = String(error.message ?? "").toLowerCase();
        if (msg.includes("reauth")) return { ok: false, reason: "reauth" };
        if (msg.includes("shared parties require transfer"))
          return { ok: false, reason: "shared_parties" };
        console.error("[delete_account] rpc_failed", { code: error.code ?? null });
        throw new Error("delete_failed");
      }
      // Generic success — never echo raw RPC payload.
      void data;
      return { ok: true };
    },
  );
