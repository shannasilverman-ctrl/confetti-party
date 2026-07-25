import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "./auth";
import {
  generateShoppingItems,
  type ShoppingItem,
  type ShoppingCategoryName,
  type Retailer,
} from "./shopping";
import type { Theme } from "./themes";
import {
  starterPack,
  packTasks,
  packBringBoard,
  toHolidayStarterId,
  type HolidayStarterId,
} from "./holiday-packs";

export type OccasionType =
  | "birthday"
  | "baby-shower"
  | "graduation"
  | "holiday"
  | "dinner-party"
  | "game-day"
  | "cookout"
  | "other";

export type RSVP = "invited" | "yes" | "no" | "maybe";

export type Bucket = "6+ weeks out" | "3-5 weeks" | "1-2 weeks" | "Party week" | "Day of";

export const BUCKETS: Bucket[] = ["6+ weeks out", "3-5 weeks", "1-2 weeks", "Party week", "Day of"];

export type Task = { id: string; title: string; bucket: Bucket; done: boolean };
export type Guest = {
  id: string;
  name: string;
  kind: "adult" | "kid";
  rsvp: RSVP;
  source?: "link";
  household?: string;
  dietary?: string[];
  allergens?: string[];
};

export type Household = { id: string; label: string; memberGuestIds: string[] };

export type BringCategory =
  | "Main"
  | "Sides"
  | "Dessert"
  | "Drinks"
  | "Ice / Serveware"
  | "Kids"
  | "Décor";

export type BringItem = {
  id: string;
  category: BringCategory;
  label: string;
  qty: number;
  unit?: string;
  dietaryTags?: string[];
  status: "open" | "claimed" | "done";
  source: "host" | "guest";
  assigneeName?: string;
  assigneeHousehold?: string;
  claimedAt?: string;
  notes?: string;
};

export type HostUpdate = { id: string; text: string; at: string };
export type PhotoDropInfo = import("./photo-drop").PhotoDrop;
export type Expense = { id: string; label: string; amount: number };
export type BudgetCategory = {
  id: string;
  name: string;
  planned: number;
  expenses: Expense[];
};
export type TimelineItem = { id: string; time: string; activity: string };

export type Party = {
  id: string;
  name: string;
  occasion: OccasionType;
  date: string; // ISO date
  startTime?: string; // e.g. "2:00 PM"
  location?: string;
  guestEstimate: number;
  budget: number;
  theme: string; // display name
  themeId?: string; // links to THEMES catalog
  rsvpToken?: string;
  tasks: Task[];
  guests: Guest[];
  budgetCategories: BudgetCategory[];
  timeline: TimelineItem[];
  shoppingItems: ShoppingItem[];
  pinnedInspiration: string[]; // e.g. ["unicorn-rainbow:table"]
  hostNote?: string;
  households?: Household[];
  bringBoard?: BringItem[];
  hostUpdates?: HostUpdate[];
  holidayPackId?: string;
  photoDrop?: PhotoDropInfo | null;
  checkins?: Record<string, string>; // guestId -> ISO timestamp
  retrospective?: PartyRetrospective | null;
  /** Optional cinematic banner image URL, seeded on curated samples only. */
  heroImageUrl?: string;
  /** Server-known optimistic concurrency token (updated_at). Not user-visible. */
  updatedAt?: string;
};

export type PartyRetrospective = {
  updatedAt: string;
  worked?: string;
  ranOut?: string;
  changeNext?: string;
};

const uid = () => Math.random().toString(36).slice(2, 10);

const DEFAULT_CATEGORIES = (): BudgetCategory[] => [
  { id: uid(), name: "Venue", planned: 100, expenses: [] },
  { id: uid(), name: "Food & Drink", planned: 200, expenses: [] },
  { id: uid(), name: "Cake & Desserts", planned: 80, expenses: [] },
  { id: uid(), name: "Decorations", planned: 100, expenses: [] },
  { id: uid(), name: "Entertainment", planned: 80, expenses: [] },
  { id: uid(), name: "Favors", planned: 40, expenses: [] },
];

