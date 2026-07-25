// Browser-side refetch of the token-scoped RSVP party projection.
// `get_rsvp_party` is granted to anon, so we can call it directly from the
// browser to update canonical yes/maybe counts and Bring Board state after
// any mutation (submit_rsvp / claim_bring_item / release_bring_item).

import { supabase } from "@/integrations/supabase/client";
import type { PartyView } from "./rsvp.functions";

export type RefetchResult = { ok: true; party: PartyView | null } | { ok: false; error: string };

export async function refetchRsvpParty(token: string): Promise<RefetchResult> {
  try {
    const { data, error } = await supabase.rpc("get_rsvp_party", { token });
    if (error) return { ok: false, error: "Couldn't refresh right now." };
    return { ok: true, party: (data as unknown as PartyView) ?? null };
  } catch {
    return { ok: false, error: "Network hiccup — try again." };
  }
}
