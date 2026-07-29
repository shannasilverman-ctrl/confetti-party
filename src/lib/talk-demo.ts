import { detectPack, type PackId } from "./holiday-packs";
import type { DraftPatch } from "./talk-materialize";

/**
 * Deterministic, input-aware planner for the signed-out Talk experience and
 * the authenticated server fallback. It runs without a network call and
 * captures only facts the host actually supplied.
 */
export type DemoMsg = { role: "user" | "assistant"; content: string };

export type DemoTurnResult = {
  reply: string;
  draftPatch: DraftPatch;
  assumptions: string[];
  openQuestions: string[];
  suggestedPackId?: PackId;
  complete: boolean;
  usedDemo: true;
};

export const DEMO_MAX_TURNS = 3;

function validIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function extractDate(text: string, now: Date): string | undefined {
  const iso = text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  if (iso && validIsoDate(iso)) return iso;

  const relative = text.match(
    /\bin\s+(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(days?|weeks?)\b/i,
  );
  if (relative) {
    const quantity = smallNumber(relative[1]) ?? NaN;
    const days = /week/i.test(relative[2]) ? quantity * 7 : quantity;
    if (days >= 1 && days <= 365) {
      const date = new Date(now);
      date.setDate(date.getDate() + days);
      return isoDate(date);
    }
  }

  if (/\btomorrow\b/i.test(text)) {
    const date = new Date(now);
    date.setDate(date.getDate() + 1);
    return isoDate(date);
  }

  const weekday = text.match(/\b(this|next)\s+(sun|mon|tue|wed|thu|fri|sat)(?:day)?\b/i);
  if (weekday) {
    const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const target = weekdays.indexOf(weekday[2].slice(0, 3).toLowerCase());
    let offset = (target - now.getDay() + 7) % 7;
    if (weekday[1].toLowerCase() === "next") offset = offset === 0 ? 7 : offset + 7;
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    return isoDate(date);
  }

  const md = text.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?(?:(?:\s*,\s*|\s+)(\d{4}))?\b/i,
  );
  if (!md) return undefined;
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
  const month = months.indexOf(md[1].slice(0, 3).toLowerCase());
  const day = Number(md[2]);
  const explicitYear = md[3] ? Number(md[3]) : undefined;
  if (explicitYear != null && (explicitYear < 1900 || explicitYear > 2200)) return undefined;
  const date = new Date(explicitYear ?? now.getFullYear(), month, day);
  if (date.getMonth() !== month || date.getDate() !== day) return undefined;
  if (explicitYear == null) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (date < today) date.setFullYear(date.getFullYear() + 1);
  }
  return isoDate(date);
}

function extractCount(text: string): number | undefined {
  const match =
    text.match(/\b(\d{1,3})\s*(?:people|guests?|adults?|folks?|friends?|of us)\b/i) ??
    text.match(/\b(?:for|about|around)\s+(\d{1,3})\b/i);
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) && value >= 1 && value <= 500 ? value : undefined;
}

function smallNumber(token: string): number | undefined {
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  };
  if (/^\d{1,3}$/.test(token)) return Number(token);
  return words[token.toLowerCase()];
}

function extractAudience(text: string): { kids?: number; adults?: number } {
  const number = "(\\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)";
  const kids = text.match(new RegExp(`\\b${number}\\s*(?:kids?|children)\\b`, "i"));
  const adults = text.match(
    new RegExp(`\\b${number}\\s*(?:adults?|parents?|grown[ -]?ups?)\\b`, "i"),
  );
  return {
    ...(kids ? { kids: smallNumber(kids[1]) } : {}),
    ...(adults ? { adults: smallNumber(adults[1]) } : {}),
  };
}

function extractBirthdayAge(text: string): number | undefined {
  const match =
    text.match(/\bturn(?:s|ing)?\s+(\d{1,3})\b/i) ??
    text.match(/\b(\d{1,3})(?:st|nd|rd|th)?\s+birthday\b/i) ??
    text.match(/\b(\d{1,3})[ -]?year[ -]?old\b/i);
  const age = match ? Number(match[1]) : NaN;
  return Number.isFinite(age) && age >= 1 && age <= 120 ? age : undefined;
}

function extractBudget(text: string): number | undefined {
  const match =
    text.match(/\$\s?([\d,]{2,7})\b/) ??
    text.match(/\b([\d,]{2,7})\s*(?:dollar|usd|budget)\b/i) ??
    text.match(/\bbudget(?:\s+is|\s+of|\s+around|\s+about)?\s+\$?([\d,]{2,7})\b/i);
  const value = match ? Number(match[1].replaceAll(",", "")) : NaN;
  return Number.isFinite(value) && value >= 0 && value <= 100_000 ? value : undefined;
}

function extractStartTime(text: string): string | undefined {
  const match = text.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (!match) return undefined;
  const hour = String(Number(match[1]));
  const minute = match[2] ?? "00";
  const period = match[3].replaceAll(".", "").toUpperCase();
  return `${hour}:${minute} ${period}`;
}