const TASK_TEMPLATES: Record<OccasionType, Array<{ title: string; bucket: Bucket }>> = {
  birthday: [
    { title: "Pick a theme and color palette", bucket: "6+ weeks out" },
    { title: "Book venue or reserve backyard time", bucket: "6+ weeks out" },
    { title: "Send save-the-dates", bucket: "6+ weeks out" },
    { title: "Finalize guest list and send invites", bucket: "3-5 weeks" },
    { title: "Order cake and desserts", bucket: "3-5 weeks" },
    { title: "Plan menu and shopping list", bucket: "1-2 weeks" },
    { title: "Buy decorations and party favors", bucket: "1-2 weeks" },
    { title: "Confirm RSVPs", bucket: "Party week" },
    { title: "Prep playlist and games", bucket: "Party week" },
    { title: "Pick up cake", bucket: "Day of" },
    { title: "Set up decorations", bucket: "Day of" },
    { title: "Have fun and take photos", bucket: "Day of" },
  ],
  "baby-shower": [
    { title: "Choose theme and venue", bucket: "6+ weeks out" },
    { title: "Send invitations", bucket: "3-5 weeks" },
    { title: "Plan games and activities", bucket: "1-2 weeks" },
    { title: "Order cake", bucket: "1-2 weeks" },
    { title: "Confirm RSVPs", bucket: "Party week" },
    { title: "Set up space", bucket: "Day of" },
  ],
  graduation: [
    { title: "Reserve backyard or venue", bucket: "6+ weeks out" },
    { title: "Send invites", bucket: "3-5 weeks" },
    { title: "Plan menu (BBQ, sides, drinks)", bucket: "1-2 weeks" },
    { title: "Order grad cake", bucket: "1-2 weeks" },
    { title: "Grocery run", bucket: "Party week" },
    { title: "Confirm RSVPs", bucket: "Party week" },
    { title: "Fire up the grill", bucket: "Day of" },
    { title: "Set up photo backdrop", bucket: "Day of" },
  ],
  holiday: [
    { title: "Set the guest list", bucket: "3-5 weeks" },
    { title: "Send invites", bucket: "3-5 weeks" },
    { title: "Plan menu", bucket: "1-2 weeks" },
    { title: "Grocery shopping", bucket: "Party week" },
    { title: "Decorate", bucket: "Day of" },
  ],
  "dinner-party": [
    { title: "Set menu and shopping list", bucket: "1-2 weeks" },
    { title: "Send invites", bucket: "1-2 weeks" },
    { title: "Grocery shopping", bucket: "Party week" },
    { title: "Prep what you can ahead", bucket: "Party week" },
    { title: "Set the table", bucket: "Day of" },
    { title: "Cook", bucket: "Day of" },
  ],
  "game-day": [
    { title: "Pick the game and set the time", bucket: "3-5 weeks" },
    { title: "Invite the crew and share the link", bucket: "3-5 weeks" },
    { title: "Confirm the stream or channel works", bucket: "1-2 weeks" },
    { title: "Plan the snack lineup", bucket: "1-2 weeks" },
    { title: "Order or plan wings, chili, dips", bucket: "Party week" },
    { title: "Stock drinks and grab extra ice", bucket: "Party week" },
    { title: "Test the TV, sound, and seating", bucket: "Day of" },
    { title: "Chill drinks and set out snacks", bucket: "Day of" },
    { title: "Get halftime food ready", bucket: "Day of" },
  ],
  cookout: [
    { title: "Set the date and guest list", bucket: "3-5 weeks" },
    { title: "Send the invite", bucket: "3-5 weeks" },
    { title: "Plan the menu (proteins, sides, dessert)", bucket: "1-2 weeks" },
    { title: "Clean and check the grill", bucket: "1-2 weeks" },
    { title: "Propane / charcoal run", bucket: "Party week" },
    { title: "Grocery run — meat, buns, sides, ice", bucket: "Party week" },
    { title: "Marinate and prep proteins", bucket: "Party week" },
    { title: "Set up shade, seating, and drinks cooler", bucket: "Day of" },
    { title: "Fire up the grill", bucket: "Day of" },
    { title: "Set out bug spray and sunscreen", bucket: "Day of" },
  ],
  other: [
    { title: "Confirm date and venue", bucket: "6+ weeks out" },
    { title: "Send invites", bucket: "3-5 weeks" },
    { title: "Plan food and drink", bucket: "1-2 weeks" },
    { title: "Confirm RSVPs", bucket: "Party week" },
    { title: "Set up", bucket: "Day of" },
  ],
};

// Occasion-aware default budget categories.
function defaultCategoriesFor(occasion: OccasionType): BudgetCategory[] {
  if (occasion === "game-day") {
    return [
      { id: uid(), name: "Food & Snacks", planned: 120, expenses: [] },
      { id: uid(), name: "Drinks & Bar", planned: 100, expenses: [] },
      { id: uid(), name: "Paper Goods & Setup", planned: 40, expenses: [] },
      { id: uid(), name: "Décor", planned: 40, expenses: [] },
    ];
  }
  if (occasion === "cookout") {
    return [
      { id: uid(), name: "Grill & Food", planned: 200, expenses: [] },
      { id: uid(), name: "Drinks & Bar", planned: 100, expenses: [] },
      { id: uid(), name: "Sides & Dessert", planned: 80, expenses: [] },
      { id: uid(), name: "Paper Goods & Setup", planned: 50, expenses: [] },
      { id: uid(), name: "Décor", planned: 40, expenses: [] },
    ];
  }
  return DEFAULT_CATEGORIES();
}

