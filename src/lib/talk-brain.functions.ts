// Text-mode Talk-it-out brain. Ships today via Lovable AI Gateway with a
// deterministic demo fallback so the experience is never broken.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { detectPack, type PackId } from "./holiday-packs";
import { TALK_SYSTEM_PROMPT } from "./gathering-draft";
import {
  materializeDraft,
  mergeDraftLog,
  summarize,
  type DraftPatch,
  type ReviewSummary,
} from "./talk-materialize";
import { safeParseDraftPatch, sanitizeStringList } from "./talk-schemas";

const MAX_TURNS_PER_HOUR = 40;
const RATE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Rolling per-hour turn limit. Given the stored ai_turns counter and its
 * hour-start anchor, compute what the next persisted values should be — or
 * whether the caller has exceeded the cap in the current window.
 *
 * Extracted (and exported) so we can unit-test the exact windowing behavior
 * without spinning up the whole server-fn stack.
 *
 * @internal exported for tests only.
 */
export function computeRateWindow(
  input: { aiTurns: number | null | undefined; hourStartISO: string | null | undefined },
  nowMs: number,
): { allowed: boolean; nextTurns: number; nextHourStartISO: string } {
  const hourStartMs = input.hourStartISO ? new Date(input.hourStartISO).getTime() : 0;
  const withinWindow = nowMs - hourStartMs < RATE_WINDOW_MS;
  const windowTurns = withinWindow ? (input.aiTurns ?? 0) : 0;
  const nextTurns = windowTurns + 1;
  const nextHourStartISO = withinWindow
    ? (input.hourStartISO ?? new Date(nowMs).toISOString())
    : new Date(nowMs).toISOString();
  return {
    allowed: nextTurns <= MAX_TURNS_PER_HOUR,
    nextTurns,
    nextHourStartISO,
  };
}

const TurnInput = z.object({
  draftId: z.string().uuid(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(40),
});

type TurnResult = {
  reply: string;
  draftPatch: DraftPatch;
  openQuestions: string[];
  assumptions: string[];
  suggestedPackId?: PackId;
  usedDemo: boolean;
};

const SCHEMA_HINT = `{
  "reply": "<= 3 short sentences, warm, ask ONE question at a time",
  "draftPatch": {
    "identity": { "workingTitle"?: string, "occasion"?: "birthday"|"baby-shower"|"graduation"|"holiday"|"dinner-party"|"game-day"|"cookout"|"other", "holidayPackId"?: "thanksgiving"|"friendsgiving"|"shabbat"|"hanukkah"|"christmas"|"passover"|"easter"|"diwali"|"eid"|"lunar-new-year", "tone"?: string },
    "when": { "date"?: "YYYY-MM-DD", "startTime"?: "7:00 PM", "dateCertainty"?: "fixed"|"window"|"tbd", "anchors"?: [{ "label": string, "at": "7:30 PM", "kind"?: "kickoff"|"toast"|"meal"|"activity" }] },
    "where": { "display"?: string, "contingency"?: { "needed": true, "kind"?: "weather"|"backup-venue", "plan"?: string } },
    "people": { "expectedCount"?: number, "households"?: number, "kids"?: number },
    "effort": { "level"?: "low"|"medium"|"high", "hostReadyTarget"?: "one hour before" },
    "budget": { "total"?: number, "stance"?: "strict"|"flexible"|"no-limit" },
    "food": { "approach"?: "cook"|"catering"|"grocery-prepared"|"potluck"|"mix"|"snacks-only", "peakMoment"?: string },
    "constraints": { "dietary"?: string[], "accessibility"?: string[], "observance"?: string[], "allergies"?: string[] },
    "contributions": { "mode"?: "none"|"open-signup"|"assigned"|"potluck-list", "seeds"?: [{ "label": string, "qty"?: number, "category"?: string }] },
    "vibe": { "activities"?: string[], "creativeDirection"?: { "palette"?: string[], "vibe"?: string }, "broadcast"?: { "source"?: "tv"|"stream"|"none", "channel"?: string, "needsSoundCheck"?: boolean } },
    "rituals": [{ "label": string, "instruction"?: string }],
    "hostNote"?: string
  },
  "openQuestions": [ "one question the host still needs to answer" ],
  "assumptions": [ "any assumption you're making so the host can correct it" ],
  "suggestedPackId"?: "thanksgiving"|"friendsgiving"|"shabbat"|"..."
}`;

// -------- Deterministic demo brain --------

function extractDate(text: string): string | undefined {
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const md = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})/i);
  if (md) {
    const months = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const m = months.indexOf(md[1].slice(0, 3).toLowerCase());
    const d = parseInt(md[2], 10);
    const year = new Date().getFullYear();
    const dt = new Date(year, m, d);
    if (dt.getTime() < Date.now()) dt.setFullYear(year + 1);
    return dt.toISOString().slice(0, 10);
  }
  return undefined;
}

