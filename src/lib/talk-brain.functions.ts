// Text-mode Talk-it-out brain. Ships today via Lovable AI Gateway with a
// deterministic demo fallback so the experience is never broken.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { detectPack, PACKS, packBringBoard, packTasks, type PackId } from "./holiday-packs";
import { TALK_SYSTEM_PROMPT } from "./gathering-draft";

const MAX_TURNS_PER_HOUR = 40;

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

type DraftPatch = {
  identity?: { workingTitle?: string; occasion?: string; holidayPackId?: string };
  when?: { date?: string; startTime?: string; dateCertainty?: "fixed" | "window" | "tbd" };
  where?: { display?: string };
  people?: { expectedCount?: number; households?: number; kids?: number };
  budget?: { total?: number; stance?: "strict" | "flexible" | "no-limit" };
  food?: { approach?: string };
  hostNote?: string;
};

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
    "identity": { "workingTitle"?: string, "occasion"?: "birthday"|"baby-shower"|"graduation"|"holiday"|"dinner-party"|"game-day"|"cookout"|"other", "holidayPackId"?: "thanksgiving"|"friendsgiving"|"shabbat"|"hanukkah"|"christmas"|"passover"|"easter"|"diwali"|"eid"|"lunar-new-year" },
    "when": { "date"?: "YYYY-MM-DD", "startTime"?: "7:00 PM", "dateCertainty"?: "fixed"|"window"|"tbd" },
    "where": { "display"?: string },
    "people": { "expectedCount"?: number, "households"?: number, "kids"?: number },
    "budget": { "total"?: number, "stance"?: "strict"|"flexible"|"no-limit" },
    "food": { "approach"?: "cook"|"catering"|"grocery-prepared"|"potluck"|"mix"|"snacks-only" },
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
    const months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
    const m = months.indexOf(md[1].slice(0,3).toLowerCase());
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

function demoBrain(messages: TurnInput["_output"]["messages"]): TurnResult {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const allUser = messages.filter((m) => m.role === "user").map((m) => m.content).join(" ");
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
  }

  if (/potluck|everyone brings|bring a dish/i.test(allUser)) {
    patch.food = { approach: "potluck" };
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

  // Nudge based on the last message if it asked a direct thing.
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

    // Fetch draft + rate limit
    const { data: draftRow, error: draftErr } = await supabase
      .from("gathering_drafts")
      .select("id, draft, ai_turns, updated_at")
      .eq("id", data.draftId)
      .eq("user_id", userId)
      .maybeSingle();
    if (draftErr) throw new Error(draftErr.message);
    if (!draftRow) throw new Error("Draft not found");

    const turns = (draftRow.ai_turns ?? 0) + 1;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const withinHour = new Date(draftRow.updated_at ?? 0).getTime() > oneHourAgo;
    if (withinHour && turns > MAX_TURNS_PER_HOUR) {
      throw new Error("Slow down — that's a lot of turns in one hour. Try again in a bit.");
    }

    let result: TurnResult;
    const canUseAi = !!process.env.LOVABLE_API_KEY;
    if (canUseAi) {
      try {
        const { chatJSON } = await import("./ai.server");
        const { parsed } = await chatJSON<{
          reply: string;
          draftPatch?: DraftPatch;
          openQuestions?: string[];
          assumptions?: string[];
          suggestedPackId?: PackId;
        }>({
          system: TALK_SYSTEM_PROMPT,
          messages: data.messages,
          schemaHint: SCHEMA_HINT,
        });
        if (parsed?.reply) {
          result = {
            reply: parsed.reply,
            draftPatch: parsed.draftPatch ?? {},
            openQuestions: parsed.openQuestions ?? [],
            assumptions: parsed.assumptions ?? [],
            suggestedPackId: parsed.suggestedPackId,
            usedDemo: false,
          };
        } else {
          result = demoBrain(data.messages);
        }
      } catch (err) {
        console.error("[talk-brain] AI call failed, falling back to demo", err);
        result = demoBrain(data.messages);
      }
    } else {
      result = demoBrain(data.messages);
    }

    // Merge patch into stored draft (shallow — draft body is jsonb).
    const existing = (draftRow.draft as Record<string, unknown>) ?? {};
    const merged = { ...existing, patch: mergePatchLog(existing.patch, result.draftPatch, result.usedDemo) };
    await supabase
      .from("gathering_drafts")
      .update({
        draft: merged,
        ai_turns: turns,
        open_questions: result.openQuestions as unknown as never,
        assumptions: result.assumptions as unknown as never,
      })
      .eq("id", data.draftId);

    return result;
  });

