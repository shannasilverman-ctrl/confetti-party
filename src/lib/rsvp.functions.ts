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

export type PublicRsvpContext = {
  kind:
    | "preschool-birthday"
    | "school-age-birthday"
    | "child-birthday"
    | "teen-birthday"
    | "adult-birthday"
    | "baby-shower"
    | "graduation";
  /** Backward-compatible fields returned by the first contextual RSVP contract. */
  adultLabel?: string;
  kidLabel?: string;
  kidHint?: string;
} | null;

export type ArrivalPlan = "from-start" | "arriving-later" | "not-sure";

export type RsvpResponseDetails = {
  arrivalPlan?: ArrivalPlan;
  accessNotes?: string;
};

export function rsvpResponseDetails(
  rsvp: "yes" | "maybe" | "no",
  arrivalPlan: ArrivalPlan | "",
  accessNotes: string,
): RsvpResponseDetails | undefined {
  if (rsvp === "no") return undefined;
  const cleanAccess = accessNotes.trim().slice(0, 200);
  if (!arrivalPlan && !cleanAccess) return undefined;
  return {
    ...(arrivalPlan ? { arrivalPlan } : {}),
    ...(cleanAccess ? { accessNotes: cleanAccess } : {}),
  };
}

export type ContextualRsvpCopy = {
  adultLabel: string;
  kidLabel: string;
  kidHint: string | null;
  intro: string | null;
  defaultAdults: number;
  defaultKids: number;
  arrivalQuestion: string | null;
  accessPrompt: string | null;
};

export function contextualRsvpCopy(context?: PublicRsvpContext): ContextualRsvpCopy {
  if (context?.kind === "child-birthday") {
    return {
      adultLabel: "Adults staying",
      kidLabel: "Children coming",
      kidHint: "Include the invited child and any siblings joining.",
      intro: "Count who is coming so the host can plan food, space, and supervision.",
      defaultAdults: 0,
      defaultKids: 1,
      arrivalQuestion: null,
      accessPrompt: "Anything that would help your child feel comfortable or included?",
    };
  }
  if (context?.kind === "preschool-birthday") {
    return {
      adultLabel: context.adultLabel ?? "Adults staying",
      kidLabel: context.kidLabel ?? "Children coming",
      kidHint: context.kidHint ?? "Include the invited child and any siblings joining.",
      intro: "Count the people actually attending so food, seating, and supervision match.",
      defaultAdults: 0,
      defaultKids: 1,
      arrivalQuestion: null,
      accessPrompt: "Anything that would help your child feel comfortable or included?",
    };
  }
  if (context?.kind === "school-age-birthday") {
    return {
      adultLabel: "Adults staying",
      kidLabel: "Children coming",
      kidHint: "Include the invited child and any siblings joining.",
      intro: "Count who is staying so the host can plan food, supervision, and pickup.",
      defaultAdults: 0,
      defaultKids: 1,
      arrivalQuestion: null,
      accessPrompt: "Anything that would help your child participate comfortably?",
    };
  }
  if (context?.kind === "adult-birthday") {
    return {
      adultLabel: "Adults coming",
      kidLabel: "Children coming",
      kidHint: null,
      intro: "Include everyone in your group so the host can plan the real headcount.",
      defaultAdults: 1,
      defaultKids: 0,
      arrivalQuestion: "When do you expect to join?",
      accessPrompt: "Anything that would make seating, sound, or access more comfortable?",
    };
  }
  if (context?.kind === "teen-birthday") {
    return {
      adultLabel: "Adults helping",
      kidLabel: "Young people coming",
      kidHint: "Include the invited teen and anyone else joining.",
      intro: "Count everyone joining so food, space, and transportation match the real group.",
      defaultAdults: 0,
      defaultKids: 1,
      arrivalQuestion: "When do you expect to join?",
      accessPrompt: "Anything that would make the gathering more comfortable or accessible?",
    };
  }
  if (context?.kind === "baby-shower") {
    return {
      adultLabel: "Adults coming",
      kidLabel: "Children coming",
      kidHint: "Include everyone in your group so seating, food, and space match.",
      intro: "Count everyone joining so the host can plan a comfortable gathering.",
      defaultAdults: 1,
      defaultKids: 0,
      arrivalQuestion: "Will you join from the start or arrive later?",
      accessPrompt: "Anything that would make seating, sound, access, or participation easier?",
    };
  }
  if (context?.kind === "graduation") {
    return {
      adultLabel: "Adults coming",
      kidLabel: "Children coming",
      kidHint: "Include everyone in your group so food waves and seating match.",
      intro: "Count everyone joining so the host can plan the celebration around the real group.",
      defaultAdults: 1,
      defaultKids: 0,
      arrivalQuestion: "When do you expect to join the celebration?",
      accessPrompt: "Anything that would make parking, seating, sound, or access easier?",
    };
  }
  return {
    adultLabel: "Adults",
    kidLabel: "Kids",
    kidHint: null,
    intro: null,
    defaultAdults: 1,
    defaultKids: 0,
    arrivalQuestion: null,
    accessPrompt: "Anything that would help you participate or feel comfortable?",
  };
}

