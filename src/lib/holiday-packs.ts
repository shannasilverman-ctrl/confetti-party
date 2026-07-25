// Holiday packs — culturally respectful, opt-in seeds for gatherings.
// Every ritual and menu item is optional. Hosts choose what to keep.

import type { OccasionType, Bucket, Task } from "./party-context";

export type PackId =
  | "thanksgiving"
  | "friendsgiving"
  | "shabbat"
  | "hanukkah"
  | "christmas"
  | "passover"
  | "easter"
  | "diwali"
  | "eid"
  | "lunar-new-year";

export type BringSeed = {
  category: "Main" | "Sides" | "Dessert" | "Drinks" | "Ice / Serveware" | "Kids" | "Décor";
  label: string;
  qty: number;
  unit?: string;
  dietaryTags?: string[];
  notes?: string;
};

export type RitualSeed = { label: string; instruction?: string; optional: true };
export type MenuSeed = { label: string; role: "main" | "side" | "dessert" | "drink" };
export type TaskSeed = { title: string; bucket: Bucket };

export type HolidayPack = {
  id: PackId;
  label: string;
  blurb: string;
  emoji: string;
  respectNote: string;
  bringBoardSeeds: BringSeed[];
  rituals: RitualSeed[];
  suggestedMenu: MenuSeed[];
  taskSeeds: TaskSeed[];
  toneHint: "warm" | "reverent" | "festive" | "playful" | "intimate";
};

const THANKSGIVING: HolidayPack = {
  id: "thanksgiving",
  label: "Thanksgiving",
  blurb: "The classic gather-and-feed. Turkey optional — the table is the point.",
  emoji: "🍁",
  respectNote:
    "Every family does Thanksgiving differently. Nothing here is required. Toggle what fits yours.",
  toneHint: "warm",
  bringBoardSeeds: [
    { category: "Main", label: "Turkey (or main protein)", qty: 1, notes: "Host usually covers" },
    { category: "Sides", label: "Mashed potatoes", qty: 1, unit: "big bowl" },
    { category: "Sides", label: "Stuffing / dressing", qty: 1, unit: "casserole" },
    { category: "Sides", label: "Green bean dish", qty: 1, unit: "casserole", dietaryTags: ["vegetarian"] },
    { category: "Sides", label: "Cranberry sauce", qty: 1, dietaryTags: ["vegan", "gluten-free"] },
    { category: "Sides", label: "Rolls or bread", qty: 12, unit: "pieces" },
    { category: "Sides", label: "Salad", qty: 1, unit: "big bowl", dietaryTags: ["vegetarian"] },
    { category: "Dessert", label: "Pumpkin pie", qty: 1 },
    { category: "Dessert", label: "Apple pie or crisp", qty: 1 },
    { category: "Drinks", label: "Wine (red)", qty: 2, unit: "bottles" },
    { category: "Drinks", label: "Wine (white)", qty: 2, unit: "bottles" },
    { category: "Drinks", label: "Sparkling cider (kid-friendly)", qty: 1, unit: "bottle" },
    { category: "Ice / Serveware", label: "Bag of ice", qty: 2, unit: "bags" },
    { category: "Kids", label: "Coloring pages / craft", qty: 1, unit: "set" },
  ],
  rituals: [
    { label: "Go around the table — one thing each person is grateful for", optional: true },
    { label: "Set an empty seat for someone who couldn't be there", optional: true },
    { label: "Post-meal walk before dessert", optional: true },
  ],
  suggestedMenu: [
    { label: "Turkey with pan gravy", role: "main" },
    { label: "Mashed potatoes", role: "side" },
    { label: "Stuffing", role: "side" },
    { label: "Roasted vegetables", role: "side" },
    { label: "Cranberry sauce", role: "side" },
    { label: "Pumpkin pie", role: "dessert" },
    { label: "Sparkling cider", role: "drink" },
  ],
  taskSeeds: [
    { title: "Confirm headcount and dietary needs", bucket: "3-5 weeks" },
    { title: "Order or reserve the turkey / main", bucket: "3-5 weeks" },
    { title: "Assign potluck dishes on the Bring Board", bucket: "1-2 weeks" },
    { title: "Buy wine, sparkling cider, and ice", bucket: "Party week" },
    { title: "Brine turkey (if brining)", bucket: "Party week" },
    { title: "Set the table + centerpiece", bucket: "Day of" },
    { title: "Preheat oven early — coordinate reheat slots", bucket: "Day of" },
    { title: "Carve turkey and plate warm", bucket: "Day of" },
  ],
};

const FRIENDSGIVING: HolidayPack = {
  ...THANKSGIVING,
  id: "friendsgiving",
  label: "Friendsgiving",
  blurb: "Chosen family, potluck-first, less pressure than the big one.",
  toneHint: "playful",
  bringBoardSeeds: THANKSGIVING.bringBoardSeeds.map((b) =>
    b.label.startsWith("Turkey") ? { ...b, notes: "Anyone brave? Or swap for a big lasagna." } : b,
  ),
  rituals: [
    { label: "Everyone shares the story of their dish", optional: true },
    { label: "Group photo before we eat", optional: true },
    { label: "Board game or movie after", optional: true },
  ],
};