function mergePatchLog(prev: unknown, patch: DraftPatch, demo: boolean) {
  const arr = Array.isArray(prev) ? prev : [];
  return [...arr, { at: new Date().toISOString(), demo, patch }].slice(-40);
}

// -------- Confirm draft -> materialize a Party row --------

const ConfirmInput = z.object({ draftId: z.string().uuid() });

export const confirmDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ConfirmInput.parse(input))
  .handler(async ({ data, context }): Promise<{ partyId: string }> => {
    const { supabase, userId } = context;
    const { data: draftRow, error } = await supabase
      .from("gathering_drafts")
      .select("id, draft")
      .eq("id", data.draftId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!draftRow) throw new Error("Draft not found");

    // Rebuild the latest patch state from the log.
    const log = ((draftRow.draft as { patch?: Array<{ patch: DraftPatch }> })?.patch ?? []).map(
      (l) => l.patch,
    );
    const merged: DraftPatch = {};
    for (const p of log) {
      if (p.identity) merged.identity = { ...(merged.identity ?? {}), ...p.identity };
      if (p.when) merged.when = { ...(merged.when ?? {}), ...p.when };
      if (p.where) merged.where = { ...(merged.where ?? {}), ...p.where };
      if (p.people) merged.people = { ...(merged.people ?? {}), ...p.people };
      if (p.budget) merged.budget = { ...(merged.budget ?? {}), ...p.budget };
      if (p.food) merged.food = { ...(merged.food ?? {}), ...p.food };
      if (p.hostNote) merged.hostNote = p.hostNote;
    }

    const packId = merged.identity?.holidayPackId as PackId | undefined;
    const pack = packId ? PACKS[packId] : undefined;
    const occasion = (merged.identity?.occasion ?? (pack ? "holiday" : "other")) as string;
    const name =
      merged.identity?.workingTitle ??
      (pack ? pack.label : "Untitled gathering");
    const dateISO = merged.when?.date ?? isoDateInDays(21);
    const startTime = merged.when?.startTime ?? null;
    const location = merged.where?.display ?? null;
    const guestEstimate = merged.people?.expectedCount ?? 12;
    const budget = merged.budget?.total ?? 300;

    const mkId = () =>
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);

    const tasks = pack
      ? packTasks(pack, mkId)
      : [
          { id: mkId(), title: "Confirm date and headcount", bucket: "3-5 weeks", done: false },
          { id: mkId(), title: "Plan menu", bucket: "1-2 weeks", done: false },
          { id: mkId(), title: "Shop and prep", bucket: "Party week", done: false },
          { id: mkId(), title: "Set up on the day", bucket: "Day of", done: false },
        ];

    const bringBoard = pack ? packBringBoard(pack, mkId) : [];

    const budgetCategories = [
      { id: mkId(), name: "Food & Drink", planned: Math.round(budget * 0.55), expenses: [] },
      { id: mkId(), name: "Decorations", planned: Math.round(budget * 0.15), expenses: [] },
      { id: mkId(), name: "Supplies", planned: Math.round(budget * 0.15), expenses: [] },
      { id: mkId(), name: "Extras", planned: Math.round(budget * 0.15), expenses: [] },
    ];

    const insertRow = {
      user_id: userId,
      name,
      occasion,
      date: dateISO,
      start_time: startTime,
      location,
      guest_estimate: guestEstimate,
      budget,
      theme: "",
      theme_id: null as string | null,
      tasks: tasks as unknown as never,
      guests: [] as unknown as never,
      budget_categories: budgetCategories as unknown as never,
      shopping_items: [] as unknown as never,
      timeline: [] as unknown as never,
      pinned_inspiration: [] as unknown as never,
      host_note: merged.hostNote ?? null,
      households: [] as unknown as never,
      bring_board: bringBoard as unknown as never,
      host_updates: [] as unknown as never,
      holiday_pack_id: packId ?? null,
      checkins: {} as unknown as never,
    };

    const { data: partyRow, error: insertErr } = await supabase
      .from("parties")
      .insert(insertRow)
      .select("id")
      .single();
    if (insertErr) throw new Error(insertErr.message);

    await supabase
      .from("gathering_drafts")
      .update({ status: "confirmed", confirmed_party_id: partyRow.id })
      .eq("id", data.draftId);

    return { partyId: partyRow.id };
  });

function isoDateInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