export function attendanceCopy(context?: PublicRsvpContext): {
  adultLabel: string;
  kidLabel: string;
  kidHint: string | null;
  intro: string | null;
} {
  const copy = contextualRsvpCopy(context);
  return {
    adultLabel: copy.adultLabel,
    kidLabel: copy.kidLabel,
    kidHint: copy.kidHint,
    intro: copy.intro,
  };
}

export type PartyView = {
  name: string;
  date: string;
  start_time: string | null;
  event_time_zone?: string | null;
  location: string | null;
  occasion: string;
  theme_id: string | null;
  theme: string | null;
  host_note: string | null;
  holiday_pack_id: string | null;
  host_updates: HostUpdateView[];
  bring_board: PublicBringItem[];
  photo_drop: PublicPhotoDrop;
  rsvp_context?: PublicRsvpContext;
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

type RsvpFailure = {
  event: "rpc_failed" | "network_failed";
  correlationId: string;
  code: string | null;
};

function correlationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `rsvp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code.slice(0, 80) : null;
}

function defaultFailureLogger(failure: RsvpFailure): void {
  // Never log the invite token, party payload, URL, or raw upstream message.
  // The correlation ID gives operators something safe to trace.
  console.error("[rsvp] loader_failed", failure);
}

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
    logFailure?: (failure: RsvpFailure) => void;
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
      return await supabase.rpc("get_rsvp_party_v2", { token: t });
    });

  try {
    const { data: partyData, error } = await rpc(token);
    if (error) {
      // RPC returned a transport/permission error — treat as outage.
      (deps.logFailure ?? defaultFailureLogger)({
        event: "rpc_failed",
        correlationId: correlationId(),
        code: safeErrorCode(error),
      });
      return { party: null, status: "temporarily_unavailable", origin };
    }
    if (!partyData) {
      // RPC succeeded with no party — genuine not-found.
      return { party: null, status: "not_found", origin };
    }
    return { party: partyData as unknown as PartyView, status: "ok", origin };
  } catch (error) {
    // Network / thrown error — outage, never a bad link.
    (deps.logFailure ?? defaultFailureLogger)({
      event: "network_failed",
      correlationId: correlationId(),
      code: safeErrorCode(error),
    });
    return { party: null, status: "temporarily_unavailable", origin };
  }
}

export const getRsvpLoaderData = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<RsvpLoaderData> => {
    // Never let this handler throw — the RSVP route renders a sanitized
    // UI at HTTP 200 for any non-ok state. Raw errors must not reach the client.
    return resolveRsvpLoaderData(data?.token, {
      origin: readOrigin(),
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    });
  });
