import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type PartyView = {
  name: string;
  date: string;
  start_time: string | null;
  location: string | null;
  occasion: string;
  theme_id: string | null;
  theme: string | null;
  guest_first_names: string[];
  yes_count: number;
  maybe_count: number;
  total_count: number;
};

export type RsvpLoaderData = {
  party: PartyView | null;
  origin: string;
};

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

export const getRsvpLoaderData = createServerFn({ method: "GET" })
  .inputValidator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<RsvpLoaderData> => {
    const req = getRequest();
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const host = req.headers.get("host") ?? "";
    const origin = host ? `${proto}://${host}` : "";

    const SUPABASE_URL = process.env.SUPABASE_URL!;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;

    const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(
            typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
          );
          if (init?.headers) {
            new Headers(init.headers).forEach((v, k) => headers.set(k, v));
          }
          if (
            isNewSupabaseApiKey(SUPABASE_PUBLISHABLE_KEY) &&
            headers.get("Authorization") === `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
          ) {
            headers.delete("Authorization");
          }
          headers.set("apikey", SUPABASE_PUBLISHABLE_KEY);
          return fetch(input, { ...init, headers });
        },
      },
    });

    // token param name matches the RPC signature
    const { data: partyData, error } = await supabase.rpc("get_rsvp_party", {
      token: data.token,
    });
    if (error || !partyData) return { party: null, origin };
    return { party: partyData as unknown as PartyView, origin };
  });
