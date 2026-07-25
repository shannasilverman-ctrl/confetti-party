// Holiday packs — culturally respectful, opt-in seeds for gatherings.
// Every ritual and menu item is optional. Hosts choose what to keep.

import type { OccasionType, Bucket, Task } from "./party-context";

export type PackId =
  | "generic"
  | "thanksgiving"
  | "friendsgiving"
  | "shabbat"
  | "hanukkah"
  | "christmas"
  | "new-years"
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
    {
      category: "Sides",
      label: "Green bean dish",
      qty: 1,
      unit: "casserole",
      dietaryTags: ["vegetarian"],
    },
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
// Each pack ships distinct bring-board and menu seeds so seeding produces a
// useful starting point, not a duplicate placeholder. Rituals stay empty by
// default (opt-in) unless a widely shared secular expectation exists.
function pack(
  id: PackId,
  label: string,
  emoji: string,
  blurb: string,
  tone: HolidayPack["toneHint"],
  bringBoardSeeds: BringSeed[],
  suggestedMenu: MenuSeed[] = [],
  taskExtras: TaskSeed[] = [],
): HolidayPack {
  return {
    id,
    label,
    emoji,
    blurb,
    toneHint: tone,
    respectNote: `Every household observes ${label} differently. Nothing here is prescriptive. Keep, edit, or remove any item.`,
    bringBoardSeeds,
    rituals: [],
    suggestedMenu,
    taskSeeds: [
      { title: `Confirm ${label} guest list and dietary needs`, bucket: "3-5 weeks" },
      { title: "Plan the menu", bucket: "1-2 weeks" },
      { title: "Shop and prep", bucket: "Party week" },
      { title: "Set the table", bucket: "Day of" },
      ...taskExtras,
    ],
  };
}

// Tradition-neutral starter — no culturally specific rituals or menu.
// Every seed is generic ("main dish", "side", "dessert") and fully editable,
// so a host who doesn't want any tradition still gets a working checklist +
// bring board on day one instead of a blank workspace.
const GENERIC_HOLIDAY: HolidayPack = {
  id: "generic",
  label: "Holiday Gathering",
  blurb: "Tradition-neutral starter. Nothing assumed, everything editable.",
  emoji: "🎉",
  respectNote:
    "This starter avoids any specific tradition. Rename, swap, or remove anything — it's a working shell, not a script.",
  toneHint: "warm",
  bringBoardSeeds: [
    { category: "Main", label: "Main dish", qty: 1, notes: "Host usually covers" },
    { category: "Sides", label: "Side dish", qty: 2, unit: "dishes" },
    { category: "Sides", label: "Salad", qty: 1, unit: "big bowl", dietaryTags: ["vegetarian"] },
    { category: "Sides", label: "Bread or rolls", qty: 1, unit: "basket" },
    { category: "Dessert", label: "Dessert", qty: 1 },
    { category: "Drinks", label: "Wine or non-alcoholic drink", qty: 2, unit: "bottles" },
    { category: "Drinks", label: "Sparkling water", qty: 1, unit: "bottle" },
    { category: "Ice / Serveware", label: "Bag of ice", qty: 1, unit: "bag" },
  ],
  rituals: [{ label: "Toast at the start of the meal", optional: true }],
  suggestedMenu: [
    { label: "Main dish", role: "main" },
    { label: "Two sides", role: "side" },
    { label: "Dessert", role: "dessert" },
    { label: "Sparkling water", role: "drink" },
  ],
  taskSeeds: [
    { title: "Confirm headcount and dietary needs", bucket: "3-5 weeks" },
    { title: "Send the invite with time and location", bucket: "3-5 weeks" },
    { title: "Assign dishes on the Bring Board", bucket: "1-2 weeks" },
    { title: "Grocery run for what the host is covering", bucket: "Party week" },
    { title: "Set the table", bucket: "Day of" },
    { title: "Chill drinks and put out ice", bucket: "Day of" },
  ],
};