// Seed-only helper: builds a timeline around a game-day kickoff time
// (e.g. "4:00 PM"). No persisted anchor — later edits are manual.
function seedGameDayTimeline(kickoff: string): TimelineItem[] {
  const match = kickoff.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return [];
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const mer = match[3].toUpperCase();
  if (isNaN(hour) || isNaN(minute) || hour < 1 || hour > 12 || minute > 59) return [];
  if (mer === "PM" && hour !== 12) hour += 12;
  if (mer === "AM" && hour === 12) hour = 0;
  const baseMin = hour * 60 + minute;
  const fmt = (totalMin: number) => {
    const m = ((totalMin % (24 * 60)) + 24 * 60) % (24 * 60);
    let h = Math.floor(m / 60);
    const mm = m % 60;
    const am = h < 12 ? "AM" : "PM";
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${mm.toString().padStart(2, "0")} ${am}`;
  };
  const steps: Array<[number, string]> = [
    [-60, "Doors open, drinks out"],
    [-30, "Snacks and apps on the table"],
    [0, "Kickoff — game on"],
    [60, "Halftime — hot food out"],
    [120, "Full time — dessert and wind-down"],
  ];
  return steps.map(([offset, activity]) => ({
    id: uid(),
    time: fmt(baseMin + offset),
    activity,
  }));
}

export function generateTasks(occasion: OccasionType, dateISO: string): Task[] {
  const template = TASK_TEMPLATES[occasion] ?? TASK_TEMPLATES.other;
  const weeks = Math.max(
    0,
    Math.floor((new Date(dateISO).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7)),
  );
  const allowedFrom = (b: Bucket): boolean => {
    if (b === "6+ weeks out") return weeks >= 6;
    if (b === "3-5 weeks") return weeks >= 3;
    if (b === "1-2 weeks") return weeks >= 1;
    return true;
  };
  return template
    .filter((t) => allowedFrom(t.bucket))
    .map((t) => ({ id: uid(), title: t.title, bucket: t.bucket, done: false }));
}

// ---- Seed demo parties ----

function seedMaya(): Party {
  const date = "2026-08-15";
  const tasks = generateTasks("birthday", date).map((t, i) => ({
    ...t,
    done: i < 4,
  }));
  const guests: Guest[] = [
    { id: uid(), name: "Maya (guest of honor)", kind: "kid", rsvp: "yes" },
    { id: uid(), name: "Sofia Chen", kind: "kid", rsvp: "yes" },
    { id: uid(), name: "Liam Patel", kind: "kid", rsvp: "yes" },
    { id: uid(), name: "Aria Johnson", kind: "kid", rsvp: "yes" },
    { id: uid(), name: "Noah Kim", kind: "kid", rsvp: "yes" },
    { id: uid(), name: "Emma Rivera", kind: "kid", rsvp: "yes" },
    { id: uid(), name: "Jack Nguyen", kind: "kid", rsvp: "yes" },
    { id: uid(), name: "Zoe Williams", kind: "kid", rsvp: "maybe" },
    { id: uid(), name: "Mila Rossi", kind: "kid", rsvp: "maybe" },
    { id: uid(), name: "Ethan Brooks", kind: "kid", rsvp: "invited" },
    { id: uid(), name: "Ava Thompson", kind: "kid", rsvp: "invited" },
    { id: uid(), name: "Sarah Chen (mom)", kind: "adult", rsvp: "yes" },
    { id: uid(), name: "David Chen (dad)", kind: "adult", rsvp: "yes" },
    { id: uid(), name: "Priya Patel", kind: "adult", rsvp: "yes" },
    { id: uid(), name: "Marcus Johnson", kind: "adult", rsvp: "yes" },
    { id: uid(), name: "Elena Rossi", kind: "adult", rsvp: "maybe" },
    { id: uid(), name: "James Brooks", kind: "adult", rsvp: "invited" },
    { id: uid(), name: "Nina Thompson", kind: "adult", rsvp: "invited" },
  ];
  const balloonExpId = uid();
  const tablewareExpId = uid();
  const budgetCategories: BudgetCategory[] = [
    { id: uid(), name: "Venue", planned: 50, expenses: [] },
    {
      id: uid(),
      name: "Food & Drink",
      planned: 200,
      expenses: [
        { id: uid(), label: "Costco snacks & drinks", amount: 120 },
        { id: uid(), label: "Pizza order (deposit)", amount: 60 },
      ],
    },
    {
      id: uid(),
      name: "Cake & Desserts",
      planned: 80,
      expenses: [{ id: uid(), label: "Rainbow unicorn cake", amount: 65 }],
    },
    {
      id: uid(),
      name: "Decorations",
      planned: 100,
      expenses: [
        { id: balloonExpId, label: "Rainbow balloon arch", amount: 35 },
        { id: tablewareExpId, label: "Unicorn tableware", amount: 20 },
      ],
    },
    {
      id: uid(),
      name: "Entertainment",
      planned: 120,
      expenses: [{ id: uid(), label: "Face painter deposit", amount: 42 }],
    },
    { id: uid(), name: "Favors", planned: 50, expenses: [] },
  ];
  const timeline: TimelineItem[] = [
    { id: uid(), time: "10:00 AM", activity: "Pick up cake and balloons" },
    { id: uid(), time: "12:00 PM", activity: "Set up backyard & unicorn arch" },
    { id: uid(), time: "1:30 PM", activity: "Guests arrive, welcome drinks" },
    { id: uid(), time: "2:00 PM", activity: "Face painting station opens" },
    { id: uid(), time: "2:45 PM", activity: "Pizza is served" },
    { id: uid(), time: "3:30 PM", activity: "Cake, candles, sing-along" },
    { id: uid(), time: "4:00 PM", activity: "Present opening" },
    { id: uid(), time: "4:30 PM", activity: "Goodbye favors, party wind-down" },
  ];
  // Shopping: mostly generated, but two items are already purchased and
  // link by expense id to the seeded Decorations expenses above so we do
  // NOT double-count them in totalSpent.
  const shoppingItems: ShoppingItem[] = [
    {
      id: uid(),
      name: "Rainbow balloon arch kit",
      category: "Decorations",
      qty: 1,
      estPrice: 35,
      status: "purchased",
      linkedExpenseId: balloonExpId,
      actualPrice: 35,
    },
    {
      id: uid(),
      name: "Unicorn tableware pack",
      category: "Decorations",
      qty: 3,
      estPrice: 7,
      status: "purchased",
      linkedExpenseId: tablewareExpId,
      actualPrice: 20,
    },
    {
      id: uid(),
      name: "Unicorn party favor kits",
      category: "Favors",
      qty: 3,
      estPrice: 8,
      status: "needed",
    },
    {
      id: uid(),
      name: "Iridescent tablecloth",
      category: "Decorations",
      qty: 1,
      estPrice: 15,
      status: "in-cart",
    },
    {
      id: uid(),
      name: "Star fairy lights",
      category: "Decorations",
      qty: 2,
      estPrice: 12,
      status: "needed",
    },
    {
      id: uid(),
      name: "Rainbow confetti",
      category: "Decorations",
      qty: 1,
      estPrice: 6,
      status: "in-cart",
    },
    {
      id: uid(),
      name: "Cotton candy cloud favors",
      category: "Favors",
      qty: 3,
      estPrice: 10,
      status: "needed",
    },
    {
      id: uid(),
      name: "Paper plates and cups",
      category: "Food & Drink",
      qty: 3,
      estPrice: 9,
      status: "needed",
    },
    {
      id: uid(),
      name: "Birthday candles",
      category: "Cake & Desserts",
      qty: 1,
      estPrice: 4,
      status: "needed",
    },
  ];
  return {
    id: "maya-8th",
    name: "Maya's 8th Birthday",
    occasion: "birthday",
    date,
    startTime: "2:00 PM",
    location: "Our backyard",
    guestEstimate: 18,
    budget: 600,
    theme: "Unicorn Rainbow",
    themeId: "unicorn-rainbow",
    tasks,
    guests,
    budgetCategories,
    timeline,
    shoppingItems,
    pinnedInspiration: ["unicorn-rainbow:table", "unicorn-rainbow:decor"],
    hostNote:
      "So excited to celebrate Maya turning 8! Come hungry — pizza at 2:45. Street parking is easy on Elm.",
  };
}

function seedGrad(): Party {
  const date = "2027-06-05";
  const tasks = generateTasks("graduation", date);
  return {
    id: "grad-bbq",
    name: "Backyard Graduation BBQ",
    occasion: "graduation",
    date,
    guestEstimate: 35,
    budget: 900,
    theme: "Backyard Fiesta",
    themeId: "backyard-fiesta",
    tasks,
    guests: [],
    budgetCategories: DEFAULT_CATEGORIES(),
    timeline: [],
    shoppingItems: generateShoppingItems("graduation", "backyard-fiesta", 35),
    pinnedInspiration: [],
  };
}

function seedWorldCup(): Party {
  const date = "2026-07-19";
  const startTime = "10:00 AM";
  const tasks = generateTasks("game-day", date).map((t, i) => ({
    ...t,
    done: i < 2,
  }));
  return {
    id: "world-cup-final-watch",
    name: "World Cup Final Watch Party",
    occasion: "game-day",
    date,
    startTime,
    location: "Our place",
    guestEstimate: 12,
    budget: 250,
    theme: "",
    tasks,
    guests: [],
    budgetCategories: defaultCategoriesFor("game-day"),
    timeline: seedGameDayTimeline(startTime),
    shoppingItems: generateShoppingItems("game-day", undefined, 12),
    pinnedInspiration: [],
  };
}

function seedAvaLiam(): Party {
  const date = "2027-05-22";
  const tasks = generateTasks("other", date).map((t, i) => ({ ...t, done: i < 2 }));
  const guests: Guest[] = [
    { id: uid(), name: "Ava Rossi (bride)", kind: "adult", rsvp: "yes" },
    { id: uid(), name: "Liam Marchetti (groom)", kind: "adult", rsvp: "yes" },
    { id: uid(), name: "Sofia Rossi", kind: "adult", rsvp: "yes" },
    { id: uid(), name: "Matteo Marchetti", kind: "adult", rsvp: "yes" },
    { id: uid(), name: "Giulia Bianchi", kind: "adult", rsvp: "yes" },
    { id: uid(), name: "Elena Conti", kind: "adult", rsvp: "maybe" },
    { id: uid(), name: "Marco Ferrari", kind: "adult", rsvp: "invited" },
  ];
  return {
    id: "ava-liam-wedding",
    name: "Ava & Liam",
    occasion: "other",
    date,
    startTime: "5:30 PM",
    location: "Tenuta di Fiore, Tuscany",
    guestEstimate: 62,
    budget: 12500,
    theme: "Tuscan Vineyard",
    tasks,
    guests,
    budgetCategories: DEFAULT_CATEGORIES(),
    timeline: [
      { id: uid(), time: "4:30 PM", activity: "Guests arrive, prosecco on the terrace" },
      { id: uid(), time: "5:30 PM", activity: "Ceremony under the cypress arch" },
      { id: uid(), time: "6:15 PM", activity: "Aperitivo & family photos" },
      { id: uid(), time: "7:30 PM", activity: "Long-table dinner in the vineyard" },
      { id: uid(), time: "9:30 PM", activity: "Toasts, cake, first dance" },
    ],
    shoppingItems: [],
    bringBoard: [
      {
        id: uid(),
        category: "Sides",
        label: "Antipasti board",
        qty: 2,
        status: "open",
        source: "host",
      },
      { id: uid(), category: "Dessert", label: "Tiramisu", qty: 1, status: "open", source: "host" },
      {
        id: uid(),
        category: "Drinks",
        label: "Chianti bottles",
        qty: 6,
        status: "open",
        source: "host",
      },
    ],
    pinnedInspiration: [],
    hostNote:
      "We can't wait to celebrate with you in Tuscany. Dinner is at the long table under the vines — bring a light layer for after sunset.",
    heroImageUrl: "/brand/ava-liam.jpg",
  };
}

// ---- Context ----

type SaveStateSnapshot = import("./party-persistence").SaveState;

type Ctx = {
  parties: Party[];
  status: "loading" | "ready" | "error";
  isDemo: boolean;
  refetch: () => void;
  getParty: (id: string) => Party | undefined;
  createParty: (input: {
    name: string;
    occasion: OccasionType;
    date: string;
    startTime?: string;
    location?: string;
    guestEstimate: number;
    budget: number;
    theme: string;
    themeId?: string;
    extraTasks?: Task[];
    holidayPackId?: HolidayStarterId;
  }) => string;
  updateParty: (id: string, updater: (p: Party) => Party) => void;
  cloneParty: (id: string, overrides?: { name?: string; date?: string }) => string | null;
  deleteParty: (id: string) => Promise<{ error: string | null }>;
  /** Save state per party id (idle | saving | saved | offline | error | conflict). */
  saveStates: Record<string, SaveStateSnapshot>;
  /** Manually retry a party stuck in error/offline/conflict. */
  retrySave: (id: string) => void;
};

import {
  loadDemoState as _loadDemoState,
  saveDemoState as _saveDemoState,
  clearDemoState as _clearDemoState,
} from "./demo-storage";

function baseSeeds(): Party[] {
  return [seedMaya(), seedAvaLiam(), seedGrad(), seedWorldCup()];
}

const PartyContext = createContext<Ctx | null>(null);

// rowToParty and partyToRow now live in party-persistence.ts so tests can
// share them. Re-export the shapes used elsewhere in this module.
import { rowToParty as _rowToParty, partyToColumns, type PartyRow } from "./party-persistence";
import { PartyStore, type StoreEvent } from "./party-store";
import { makeSupabaseClient } from "./party-supabase-client";

function rowToParty(r: unknown): Party {
  return _rowToParty(r as PartyRow);
}
function partyToRow(p: Party, userId: string): PartyRow {
  return partyToColumns(p, userId);
}

export function makeParty(
  input: {
    name: string;
    occasion: OccasionType;
    date: string;
    startTime?: string;
    location?: string;
    guestEstimate: number;
    budget: number;
    theme: string;
    themeId?: string;
    extraTasks?: Task[];
    holidayPackId?: HolidayStarterId;
  },
  id: string,
): Party {
  // Runtime-narrow the id so any stray unknown value fails safely to undefined
  // instead of crashing or seeding a garbage pack.
  const starterId = toHolidayStarterId(input.holidayPackId);
  const pack = starterPack(starterId);
  const packTaskEntries = pack ? packTasks(pack, () => newId()) : [];
  const packBring = pack ? packBringBoard(pack, () => newId()) : [];
  return {
    id,
    name: input.name,
    occasion: input.occasion,
    date: input.date,
    startTime: input.startTime,
    location: input.location,
    guestEstimate: input.guestEstimate,
    budget: input.budget,
    theme: input.theme,
    themeId: input.themeId,
    holidayPackId: pack?.id,
    tasks: [
      ...packTaskEntries,
      ...generateTasks(input.occasion, input.date),
      ...(input.extraTasks ?? []),
    ],
    guests: [],
    budgetCategories: defaultCategoriesFor(input.occasion),
    timeline:
      input.occasion === "game-day" && input.startTime ? seedGameDayTimeline(input.startTime) : [],
    shoppingItems: generateShoppingItems(input.occasion, input.themeId, input.guestEstimate),
    pinnedInspiration: [],
    bringBoard: packBring,
  };
}

export function PartyProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const isDemo = !user;
  const [parties, setParties] = useState<Party[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [saveStates, setSaveStates] = useState<Record<string, SaveStateSnapshot>>({});
  // Ids that have been deleted this session; blocks in-flight saves from
  // resurrecting a row after deleteParty() completed.
  const tombstonesRef = useRef<Set<string>>(new Set());
  const [demoWarning, setDemoWarning] = useState<null | "corrupt" | "quota" | "oversized">(null);
  const warnedRef = useRef<Set<string>>(new Set());

  // Persistence store — deterministic queue with column-diffed writes,
  // optimistic concurrency, 3-way merges, and bounded retry.
  const storeRef = useRef<PartyStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = new PartyStore({
      client: makeSupabaseClient(),
      isTombstoned: (id) => tombstonesRef.current.has(id),
      onEvent: (ev: StoreEvent) => {
        if (ev.type === "state") {
          setSaveStates((prev) => ({ ...prev, [ev.id]: ev.state }));
        } else if (ev.type === "server-row") {
          setParties((prev) => prev.map((p) => (p.id === ev.id ? ev.party : p)));
        } else if (ev.type === "toast") {
          if (ev.kind === "error") toast.error(ev.message);
          else toast.message(ev.message);
        }
      },
    });
  }
  const store = storeRef.current;

  // Online-recovery: flush queued saves when the browser regains network.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => store.flushAll();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [store]);

  // Host focus/visibility refetch — keeps counts/claims fresh when a host
  // returns from the guest link, but never overwrites in-flight edits.
  const lastFocusRefetchRef = useRef(0);
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!user) return;
    const maybeRefresh = () => {
      if (document.visibilityState !== "visible") return;
      // Skip while any party save is in a non-idle state.
      const dirty = Object.values(saveStates).some(
        (s) => s === "saving" || s === "conflict" || s === "offline" || s === "error",
      );
      if (dirty) return;
      const now = Date.now();
      if (now - lastFocusRefetchRef.current < 30_000) return;
      lastFocusRefetchRef.current = now;
      setReloadKey((k) => k + 1);
    };
    document.addEventListener("visibilitychange", maybeRefresh);
    window.addEventListener("focus", maybeRefresh);
    return () => {
      document.removeEventListener("visibilitychange", maybeRefresh);
      window.removeEventListener("focus", maybeRefresh);
    };
  }, [user, saveStates]);

  // Load data based on auth state.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    if (!user) {
      const seeds = baseSeeds();
      const { parties: hydrated, warning } = _loadDemoState(seeds);
      setParties(hydrated);
      if (warning && !warnedRef.current.has(warning)) {
        warnedRef.current.add(warning);
        setDemoWarning(warning);
      }
      setStatus("ready");
      return;
    }
    setStatus("loading");
    supabase
      .from("parties")
      .select("*")
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[parties] load failed", error);
          setParties([]);
          setStatus("error");
          return;
        }
        const loaded = (data ?? []).map((r) => rowToParty(r));
        setParties(loaded);
        // Seed baselines so subsequent updates diff against real server state.
        for (const p of loaded) store.seedBaseline(p, user.id);
        setStatus("ready");
        // Signed in: demo storage is no longer authoritative.
        _clearDemoState();
      });
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, reloadKey, store]);

  // Persist demo parties to localStorage whenever they change (signed-out only).
  useEffect(() => {
    if (authLoading || user) return;
    if (status !== "ready") return;
    const result = _saveDemoState(parties, baseSeeds());
    if (!result.ok && result.reason && !warnedRef.current.has(result.reason)) {
      warnedRef.current.add(result.reason);
      setDemoWarning(result.reason);
    }
  }, [parties, user, authLoading, status]);

  // Surface demo warnings once, non-blocking.
  useEffect(() => {
    if (!demoWarning) return;
    const msg =
      demoWarning === "corrupt"
        ? "Some saved demo data was invalid and was reset."
        : demoWarning === "oversized"
          ? "Demo state is getting large; new changes may not persist across reloads."
          : "Couldn't save demo changes to this browser.";
    toast.message(msg);
    setDemoWarning(null);
  }, [demoWarning]);

  const value = useMemo<Ctx>(
    () => ({
      parties,
      status,
      isDemo,
      saveStates,
      retrySave: (id) => store.retry(id),
      refetch: () => setReloadKey((k) => k + 1),
      getParty: (id) => parties.find((p) => p.id === id),
      createParty: (input) => {
        const id =
          typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : uid();
        const p = makeParty(input, id);
        setParties((prev) => [...prev, p]);
        if (user) store.enqueueInsert(p, user.id);
        return id;
      },
      updateParty: (id, updater) => {
        let updated: Party | undefined;
        setParties((prev) =>
          prev.map((p) => {
            if (p.id !== id) return p;
            updated = updater(p);
            return updated;
          }),
        );
        if (user && updated) store.enqueueUpdate(updated, user.id);
      },
      cloneParty: (id, overrides) => {
        const src = parties.find((x) => x.id === id);
        if (!src) return null;
        const newId =
          typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : uid();
        const copy: Party = JSON.parse(JSON.stringify(src));
        copy.id = newId;
        copy.name = overrides?.name ?? `${src.name} (copy)`;
        copy.date = overrides?.date ?? src.date;
        copy.rsvpToken = undefined;
        copy.updatedAt = undefined;
        copy.tasks = copy.tasks.map((t) => ({ ...t, done: false }));
        copy.guests = [];
        copy.hostUpdates = [];
        copy.checkins = {};
        copy.bringBoard = (copy.bringBoard ?? []).map((b) => ({
          ...b,
          status: "open",
          assigneeName: undefined,
          assigneeHousehold: undefined,
          claimedAt: undefined,
        }));
        copy.budgetCategories = copy.budgetCategories.map((c) => ({ ...c, expenses: [] }));
        copy.shoppingItems = copy.shoppingItems.map((s) => ({ ...s, status: "needed" }));
        setParties((prev) => [...prev, copy]);
        if (user) store.enqueueInsert(copy, user.id);
        return newId;
      },
      deleteParty: async (id) => {
        const target = parties.find((p) => p.id === id);
        if (!target) return { error: null };
        tombstonesRef.current.add(id);
        store.drop(id);
        setParties((list) => list.filter((p) => p.id !== id));
        setSaveStates((prev) => {
          const { [id]: _drop, ...rest } = prev;
          return rest;
        });
        if (!user) return { error: null };
        const { data, error } = await supabase.from("parties").delete().eq("id", id).select("id");
        if (error) {
          console.error("[parties] delete failed", error);
          tombstonesRef.current.delete(id);
          setParties((list) => (list.some((p) => p.id === id) ? list : [...list, target]));
          return { error: "Couldn't delete this party. Try again." };
        }
        if (!data || data.length === 0) {
          return { error: null };
        }
        return { error: null };
      },
    }),
    [parties, status, isDemo, user, store, saveStates],
  );

  return <PartyContext.Provider value={value}>{children}</PartyContext.Provider>;
}

export function useParties() {
  const c = useContext(PartyContext);
  if (!c) throw new Error("useParties must be used within PartyProvider");
  return c;
}

// ---- Derived helpers ----

export function daysUntil(dateISO: string): number {
  const ms = new Date(dateISO).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function progressPct(p: Party): number {
  if (p.tasks.length === 0) return 0;
  return Math.round((p.tasks.filter((t) => t.done).length / p.tasks.length) * 100);
}

export function categoryActual(c: BudgetCategory): number {
  return c.expenses.reduce((s, e) => s + e.amount, 0);
}

export function totalSpent(p: Party): number {
  return p.budgetCategories.reduce((s, c) => s + categoryActual(c), 0);
}

export function guestCounts(p: Party) {
  const yes = p.guests.filter((g) => g.rsvp === "yes");
  return {
    yes: yes.length,
    no: p.guests.filter((g) => g.rsvp === "no").length,
    maybe: p.guests.filter((g) => g.rsvp === "maybe").length,
    invited: p.guests.filter((g) => g.rsvp === "invited").length,
    adults: yes.filter((g) => g.kind === "adult").length,
    kids: yes.filter((g) => g.kind === "kid").length,
    total: p.guests.length,
  };
}

export function newId() {
  return uid();
}

export const OCCASION_LABELS: Record<OccasionType, string> = {
  birthday: "Birthday",
  "baby-shower": "Baby Shower",
  graduation: "Graduation",
  holiday: "Holiday",
  "dinner-party": "Dinner Party",
  "game-day": "Game Day / Watch Party",
  cookout: "BBQ & Cookout",
  other: "Other",
};

// ---- Shopping helpers ----

export type { ShoppingItem, ShoppingCategoryName, Retailer } from "./shopping";
export { STATUS_LABEL } from "./shopping";

export function shoppingProjectedRemaining(p: Party): number {
  return p.shoppingItems
    .filter((i) => i.status !== "purchased")
    .reduce((s, i) => s + i.qty * i.estPrice, 0);
}

export function markShoppingPurchased(p: Party, itemId: string, actualPrice: number): Party {
  const item = p.shoppingItems.find((i) => i.id === itemId);
  if (!item || item.status === "purchased") return p;
  const catIndex = p.budgetCategories.findIndex((c) => c.name === item.category);
  if (catIndex < 0) return p;
  const expenseId = uid();
  const budgetCategories = p.budgetCategories.map((c, idx) =>
    idx === catIndex
      ? {
          ...c,
          expenses: [
            ...c.expenses,
            { id: expenseId, label: `${item.name} (shopping)`, amount: actualPrice },
          ],
        }
      : c,
  );
  const shoppingItems = p.shoppingItems.map((i) =>
    i.id === itemId
      ? { ...i, status: "purchased" as const, linkedExpenseId: expenseId, actualPrice }
      : i,
  );
  return { ...p, budgetCategories, shoppingItems };
}

export function unmarkShoppingPurchased(p: Party, itemId: string): Party {
  const item = p.shoppingItems.find((i) => i.id === itemId);
  if (!item || item.status !== "purchased" || !item.linkedExpenseId) return p;
  const linkedId = item.linkedExpenseId;
  const budgetCategories = p.budgetCategories.map((c) =>
    c.name === item.category ? { ...c, expenses: c.expenses.filter((e) => e.id !== linkedId) } : c,
  );
  const shoppingItems = p.shoppingItems.map((i) =>
    i.id === itemId
      ? { ...i, status: "needed" as const, linkedExpenseId: undefined, actualPrice: undefined }
      : i,
  );
  return { ...p, budgetCategories, shoppingItems };
}

export function setShoppingStatus(p: Party, itemId: string, status: "needed" | "in-cart"): Party {
  // If currently purchased, unmark first to strip the linked expense.
  const item = p.shoppingItems.find((i) => i.id === itemId);
  if (!item) return p;
  const base = item.status === "purchased" ? unmarkShoppingPurchased(p, itemId) : p;
  return {
    ...base,
    shoppingItems: base.shoppingItems.map((i) => (i.id === itemId ? { ...i, status } : i)),
  };
}

export function addShoppingItem(
  p: Party,
  item: { name: string; category: ShoppingCategoryName; qty: number; estPrice: number },
): Party {
  return {
    ...p,
    shoppingItems: [...p.shoppingItems, { id: uid(), status: "needed", ...item }],
  };
}

export function removeShoppingItem(p: Party, itemId: string): Party {
  const item = p.shoppingItems.find((i) => i.id === itemId);
  const base = item?.status === "purchased" ? unmarkShoppingPurchased(p, itemId) : p;
  return { ...base, shoppingItems: base.shoppingItems.filter((i) => i.id !== itemId) };
}

export function setPreferredRetailer(p: Party, itemId: string, retailer: Retailer): Party {
  return {
    ...p,
    shoppingItems: p.shoppingItems.map((i) =>
      i.id === itemId ? { ...i, preferredRetailer: retailer } : i,
    ),
  };
}

export function togglePin(p: Party, pinId: string): Party {
  const has = p.pinnedInspiration.includes(pinId);
  return {
    ...p,
    pinnedInspiration: has
      ? p.pinnedInspiration.filter((id) => id !== pinId)
      : [...p.pinnedInspiration, pinId],
  };
}

// Bulk-add all Buy-kind decor ideas from a theme that aren't already on the list.
export function addThemeToShopping(
  p: Party,
  theme: Theme,
): { party: Party; added: number; skipped: number; estTotal: number } {
  const existing = new Set(p.shoppingItems.map((i) => i.name));
  const toAdd = theme.decorIdeas.filter(
    (idea) => idea.kind === "Buy" && idea.estPrice > 0 && !existing.has(idea.title),
  );
  const skipped = theme.decorIdeas.filter(
    (idea) => idea.kind === "Buy" && idea.estPrice > 0 && existing.has(idea.title),
  ).length;
  const estTotal = toAdd.reduce((s, i) => s + i.estPrice, 0);
  const shoppingItems: ShoppingItem[] = [
    ...p.shoppingItems,
    ...toAdd.map((idea) => ({
      id: uid(),
      name: idea.title,
      category: "Decorations" as ShoppingCategoryName,
      qty: 1,
      estPrice: idea.estPrice,
      status: "needed" as const,
    })),
  ];
  return {
    party: { ...p, shoppingItems },
    added: toAdd.length,
    skipped,
    estTotal,
  };
}