function ordinal(value: number): string {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
}

export type LocalPlanningAnalysis = {
  draftPatch: DraftPatch;
  capturedFacts: string[];
  suggestedPackId?: PackId;
};

function buildPatch(
  allUser: string,
  now: Date,
): {
  patch: DraftPatch;
  packId?: PackId;
} {
  const patch: DraftPatch = {};
  const pack = detectPack(allUser);
  const date = extractDate(allUser, now);
  const audience = extractAudience(allUser);
  const explicitCount = extractCount(allUser);
  const completeAudience = audience.kids != null && audience.adults != null;
  const audienceTotal =
    audience.kids != null || audience.adults != null
      ? (audience.kids ?? 0) + (audience.adults ?? 0)
      : undefined;
  const budget = extractBudget(allUser);
  const startTime = extractStartTime(allUser);
  const birthdayAge = extractBirthdayAge(allUser);

  if (date || /\b(?:next month|sometime|date tbd|not sure when)\b/i.test(allUser)) {
    patch.when = {
      ...(date ? { date, dateCertainty: "fixed" as const } : { dateCertainty: "window" as const }),
      ...(startTime ? { startTime } : {}),
    };
  } else if (startTime) {
    patch.when = { startTime };
  }

  if (explicitCount || audienceTotal != null) {
    patch.people = {
      expectedCount: completeAudience ? audienceTotal : (explicitCount ?? audienceTotal),
      ...audience,
    };
  }
  if (budget != null) patch.budget = { total: budget, stance: "flexible" };

  if (pack) {
    patch.identity = {
      workingTitle: pack.label,
      occasion: "holiday",
      holidayPackId: pack.id,
    };
  } else if (/\bbirthday\b/i.test(allUser)) {
    patch.identity = {
      workingTitle: birthdayAge ? `${ordinal(birthdayAge)} Birthday` : "Birthday",
      occasion: "birthday",
      ...(birthdayAge ? { honoreeAge: birthdayAge } : {}),
    };
  } else if (/\b(?:baby shower|sprinkle)\b/i.test(allUser)) {
    patch.identity = { workingTitle: "Baby Shower", occasion: "baby-shower" };
  } else if (/\bgraduat(?:e|ion)\b/i.test(allUser)) {
    patch.identity = { workingTitle: "Graduation Party", occasion: "graduation" };
  } else if (/\b(?:bbq|barbecue|cookout|grill)\b/i.test(allUser)) {
    patch.identity = { workingTitle: "Backyard BBQ", occasion: "cookout" };
  } else if (/\b(?:watch party|game day|super bowl|world cup)\b/i.test(allUser)) {
    patch.identity = { workingTitle: "Watch Party", occasion: "game-day" };
    patch.vibe = { broadcast: { source: "tv", needsSoundCheck: true } };
  } else if (/\b(?:dinner|supper)\b/i.test(allUser)) {
    patch.identity = { workingTitle: "Dinner Party", occasion: "dinner-party" };
  } else if (/\b(?:potluck|everyone brings|bring a dish)\b/i.test(allUser)) {
    // Potluck describes how the gathering works, not a narrow cultural or
    // occasion assumption. Keep the canonical occasion general while giving
    // a sentence-length idea a usable working title.
    patch.identity = { workingTitle: "Potluck", occasion: "other" };
  }

  if (/\bbackyard\b/i.test(allUser)) {
    patch.where = { display: "Backyard", venueKind: "backyard" };
  } else if (/\b(?:at home|our house|my house|at my place)\b/i.test(allUser)) {
    patch.where = { display: "Home", venueKind: "home" };
  } else if (/\b(?:park|playground)\b/i.test(allUser)) {
    patch.where = { display: "Park", venueKind: "park" };
  } else if (/\b(?:at a venue|party venue|play gym|trampoline park)\b/i.test(allUser)) {
    patch.where = { venueKind: "venue" };
  }

  if (/\b(?:easy|low[- ]?effort|low[- ]?lift|low[- ]?key|no cleanup|relaxed)\b/i.test(allUser)) {
    patch.effort = { level: "low" };
  } else if (/\b(?:go all out|all[- ]?out|big production|elaborate)\b/i.test(allUser)) {
    patch.effort = { level: "high" };
  }

  if (/\b(?:potluck|everyone brings|bring a dish)\b/i.test(allUser)) {
    patch.food = { approach: "potluck" };
    patch.contributions = { mode: "open-signup" };
  } else if (/\b(?:caterer|catering|catered)\b/i.test(allUser)) {
    patch.food = { approach: "catering" };
  } else if (/\b(?:snacks only|light bites|finger food)\b/i.test(allUser)) {
    patch.food = { approach: "snacks-only" };
  }

  const dietary = [
    ["vegetarian", /\bvegetarian\b/i],
    ["vegan", /\bvegan\b/i],
    ["gluten-free", /\bgluten[- ]?free\b/i],
    ["kosher", /\bkosher\b/i],
    ["halal", /\bhalal\b/i],
  ]
    .filter(([, pattern]) => (pattern as RegExp).test(allUser))
    .map(([label]) => label as string);
  if (dietary.length) patch.constraints = { dietary };

  const vibe = ["relaxed", "cozy", "casual", "elegant", "playful", "colorful", "low-key"].find(
    (word) => new RegExp(`\\b${word.replace("-", "[- ]?")}\\b`, "i").test(allUser),
  );
  if (vibe) {
    patch.identity = { ...(patch.identity ?? {}), tone: vibe };
    patch.vibe = {
      ...(patch.vibe ?? {}),
      creativeDirection: { vibe },
    };
  }

  return { patch, packId: pack?.id };
}

function displayIsoDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function analyzePlanningIdea(
  idea: string,
  options: { now?: Date } = {},
): LocalPlanningAnalysis {
  const { patch, packId } = buildPatch(idea, options.now ?? new Date());
  const facts: string[] = [];
  if (patch.identity?.workingTitle) facts.push(patch.identity.workingTitle);
  if (patch.when?.date) facts.push(displayIsoDate(patch.when.date));
  if (patch.people?.expectedCount) facts.push(`${patch.people.expectedCount} people`);
  if (patch.people?.kids != null) facts.push(`${patch.people.kids} kids`);
  if (patch.budget?.total != null) facts.push(`$${patch.budget.total.toLocaleString()} budget`);
  if (patch.food?.approach === "potluck") facts.push("Potluck");
  if (patch.effort?.level === "low") facts.push("Low effort");
  for (const need of patch.constraints?.dietary ?? []) facts.push(need);

  return {
    draftPatch: patch,
    capturedFacts: Array.from(new Set(facts)).slice(0, 8),
    ...(packId ? { suggestedPackId: packId } : {}),
  };
}

function capturedSummary(patch: DraftPatch): string[] {
  const captured: string[] = [];
  if (patch.identity?.workingTitle) captured.push(patch.identity.workingTitle);
  if (patch.people?.expectedCount) captured.push(`${patch.people.expectedCount} guests`);
  if (patch.budget?.total != null) captured.push(`$${patch.budget.total.toLocaleString()} budget`);
  if (patch.where?.display) captured.push(patch.where.display.toLowerCase());
  if (patch.identity?.tone) captured.push(`${patch.identity.tone} feel`);
  return captured.slice(0, 4);
}

export function demoReply(messages: DemoMsg[], options: { now?: Date } = {}): DemoTurnResult {
  const userMessages = messages.filter((message) => message.role === "user");
  const allUser = userMessages.map((message) => message.content).join(" ");
  const lastUser = userMessages.at(-1)?.content ?? "";
  const analysis = analyzePlanningIdea(allUser, options);
  const patch = analysis.draftPatch;
  const packId = analysis.suggestedPackId;
  const turnCount = userMessages.length;
  const openQuestions: string[] = [];

  if (!patch.identity?.occasion) openQuestions.push("What are you gathering for?");
  else if (!patch.when?.date) openQuestions.push("What date, or should that stay open for now?");
  else if (patch.people?.expectedCount == null) openQuestions.push("About how many people?");
  else if (patch.budget?.total == null)
    openQuestions.push("Is there a comfortable budget to plan around?");
  else if (!patch.where?.venueKind) openQuestions.push("Where are you thinking of hosting it?");

  const captured = capturedSummary(patch);
  const summary = captured.length
    ? `I caught ${captured.join(", ")}.`
    : "I have your starting idea.";
  const essentialsReady =
    !!patch.identity?.occasion && !!patch.when?.date && patch.people?.expectedCount != null;
  const complete = essentialsReady || turnCount >= DEMO_MAX_TURNS;

  let reply: string;
  if (/\b(?:help|stuck|overwhelm|overwhelmed)\b/i.test(lastUser) && !patch.when?.date) {
    reply = `${summary} One step at a time: what date, or should we leave it open?`;
  } else if (complete) {
    const open = openQuestions[0]
      ? ` I can leave “${openQuestions[0].replace(/\?$/, "")}” open so it does not become a made-up fact.`
      : "";
    reply = `${summary}${open} I can build the useful browser plan now.`;
  } else {
    reply = `${summary} ${openQuestions[0]}`;
  }

  return {
    reply,
    draftPatch: patch,
    openQuestions: openQuestions.slice(0, 1),
    assumptions: patch.identity?.occasion
      ? [`Using ${patch.identity.workingTitle ?? "this gathering"} as an editable starting point.`]
      : ["Using a general gathering starting point until you name the occasion."],
    ...(packId ? { suggestedPackId: packId } : {}),
    complete,
    usedDemo: true,
  };
}
