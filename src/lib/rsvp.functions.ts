import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type PublicBringItem = {
  id: string;
  category: string;
  label: string;
  qty: number;
  unit?: string | null;
  status: "open" | "claimed" | "done";
};

export type PublicPhotoDrop = {
  provider: string;
  label?: string;
  url: string;
  notes?: string;
} | null;

export type HostUpdateView = { id: string; text: string; at: string };

export type PartyView = {
  name: string;
  date: string;
  start_time: string | null;
  location: string | null;
  occasion: string;
  theme_id: string | null;
  theme: string | null;
  host_note: string | null;
  holiday_pack_id: string | null;
  host_updates: HostUpdateView[];
  bring_board: PublicBringItem[];
  photo_drop: PublicPhotoDrop;
  yes_count: number;
  maybe_count: number;
  total_count: number;
};

/**
 * Discriminated result so the route can render the right sanitized UI:
 *   - "ok"                     → party found
 *   - "not_found"              → RPC succeeded, no party for that token
 *   - "temporarily_unavailable" → missing server config, upstream/RPC/network error
 * Both non-ok branches carry no raw error details.
 */
export type RsvpLoaderData = {
  party: PartyView | null;
  status: "ok" | "not_found" | "temporarily_unavailable";
  origin: string;
};

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function readOrigin(): string {
  try {
    const req = getRequest();
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const host = req.headers.get("host") ?? "";
    return host ? `${proto}://${host}` : "";
  } catch {
    return "";
  }
}

/** Pure helper — extracted so it can be unit-tested with an injected supabase client. */
export async function resolveRsvpLoaderData(
  token: string | undefined,
  deps: {
    origin: string;
    supabaseUrl: string | undefined;
    supabaseKey: string | undefined;
    rpc?: (t: string) => Promise<{ data: unknown; error: unknown }>;
  },
): Promise<RsvpLoaderData> {
  const { origin, supabaseUrl, supabaseKey } = deps;

  // A malformed / missing token is a client-side "not found", not an outage.
  // Guard obviously-malformed tokens *before* checking server config so the
  // "invite link doesn't look right" copy stays deterministic even when the
  // Worker has no Supabase secrets (e.g. CI without env). Tokens are UUIDs.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!token || !UUID_RE.test(token)) {
    return { party: null, status: "not_found", origin };
  }

  // Missing server configuration is an outage, not a bad link.
  if (!supabaseUrl || !supabaseKey) {
    return { party: null, status: "temporarily_unavailable", origin };
  }

  const rpc =
    deps.rpc ??
    (async (t: string) => {
      const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
        auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (input, init) => {
            const headers = new Headers(
              typeof Request !== "undefined" && input instanceof Request
                ? input.headers
                : undefined,
            );
            if (init?.headers) {
              new Headers(init.headers).forEach((v, k) => headers.set(k, v));
            }
            if (
              isNewSupabaseApiKey(supabaseKey) &&
              headers.get("Authorization") === `Bearer ${supabaseKey}`
            ) {
              headers.delete("Authorization");
            }
            headers.set("apikey", supabaseKey);
            return fetch(input, { ...init, headers });
          },
        },
      });
      return await supabase.rpc("get_rsvp_party", { token: t });
    });

  try {
    const { data: partyData, error } = await rpc(token);
    if (error) {
      // RPC returned a transport/permission error — treat as outage.
      return { party: null, status: "temporarily_unavailable", origin };
    }
    if (!partyData) {
      // RPC succeeded with no party — genuine not-found.
      return { party: null, status: "not_found", origin };
    }
    return { party: partyData as unknown as PartyView, status: "ok", origin };
  } catch {
    // Network / thrown error — outage, never a bad link.
    return { party: null, status: "temporarily_unavailable", origin };
  }
}

export const getRsvpLoaderData = createServerFn({ method: "GET" })
  .inputValidator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<RsvpLoaderData> => {
    // Never let this handler throw — the RSVP route renders a sanitized
    // UI at HTTP 200 for any non-ok state. Raw errors must not reach the client.
    return resolveRsvpLoaderData(data?.token, {
      origin: readOrigin(),
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    });
  });