function extractCount(text: string): number | undefined {
  const m = text.match(/\b(\d{1,3})\s*(?:people|guests?|adults?|folks?|of us)\b/i);
  if (m) return parseInt(m[1], 10);
  return undefined;
}

function extractBudget(text: string): number | undefined {
  const m = text.match(/\$\s?(\d{2,5})/);
  if (m) return parseInt(m[1], 10);
  return undefined;
}

type TurnMessages = z.infer<typeof TurnInput>["messages"];

function demoBrain(messages: TurnMessages): TurnResult {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const allUser = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" ");
  const pack = detectPack(allUser);
  const patch: DraftPatch = {};
  const questions: string[] = [];
  const assumptions: string[] = [];

  const date = extractDate(allUser);
  if (date) patch.when = { ...(patch.when ?? {}), date, dateCertainty: "fixed" };
  const count = extractCount(allUser);
  if (count) patch.people = { expectedCount: count };
  const budget = extractBudget(allUser);
  if (budget) patch.budget = { total: budget, stance: "flexible" };

  if (pack) {
    patch.identity = { workingTitle: pack.label, occasion: "holiday", holidayPackId: pack.id };
  } else if (/birthday/i.test(allUser)) {
    patch.identity = { workingTitle: "Birthday", occasion: "birthday" };
  } else if (/bbq|cookout|grill/i.test(allUser)) {
    patch.identity = { workingTitle: "Backyard BBQ", occasion: "cookout" };
  } else if (/watch|game day|super bowl|world cup/i.test(allUser)) {
    patch.identity = { workingTitle: "Watch Party", occasion: "game-day" };
    patch.vibe = { broadcast: { source: "tv", needsSoundCheck: true } };
  }

  if (/potluck|everyone brings|bring a dish/i.test(allUser)) {
    patch.food = { approach: "potluck" };
    patch.contributions = { mode: "open-signup" };
  } else if (/caterer|catering/i.test(allUser)) {
    patch.food = { approach: "catering" };
  }

  let reply = "";
  const turnCount = messages.filter((m) => m.role === "user").length;

  if (turnCount === 1) {
    reply = pack
      ? `Love it — ${pack.label}. Want me to start from the ${pack.label} pack (rituals stay optional)? And when is it — a set date or a window?`
      : `Got it. Tell me the shape of it: when, roughly how many people, and what should it feel like?`;
    if (pack) patch.identity = { ...(patch.identity ?? {}), holidayPackId: pack.id };
    if (!date) questions.push("What date (or window)?");
  } else if (!date) {
    reply = "When are you thinking? A firm date or a rough window both work.";
    questions.push("What date (or window)?");
  } else if (!count) {
    reply = "How many people are you expecting? A rough number is fine.";
    questions.push("Expected headcount?");
  } else if (!patch.budget && !/no budget|no-limit|money is fine/i.test(allUser)) {
    reply = "What kind of budget are we working with — strict, flexible, or no ceiling?";
    questions.push("Budget?");
  } else {
    reply =
      "Here's what I'm hearing: I have the essentials to draft this. Want to review the plan and confirm?";
    assumptions.push(
      pack
        ? `Using the ${pack.label} pack as the starting template.`
        : "Using a general gathering template.",
    );
  }

  if (/help|stuck|overwhelm/i.test(lastUser)) {
    reply = "One step at a time. Let's lock the date first — do you have one in mind?";
  }

  return {
    reply,
    draftPatch: patch,
    openQuestions: questions,
    assumptions,
    suggestedPackId: pack?.id,
    usedDemo: true,
  };
}

// -------- Server functions --------