export const PACKS: Record<PackId, HolidayPack> = {
  generic: GENERIC_HOLIDAY,
  thanksgiving: THANKSGIVING,
  friendsgiving: FRIENDSGIVING,
  shabbat: pack(
    "shabbat",
    "Shabbat Dinner",
    "🕯️",
    "A weekly pause. Light candles, break bread, be together.",
    "reverent",
    [
      { category: "Main", label: "Main protein (chicken, brisket, or fish)", qty: 1 },
      {
        category: "Sides",
        label: "Roasted vegetables",
        qty: 1,
        unit: "tray",
        dietaryTags: ["vegetarian"],
      },
      {
        category: "Sides",
        label: "Rice or grain",
        qty: 1,
        unit: "bowl",
        dietaryTags: ["vegetarian"],
      },
      { category: "Sides", label: "Challah", qty: 2, unit: "loaves" },
      { category: "Dessert", label: "Fruit or babka", qty: 1 },
      { category: "Drinks", label: "Kiddush wine or grape juice", qty: 1, unit: "bottle" },
    ],
    [
      { label: "Chicken or brisket", role: "main" },
      { label: "Challah", role: "side" },
      { label: "Seasonal vegetables", role: "side" },
    ],
    [{ title: "Pick up challah and wine", bucket: "Party week" }],
  ),
  hanukkah: pack(
    "hanukkah",
    "Hanukkah",
    "🕎",
    "Eight nights of light. Latkes, sufganiyot, and family.",
    "warm",
    [
      { category: "Main", label: "Brisket or roast chicken", qty: 1 },
      {
        category: "Sides",
        label: "Latkes (potato pancakes)",
        qty: 24,
        unit: "pieces",
        dietaryTags: ["vegetarian"],
      },
      { category: "Sides", label: "Applesauce", qty: 1, unit: "bowl", dietaryTags: ["vegan"] },
      {
        category: "Sides",
        label: "Sour cream",
        qty: 1,
        unit: "container",
        dietaryTags: ["vegetarian"],
      },
      { category: "Dessert", label: "Sufganiyot (jelly donuts)", qty: 12, unit: "pieces" },
      { category: "Drinks", label: "Wine or sparkling", qty: 2, unit: "bottles" },
      { category: "Kids", label: "Dreidels & chocolate gelt", qty: 1, unit: "set" },
    ],
    [
      { label: "Latkes", role: "side" },
      { label: "Brisket", role: "main" },
      { label: "Sufganiyot", role: "dessert" },
    ],
    [{ title: "Set up the menorah and candles", bucket: "Day of" }],
  ),
  christmas: pack(
    "christmas",
    "Christmas",
    "🎄",
    "The big one. Feed the family, protect the calm.",
    "festive",
    [
      {
        category: "Main",
        label: "Roast (ham, turkey, or beef)",
        qty: 1,
        notes: "Host usually covers",
      },
      {
        category: "Sides",
        label: "Roast potatoes",
        qty: 1,
        unit: "tray",
        dietaryTags: ["vegetarian"],
      },
      {
        category: "Sides",
        label: "Green vegetable side",
        qty: 1,
        unit: "dish",
        dietaryTags: ["vegetarian"],
      },
      { category: "Sides", label: "Stuffing", qty: 1, unit: "casserole" },
      { category: "Sides", label: "Rolls or bread", qty: 12, unit: "pieces" },
      { category: "Dessert", label: "Pie, yule log, or Christmas pudding", qty: 1 },
      { category: "Dessert", label: "Cookie plate", qty: 1, unit: "tray" },
      { category: "Drinks", label: "Wine", qty: 3, unit: "bottles" },
      { category: "Drinks", label: "Sparkling cider (kid-friendly)", qty: 1, unit: "bottle" },
      { category: "Kids", label: "Craft or activity kit", qty: 1, unit: "set" },
    ],
    [
      { label: "Holiday roast", role: "main" },
      { label: "Roast potatoes", role: "side" },
      { label: "Pie or pudding", role: "dessert" },
    ],
  ),
  "new-years": pack(
    "new-years",
    "New Year's Eve",
    "🥂",
    "Count down together. Bubbles, snacks, one last toast to the year.",
    "festive",
    [
      { category: "Drinks", label: "Champagne or sparkling wine", qty: 3, unit: "bottles" },
      { category: "Drinks", label: "Non-alcoholic sparkling", qty: 2, unit: "bottles" },
      { category: "Sides", label: "Cheese and charcuterie board", qty: 1, unit: "large board" },
      { category: "Sides", label: "Finger foods / small bites", qty: 3, unit: "trays" },
      { category: "Dessert", label: "Midnight dessert bites", qty: 1, unit: "platter" },
      { category: "Décor", label: "Noise-makers & party hats", qty: 1, unit: "set" },
    ],
    [
      { label: "Sparkling wine", role: "drink" },
      { label: "Charcuterie board", role: "side" },
      { label: "Midnight bites", role: "dessert" },
    ],
    [
      { title: "Chill the champagne", bucket: "Day of" },
      { title: "Queue the countdown stream / playlist", bucket: "Day of" },
    ],
  ),
  passover: pack(
    "passover",
    "Passover Seder",
    "📜",
    "The retelling. Structured, meaningful, long. Plan the pacing.",
    "reverent",
    [
      { category: "Main", label: "Brisket or roast chicken", qty: 1 },
      { category: "Sides", label: "Matzo ball soup", qty: 1, unit: "pot" },
      {
        category: "Sides",
        label: "Roasted vegetables",
        qty: 1,
        unit: "tray",
        dietaryTags: ["vegan"],
      },
      { category: "Sides", label: "Charoset", qty: 1, unit: "bowl", dietaryTags: ["vegan"] },
      { category: "Sides", label: "Matzo", qty: 2, unit: "boxes" },
      {
        category: "Dessert",
        label: "Flourless chocolate cake or macaroons",
        qty: 1,
        dietaryTags: ["gluten-free"],
      },
      { category: "Drinks", label: "Kosher wine or grape juice", qty: 3, unit: "bottles" },
    ],
    [
      { label: "Matzo ball soup", role: "side" },
      { label: "Brisket", role: "main" },
      { label: "Flourless chocolate cake", role: "dessert" },
    ],
    [{ title: "Print or set out Haggadahs", bucket: "Party week" }],
  ),
  easter: pack(
    "easter",
    "Easter",
    "🐣",
    "Brunch energy. Ham or lamb, spring sides, kids running.",
    "warm",
    [
      { category: "Main", label: "Ham or leg of lamb", qty: 1 },
      {
        category: "Sides",
        label: "Spring salad",
        qty: 1,
        unit: "bowl",
        dietaryTags: ["vegetarian"],
      },
      {
        category: "Sides",
        label: "Deviled eggs",
        qty: 12,
        unit: "pieces",
        dietaryTags: ["gluten-free"],
      },
      {
        category: "Sides",
        label: "Roasted asparagus or carrots",
        qty: 1,
        unit: "tray",
        dietaryTags: ["vegan"],
      },
      { category: "Dessert", label: "Carrot cake or hot cross buns", qty: 1 },
      { category: "Drinks", label: "Mimosas / sparkling", qty: 2, unit: "bottles" },
      { category: "Kids", label: "Egg hunt supplies", qty: 1, unit: "set" },
    ],
    [
      { label: "Ham or lamb", role: "main" },
      { label: "Deviled eggs", role: "side" },
      { label: "Carrot cake", role: "dessert" },
    ],
  ),
  diwali: pack(
    "diwali",
    "Diwali",
    "🪔",
    "Festival of lights. Diyas, sweets, and open homes.",
    "festive",
    [
      { category: "Main", label: "Paneer or chicken curry", qty: 1, unit: "large dish" },
      { category: "Sides", label: "Dal", qty: 1, unit: "pot", dietaryTags: ["vegan"] },
      {
        category: "Sides",
        label: "Basmati rice",
        qty: 1,
        unit: "large pot",
        dietaryTags: ["vegan"],
      },
      {
        category: "Sides",
        label: "Naan or roti",
        qty: 12,
        unit: "pieces",
        dietaryTags: ["vegetarian"],
      },
      {
        category: "Sides",
        label: "Chutneys & pickles",
        qty: 2,
        unit: "jars",
        dietaryTags: ["vegan"],
      },
      {
        category: "Dessert",
        label: "Mithai (Indian sweets) — gulab jamun, barfi, ladoo",
        qty: 1,
        unit: "box",
      },
      { category: "Drinks", label: "Chai / masala chai supplies", qty: 1, unit: "batch" },
      { category: "Décor", label: "Diyas or tealights", qty: 12, unit: "pieces" },
    ],
    [
      { label: "Curry (paneer or chicken)", role: "main" },
      { label: "Dal & rice", role: "side" },
      { label: "Mithai", role: "dessert" },
    ],
  ),
  eid: pack(
    "eid",
    "Eid",
    "🌙",
    "The joyful reunion after the fast. Feast and welcome.",
    "warm",
    [
      { category: "Main", label: "Biryani or roast lamb", qty: 1, unit: "large dish" },
      { category: "Sides", label: "Kebabs (chicken or seekh)", qty: 12, unit: "pieces" },
      {
        category: "Sides",
        label: "Salad / raita",
        qty: 1,
        unit: "bowl",
        dietaryTags: ["vegetarian"],
      },
      {
        category: "Sides",
        label: "Naan or pita",
        qty: 12,
        unit: "pieces",
        dietaryTags: ["vegetarian"],
      },
      { category: "Dessert", label: "Sheer khurma / baklava / kheer", qty: 1, unit: "tray" },
      {
        category: "Dessert",
        label: "Dates & fruit platter",
        qty: 1,
        unit: "platter",
        dietaryTags: ["vegan"],
      },
      { category: "Drinks", label: "Mango lassi or rose sharbat", qty: 1, unit: "pitcher" },
    ],
    [
      { label: "Biryani", role: "main" },
      { label: "Kebabs", role: "side" },
      { label: "Sheer khurma / baklava", role: "dessert" },
    ],
  ),
  "lunar-new-year": pack(
    "lunar-new-year",
    "Lunar New Year",
    "🧧",
    "Reunion dinner. Symbolic dishes, red envelopes, fresh start.",
    "festive",
    [
      {
        category: "Main",
        label: "Whole fish (steamed)",
        qty: 1,
        notes: "Symbolizes abundance — leave head & tail",
      },
      { category: "Main", label: "Whole chicken or roast duck", qty: 1 },
      { category: "Sides", label: "Dumplings", qty: 24, unit: "pieces" },
      { category: "Sides", label: "Longevity noodles", qty: 1, unit: "large dish" },
      { category: "Sides", label: "Rice", qty: 1, unit: "large pot", dietaryTags: ["vegan"] },
      {
        category: "Sides",
        label: "Stir-fried greens",
        qty: 1,
        unit: "dish",
        dietaryTags: ["vegan"],
      },
      { category: "Dessert", label: "Nian gao (sticky rice cake) or tangyuan", qty: 1 },
      {
        category: "Dessert",
        label: "Oranges & mandarins",
        qty: 8,
        unit: "pieces",
        dietaryTags: ["vegan"],
      },
      { category: "Drinks", label: "Tea service", qty: 1, unit: "pot" },
      { category: "Décor", label: "Red envelopes (hongbao)", qty: 10, unit: "pieces" },
    ],
    [
      { label: "Whole steamed fish", role: "main" },
      { label: "Dumplings", role: "side" },
      { label: "Longevity noodles", role: "side" },
      { label: "Nian gao", role: "dessert" },
    ],
  ),
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

/**
 * Curated Holiday starter list surfaced in the New Party wizard.
 * Every starter, including "generic", maps to a real HolidayPack so the
 * checklist and Bring Board are seeded and immediately editable. No
 * starter is a true blank; the neutral GENERIC_HOLIDAY pack is the
 * tradition-free default.
 */
export type HolidayStarterId = PackId;

export type HolidayStarter = {
  id: HolidayStarterId;
  label: string;
  emoji: string;
  blurb: string;
  /** Suggested (editable) party name when the starter is picked. */
  suggestedName: string;
};

export const HOLIDAY_STARTERS: HolidayStarter[] = [
  {
    id: "generic",
    label: "Generic Holiday",
    emoji: "🎉",
    blurb: "Tradition-neutral starter. Seeds a basic checklist + bring board.",
    suggestedName: "Holiday Gathering",
  },
  {
    id: "thanksgiving",
    label: "Thanksgiving",
    emoji: "🍁",
    blurb: "The classic gather-and-feed.",
    suggestedName: "Thanksgiving Dinner",
  },
  {
    id: "hanukkah",
    label: "Hanukkah",
    emoji: "🕎",
    blurb: "Latkes, sufganiyot, candles.",
    suggestedName: "Hanukkah Night",
  },
  {
    id: "christmas",
    label: "Christmas",
    emoji: "🎄",
    blurb: "Feed the family, protect the calm.",
    suggestedName: "Christmas Dinner",
  },
  {
    id: "new-years",
    label: "New Year's",
    emoji: "🥂",
    blurb: "Countdown, bubbles, one last toast.",
    suggestedName: "New Year's Eve",
  },
  {
    id: "shabbat",
    label: "Shabbat / Holiday Dinner",
    emoji: "🕯️",
    blurb: "A weekly pause. Light candles, break bread.",
    suggestedName: "Shabbat Dinner",
  },
];

const HOLIDAY_STARTER_IDS: ReadonlySet<HolidayStarterId> = new Set(
  HOLIDAY_STARTERS.map((s) => s.id),
);

/** Runtime-safe narrowing: unknown values become undefined instead of crashing. */
export function toHolidayStarterId(id: unknown): HolidayStarterId | undefined {
  return typeof id === "string" && HOLIDAY_STARTER_IDS.has(id as HolidayStarterId)
    ? (id as HolidayStarterId)
    : undefined;
}

export function getStarter(id: string | undefined | null): HolidayStarter | undefined {
  const narrowed = toHolidayStarterId(id);
  return narrowed ? HOLIDAY_STARTERS.find((s) => s.id === narrowed) : undefined;
}

/**
 * Map a starter selection to its holiday pack. Every listed starter has a
 * pack, so an unknown/absent id returns undefined and no seeding happens.
 */
export function starterPack(id: HolidayStarterId | undefined | null): HolidayPack | undefined {
  if (!id) return undefined;
  return PACKS[id];
}