// Lighter scaffolds for the rest — same shape, respectful defaults, hosts fill in.
function stub(id: PackId, label: string, emoji: string, blurb: string, tone: HolidayPack["toneHint"]): HolidayPack {
  return {
    id, label, emoji, blurb, toneHint: tone,
    respectNote:
      `Every household observes ${label} differently. Nothing here is prescriptive. Keep, edit, or remove any item.`,
    bringBoardSeeds: [
      { category: "Main", label: "Main dish", qty: 1 },
      { category: "Sides", label: "Side dish", qty: 2 },
      { category: "Dessert", label: "Dessert", qty: 1 },
      { category: "Drinks", label: "Drinks", qty: 2, unit: "bottles" },
    ],
    rituals: [],
    suggestedMenu: [],
    taskSeeds: [
      { title: `Confirm ${label} guest list and dietary needs`, bucket: "3-5 weeks" },
      { title: "Plan the menu", bucket: "1-2 weeks" },
      { title: "Shop and prep", bucket: "Party week" },
      { title: "Set the table", bucket: "Day of" },
    ],
  };
}

export const PACKS: Record<PackId, HolidayPack> = {
  thanksgiving: THANKSGIVING,
  friendsgiving: FRIENDSGIVING,
  shabbat: stub("shabbat", "Shabbat Dinner", "🕯️",
    "A weekly pause. Light candles, break bread, be together.", "reverent"),
  hanukkah: stub("hanukkah", "Hanukkah", "🕎",
    "Eight nights of light. Latkes, sufganiyot, and family.", "warm"),
  christmas: stub("christmas", "Christmas", "🎄",
    "The big one. Feed the family, protect the calm.", "festive"),
  passover: stub("passover", "Passover Seder", "📜",
    "The retelling. Structured, meaningful, long. Plan the pacing.", "reverent"),
  easter: stub("easter", "Easter", "🐣",
    "Brunch energy. Ham or lamb, spring sides, kids running.", "warm"),
  diwali: stub("diwali", "Diwali", "🪔",
    "Festival of lights. Diyas, sweets, and open homes.", "festive"),
  eid: stub("eid", "Eid", "🌙",
    "The joyful reunion after the fast. Feast and welcome.", "warm"),
  "lunar-new-year": stub("lunar-new-year", "Lunar New Year", "🧧",
    "Reunion dinner. Symbolic dishes, red envelopes, fresh start.", "festive"),
};

export function listPacks(): HolidayPack[] {
  return Object.values(PACKS);
}

export function getPack(id: string | undefined | null): HolidayPack | undefined {
  if (!id) return undefined;
  return PACKS[id as PackId];
}

/** Detect a pack from free text — used by talk brain to *propose* (never auto-apply). */
export function detectPack(text: string): HolidayPack | undefined {
  const t = text.toLowerCase();
  if (/\bfriendsgiving\b/.test(t)) return PACKS.friendsgiving;
  if (/\bthanksgiving\b|\bturkey day\b/.test(t)) return PACKS.thanksgiving;
  if (/\bshabbat\b|\bshabbos\b/.test(t)) return PACKS.shabbat;
  if (/\bhanukkah\b|\bchanukah\b/.test(t)) return PACKS.hanukkah;
  if (/\bchristmas\b|\bxmas\b/.test(t)) return PACKS.christmas;
  if (/\bpassover\b|\bseder\b/.test(t)) return PACKS.passover;
  if (/\beaster\b/.test(t)) return PACKS.easter;
  if (/\bdiwali\b/.test(t)) return PACKS.diwali;
  if (/\beid\b/.test(t)) return PACKS.eid;
  if (/\blunar new year\b|\bchinese new year\b/.test(t)) return PACKS["lunar-new-year"];
  return undefined;
}

/** Materialize pack task seeds into Party.tasks entries. Caller assigns ids/done state. */
export function packTasks(pack: HolidayPack, mkId: () => string): Task[] {
  return pack.taskSeeds.map((s) => ({ id: mkId(), title: s.title, bucket: s.bucket, done: false }));
}

/** Materialize the bring board seeds into party.bring_board jsonb rows. */
export function packBringBoard(pack: HolidayPack, mkId: () => string) {
  return pack.bringBoardSeeds.map((s) => ({
    id: mkId(),
    category: s.category,
    label: s.label,
    qty: s.qty,
    unit: s.unit,
    dietaryTags: s.dietaryTags ?? [],
    status: "open" as const,
    source: "host" as const,
    notes: s.notes,
  }));
}

export function packOccasion(pack: HolidayPack): OccasionType {
  // All packs currently map to the generic "holiday" occasion.
  return "holiday";
}