export const sendTurn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TurnInput.parse(input))
  .handler(async ({ data, context }): Promise<TurnResult> => {
    const { supabase, userId } = context;

    // Atomic per-hour rate limit + windowed anchor update, all in one DB
    // trip. Prevents interleaved concurrent turns from overshooting the cap.
    const { data: rlRaw, error: rlErr } = await supabase.rpc("bump_ai_turn", {
      _draft_id: data.draftId,
      _cap: MAX_TURNS_PER_HOUR,
      _window_ms: RATE_WINDOW_MS,
    });
    if (rlErr) {
      // Draft-not-found and auth-required surface as generic messages; the
      // raw DB error stays server-side.
      console.warn("[talk] bump_ai_turn error", rlErr.code);
      throw new Error("Couldn't reach your draft. Please retry.");
    }
    const rl = rlRaw as { allowed?: boolean; turns?: number } | null;
    if (!rl || rl.allowed !== true) {
      throw new Error("Slow down — that's a lot of turns in one hour. Try again in a bit.");
    }

    let result: TurnResult;
    const canUseAi = !!process.env.LOVABLE_API_KEY;
    if (canUseAi) {
      try {
        const { chatJSON } = await import("./ai.server");
        const { parsed } = await chatJSON<{
          reply?: unknown;
          draftPatch?: unknown;
          openQuestions?: unknown;
          assumptions?: unknown;
          suggestedPackId?: unknown;
        }>({ system: TALK_SYSTEM_PROMPT, messages: data.messages, schemaHint: SCHEMA_HINT });
        const rawReply = typeof parsed?.reply === "string" ? parsed.reply.trim() : "";
        if (rawReply) {
          const { patch, issues } = safeParseDraftPatch(parsed?.draftPatch ?? {});
          if (issues.length) {
            // Redacted structured log — no user content, only field paths.
            console.warn("[talk] dropped invalid draftPatch fields", { issues });
          }
          const suggested =
            typeof parsed?.suggestedPackId === "string"
              ? (parsed.suggestedPackId as PackId)
              : undefined;
          result = {
            reply: rawReply.slice(0, 4000),
            draftPatch: patch,
            openQuestions: sanitizeStringList(parsed?.openQuestions, 8, 200),
            assumptions: sanitizeStringList(parsed?.assumptions, 8, 300),
            suggestedPackId: suggested,
            usedDemo: false,
          };
        } else {
          result = demoBrain(data.messages);
        }
      } catch (err) {
        console.error(
          "[talk-brain] AI call failed, falling back to demo",
          err instanceof Error ? err.name : typeof err,
        );
        result = demoBrain(data.messages);
      }
    } else {
      result = demoBrain(data.messages);
    }

    // Merge patch into stored draft log. Rate-limit anchor already persisted
    // atomically by bump_ai_turn above.
    const { data: draftRow, error: readErr } = await supabase
      .from("gathering_drafts")
      .select("draft")
      .eq("id", data.draftId)
      .eq("user_id", userId)
      .maybeSingle();
    if (readErr) throw new Error("Failed to load draft");
    const existing = (draftRow?.draft as Record<string, unknown> | undefined) ?? {};
    const merged = {
      ...existing,
      patch: mergePatchLog(existing.patch, result.draftPatch, result.usedDemo),
    };
    const { error: updateErr } = await supabase
      .from("gathering_drafts")
      .update({
        draft: merged,
        open_questions: result.openQuestions as unknown as never,
        assumptions: result.assumptions as unknown as never,
      })
      .eq("id", data.draftId)
      .eq("user_id", userId);
    if (updateErr) {
      throw new Error(`Failed to save draft: ${updateErr.message}`);
    }

    return result;
  });

function mergePatchLog(prev: unknown, patch: DraftPatch, demo: boolean) {
  const arr = Array.isArray(prev) ? prev : [];
  return [...arr, { at: new Date().toISOString(), demo, patch }].slice(-40);
}

// -------- Merged patch helper (shared by preview + confirm) --------

async function readMergedPatch(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  draftId: string,
  userId: string,
): Promise<{
  merged: DraftPatch;
  storedAssumptions: string[];
  storedOpenQuestions: string[];
  draftRow: { id: string; status: string; confirmed_party_id: string | null };
}> {
  const { data: draftRow, error } = await supabase
    .from("gathering_drafts")
    .select("id, draft, status, confirmed_party_id, assumptions, open_questions")
    .eq("id", draftId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!draftRow) throw new Error("Draft not found");
  const log = ((draftRow.draft as { patch?: Array<{ patch: DraftPatch }> })?.patch ?? []).map(
    (l) => l.patch,
  );
  const merged = mergeDraftLog(log);
  // Trust nothing that was persisted as `jsonb`; the AI might have pushed
  // arbitrary shapes into these columns at some point. sanitizeStringList
  // trims, dedupes, and caps.
  const storedAssumptions = sanitizeStringList(draftRow.assumptions, 12, 300);
  const storedOpenQuestions = sanitizeStringList(draftRow.open_questions, 12, 200);
  return {
    merged,
    storedAssumptions,
    storedOpenQuestions,
    draftRow: {
      id: draftRow.id,
      status: draftRow.status,
      confirmed_party_id: draftRow.confirmed_party_id,
    },
  };
}

