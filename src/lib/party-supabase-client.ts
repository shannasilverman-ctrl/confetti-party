// Real Supabase adapter for PartyStore. Kept in its own module so tests can
// swap in a fake without importing the browser Supabase client.

import { supabase } from "@/integrations/supabase/client";
import type { PartyClient, PartyRow, SaveError } from "./party-persistence";

function classify(err: { message?: string; code?: string } | null | undefined): SaveError {
  if (!err) return { message: "Unknown", kind: "unknown" };
  const msg = err.message ?? "Unknown error";
  if (/network|fetch|Failed to fetch|timeout/i.test(msg)) return { message: msg, kind: "network" };
  if (err.code === "42501" || /row-level security|permission/i.test(msg))
    return { message: msg, kind: "permission" };
  return { message: msg, kind: "unknown" };
}

export function makeSupabaseClient(): PartyClient {
  return {
    async insert(row) {
      const { data, error } = await supabase
        .from("parties")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(row as any)
        .select("*")
        .maybeSingle();
      if (error) return { data: null, error: classify(error) };
      return { data: (data as unknown as PartyRow) ?? null, error: null };
    },
    async updateWithConcurrency(id, patch, expectedUpdatedAt) {
      const { data, error } = await supabase
        .from("parties")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(patch as any)
        .eq("id", id)
        .eq("updated_at", expectedUpdatedAt)
        .select("*")
        .maybeSingle();
      if (error) return { data: null, error: classify(error), conflict: false };
      if (!data) return { data: null, error: null, conflict: true };
      return { data: data as unknown as PartyRow, error: null, conflict: false };
    },
    async fetch(id) {
      const { data, error } = await supabase
        .from("parties")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) return { data: null, error: classify(error) };
      return { data: (data as unknown as PartyRow) ?? null, error: null };
    },
  };
}