function mergeDedupeStrings(a: string[], b: string[], cap = 12): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of [...a, ...b]) {
    const clean = s.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= cap) break;
  }
  return out;
}

// -------- Preview draft (used by the review UI before confirm) --------

const PreviewInput = z.object({ draftId: z.string().uuid() });

export const previewDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PreviewInput.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<ReviewSummary & { alreadyConfirmed: boolean; confirmedPartyId: string | null }> => {
      const { supabase, userId } = context;
      const { merged, storedAssumptions, storedOpenQuestions, draftRow } = await readMergedPatch(
        supabase,
        data.draftId,
        userId,
      );
      const summary = summarize(merged);
      // Merge conversation-captured assumptions/questions with the
      // materializer-derived ones. Deduped case-insensitively so the review
      // dialog doesn't repeat itself.
      const assumptions = mergeDedupeStrings(storedAssumptions, summary.assumptions);
      const openQuestions = mergeDedupeStrings(storedOpenQuestions, summary.openQuestions);
      return {
        ...summary,
        assumptions,
        openQuestions,
        alreadyConfirmed: draftRow.status === "confirmed" && !!draftRow.confirmed_party_id,
        confirmedPartyId: draftRow.confirmed_party_id,
      };
    },
  );

// -------- Confirm draft -> materialize a Party row (idempotent) --------

const ConfirmInput = z.object({
  draftId: z.string().uuid(),
  /**
   * The host has seen the "no real date yet — I'll set it later" warning and
   * still wants to create the party. Required when the merged draft has no
   * `when.date`. Blocking gate is enforced by the client; the server also
   * fails-closed with a clear error message so a bypassed client cannot
   * silently create a fake-date party.
   */
  acknowledgePlaceholderDate: z.boolean().optional().default(false),
});

export const confirmDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ConfirmInput.parse(input))
  .handler(async ({ data, context }): Promise<{ partyId: string; alreadyConfirmed: boolean }> => {
    const { supabase } = context;
    const { merged, draftRow } = await readMergedPatch(supabase, data.draftId, context.userId);

    if (draftRow.status === "confirmed" && draftRow.confirmed_party_id) {
      return { partyId: draftRow.confirmed_party_id, alreadyConfirmed: true };
    }

    const mkId = () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);

    const { party, blockingUnknowns } = materializeDraft(merged, { mkId });

    // Server-side enforcement mirrors the client's blocking gate. If the
    // real date is missing, require the explicit acknowledgment.
    const dateBlocked = blockingUnknowns.some((b) => b.field === "date");
    if (dateBlocked && !data.acknowledgePlaceholderDate) {
      throw new Error(
        "Set a real event date first, or confirm you'll pick a date later before creating the party.",
      );
    }

    // Single transactional RPC: locks the draft row, checks ownership,
    // returns the existing party id if already confirmed, otherwise inserts
    // the party and claims the draft in one shot. Removes the previous
    // best-effort insert + rollback pattern.
    const payload = {
      name: party.name,
      occasion: party.occasion,
      date: party.date,
      startTime: party.startTime,
      location: party.location,
      guestEstimate: party.guestEstimate,
      budget: party.budget,
      theme: party.theme,
      themeId: party.themeId,
      holidayPackId: party.holidayPackId,
      hostNote: party.hostNote,
      tasks: party.tasks,
      budgetCategories: party.budgetCategories,
      shoppingItems: party.shoppingItems,
      timeline: party.timeline,
      bringBoard: party.bringBoard,
    };
    const { data: rpc, error: rpcErr } = await supabase.rpc("confirm_gathering_draft", {
      _draft_id: data.draftId,
      _party: payload as unknown as never,
    });
    if (rpcErr) {
      console.warn("[talk] confirm_gathering_draft error", rpcErr.code);
      throw new Error("Couldn't create the party. Please try again.");
    }
    const out = rpc as { party_id?: string; already_confirmed?: boolean } | null;
    if (!out?.party_id) throw new Error("Couldn't create the party. Please try again.");
    return { partyId: out.party_id, alreadyConfirmed: !!out.already_confirmed };
  });
