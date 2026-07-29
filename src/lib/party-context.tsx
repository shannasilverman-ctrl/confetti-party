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
import { daysUntilLocal } from "./date-only";
import {
  materializePlaybook,
  partyPlaybook,
  type PartyPlanningProfile,
} from "./party-intelligence";
import { generatedTaskMetadata, withTaskGuidance } from "./task-guidance";
import type { RsvpResponseDetails } from "./rsvp.functions";
import { retrospectiveCarryForwardTasks } from "./retrospective-reuse";
import { createBudgetCategories } from "./budget";
import { trackProductEvent } from "./product-telemetry";

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

export type TaskAction =
  | "overview"
  | "theme"
  | "shopping"
  | "guests"
  | "bring"
  | "budget"
  | "timeline";

export type TaskOwnerStatus = "ready" | "copied" | "waiting" | "confirmed" | "blocked";

export type Task = {
  id: string;
  title: string;
  bucket: Bucket;
  done: boolean;
  /** The person or role the host has asked to own this task. Coordination only; it sends nothing. */
  owner?: string;
  /** The outcome/context an owner needs to finish the task without returning the planning load. */
  handoffNotes?: string;
  /** Host-recorded handoff state. Confetti never infers acceptance from an external message. */
  ownerStatus?: TaskOwnerStatus;
  /** A short, customer-facing explanation of the planning consequence this task prevents. */
  reason?: string;
  /** The existing workspace destination where the host can make progress on this task. */
  action?: TaskAction;
  /** Whether task guidance is hand-authored for a playbook or inferred from a generic title. */
  guidanceSource?: "curated" | "inferred";
  source?: "confetti-playbook" | "guest-impact" | "local-sourcing";
  playbookId?: string;
  guestImpactId?: "allergens" | "dietary" | "access" | "supervision";
  sourcingOptionId?: string;
};

export const TASK_ACTION_LABELS: Record<TaskAction, string> = {
  overview: "Open overview",
  theme: "Explore looks",
  shopping: "Open shopping",
  guests: "Open guest list",
  bring: "Open Bring Board",
  budget: "Open budget",
  timeline: "Open timeline",
};
export type Guest = {
  id: string;
  name: string;
  kind: "adult" | "kid";
  rsvp: RSVP;
  source?: "link";
  household?: string;
  dietary?: string[];
  allergens?: string[];
  responseDetails?: RsvpResponseDetails;
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
export type TimelineItem = {
  id: string;
  time: string;
  activity: string;
  source?: "confetti-playbook" | "guest-impact";
  playbookId?: string;
  guestImpactId?: "arrival";
};

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
  planningProfile?: PartyPlanningProfile;
  photoDrop?: PhotoDropInfo | null;
  checkins?: Record<string, string>; // guestId -> ISO timestamp
  retrospective?: PartyRetrospective | null;
  /** Optional cinematic banner image URL, seeded on curated samples only. */
  heroImageUrl?: string;
  /** Server-known optimistic concurrency token (updated_at). Not user-visible. */
  updatedAt?: string;
};

export type PlanningDetail = "date" | "guests" | "budget" | "theme";

export const PLANNING_TASK_TITLES: Record<PlanningDetail, string> = {
  date: "Choose the party date",
  guests: "Estimate the guest count",
  budget: "Set a comfortable budget",
  theme: "Choose the look and feel",
};

const SEEDED_DEMO_PARTY_IDS = [
  "maya-8th",
  "grad-bbq",
  "world-cup-final-watch",
  "ava-liam-wedding",
] as const;

export function isSeededDemoPartyId(id: string): boolean {
  return (SEEDED_DEMO_PARTY_IDS as readonly string[]).includes(id);
}

const PLANNING_DETAILS = Object.keys(PLANNING_TASK_TITLES) as PlanningDetail[];

export function planningDetailForTask(task: Pick<Task, "title">): PlanningDetail | undefined {
  return PLANNING_DETAILS.find((detail) => PLANNING_TASK_TITLES[detail] === task.title);
}

export function planningDetailIsOpen(party: Party, detail: PlanningDetail): boolean {
  const title = PLANNING_TASK_TITLES[detail];
  return party.tasks.some((task) => task.title === title && !task.done);
}

export function openPlanningDetails(party: Party): PlanningDetail[] {
  return PLANNING_DETAILS.filter((detail) => planningDetailIsOpen(party, detail));
}

export function resolvePlanningDetails(party: Party, details: PlanningDetail[]): Party {
  const titles = new Set(details.map((detail) => PLANNING_TASK_TITLES[detail]));
  return {
    ...party,
    tasks: party.tasks.map((task) => (titles.has(task.title) ? { ...task, done: true } : task)),
  };
}

export type PartyRetrospective = {
  updatedAt: string;
  worked?: string;
  ranOut?: string;
  changeNext?: string;
};

const uid = () => Math.random().toString(36).slice(2, 10);

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
  // Calendar-day math via the shared date-only helper — never ms rounding.
  const weeks = Math.max(0, Math.floor(daysUntilLocal(dateISO) / 7));
  const allowedFrom = (b: Bucket): boolean => {
    if (b === "6+ weeks out") return weeks >= 6;
    if (b === "3-5 weeks") return weeks >= 3;
    if (b === "1-2 weeks") return weeks >= 1;
    return true;
  };
  return template
    .filter((t) => allowedFrom(t.bucket))
    .map((t) => ({
      id: uid(),
      title: t.title,
      bucket: t.bucket,
      done: false,
      ...generatedTaskMetadata(t.title),
    }));
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
    planningProfile: { version: 1, eventTimeZone: "America/New_York" },
    tasks,
    guests,
    budgetCategories,
    timeline,
    shoppingItems,
    pinnedInspiration: ["unicorn-rainbow:table", "unicorn-rainbow:decor"],
    bringBoard: [
      {
        id: uid(),
        category: "Sides",
        label: "Fruit tray",
        qty: 1,
        status: "claimed",
        source: "host",
        assigneeName: "Sarah Chen",
        assigneeHousehold: "Chen family",
      },
      {
        id: uid(),
        category: "Dessert",
        label: "Nut-free mini cupcakes",
        qty: 18,
        status: "open",
        source: "host",
        dietaryTags: ["Nut-free"],
      },
      {
        id: uid(),
        category: "Drinks",
        label: "Juice boxes",
        qty: 2,
        unit: "packs",
        status: "open",
        source: "host",
      },
      {
        id: uid(),
        category: "Ice / Serveware",
        label: "Bag of ice",
        qty: 2,
        status: "claimed",
        source: "host",
        assigneeName: "Priya Patel",
      },
    ],
    hostNote:
      "So excited to celebrate Maya turning 8! Come hungry — pizza at 2:45. Street parking is easy on Elm.",
  };
}

function seedGrad(): Party {
  const date = "2027-06-05";
  const tasks = generateTasks("graduation", date).map((task, index) => ({
    ...task,
    done: index < 3,
  }));
  const guests: Guest[] = [
    { id: uid(), name: "Jordan Lee (graduate)", kind: "adult", rsvp: "yes" },
    { id: uid(), name: "Sam Lee", kind: "adult", rsvp: "yes" },
    { id: uid(), name: "Tasha Green", kind: "adult", rsvp: "yes" },
    { id: uid(), name: "Miles Green", kind: "kid", rsvp: "yes" },
    { id: uid(), name: "Priya Shah", kind: "adult", rsvp: "maybe" },
    { id: uid(), name: "Andre Williams", kind: "adult", rsvp: "invited" },
  ];
  const budgetCategories = createBudgetCategories("cookout", 900, uid).map((category, index) =>
    index === 0
      ? {
          ...category,
          expenses: [{ id: uid(), label: "BBQ catering deposit", amount: 175 }],
        }
      : category,
  );
  return {
    id: "grad-bbq",
    name: "Backyard Graduation BBQ",
    occasion: "graduation",
    date,
    startTime: "4:00 PM",
    location: "Our backyard",
    guestEstimate: 35,
    budget: 900,
    theme: "Backyard Fiesta",
    themeId: "backyard-fiesta",
    planningProfile: { version: 1, eventTimeZone: "America/New_York" },
    tasks,
    guests,
    budgetCategories,
    timeline: [
      { id: uid(), time: "1:00 PM", activity: "Set tables, shade, and drink station" },
      { id: uid(), time: "3:30 PM", activity: "Food arrives; hold hot trays safely" },
      { id: uid(), time: "4:00 PM", activity: "Guests arrive and sign the memory book" },
      { id: uid(), time: "5:00 PM", activity: "BBQ buffet opens" },
      { id: uid(), time: "6:15 PM", activity: "Toast, cake, and family photos" },
      { id: uid(), time: "7:30 PM", activity: "Golden-hour lawn games" },
    ],
    shoppingItems: generateShoppingItems("graduation", "backyard-fiesta", 35),
    pinnedInspiration: ["backyard-fiesta:table", "backyard-fiesta:photoSpot"],
    bringBoard: [
      {
        id: uid(),
        category: "Sides",
        label: "Big green salad",
        qty: 1,
        status: "claimed",
        source: "host",
        assigneeName: "Tasha Green",
      },
      {
        id: uid(),
        category: "Dessert",
        label: "Brownie tray",
        qty: 2,
        status: "open",
        source: "host",
      },
      {
        id: uid(),
        category: "Drinks",
        label: "Cooler of sparkling water",
        qty: 1,
        status: "open",
        source: "host",
      },
      {
        id: uid(),
        category: "Ice / Serveware",
        label: "Bag of ice",
        qty: 4,
        status: "claimed",
        source: "host",
        assigneeName: "Sam Lee",
      },
    ],
    hostNote:
      "Come celebrate Jordan! The buffet opens at 5. Dress for the backyard and bring a favorite memory for the guest book.",
  };
}

function seedWorldCup(): Party {
  const date = "2026-07-19";
  const startTime = "10:00 AM";
  const tasks = generateTasks("game-day", date).map((t, i) => ({
    ...t,
    done: i < 2,
  }));
  const guests: Guest[] = [
    { id: uid(), name: "Nico Alvarez", kind: "adult", rsvp: "yes" },
    { id: uid(), name: "Maya Alvarez", kind: "kid", rsvp: "yes" },
    { id: uid(), name: "Devin Brooks", kind: "adult", rsvp: "yes" },
    { id: uid(), name: "Leila Haddad", kind: "adult", rsvp: "maybe" },
    { id: uid(), name: "Theo Martin", kind: "kid", rsvp: "invited" },
  ];
  const budgetCategories = createBudgetCategories("game-day", 250, uid).map((category, index) =>
    index === 0
      ? {
          ...category,
          expenses: [{ id: uid(), label: "Wing order deposit", amount: 45 }],
        }
      : category,
  );
  return {
    id: "world-cup-final-watch",
    name: "World Cup Final Watch Party",
    occasion: "game-day",
    date,
    startTime,
    location: "Our place",
    guestEstimate: 12,
    budget: 250,
    theme: "Stadium at Home",
    planningProfile: { version: 1, eventTimeZone: "America/New_York" },
    tasks,
    guests,
    budgetCategories,
    timeline: seedGameDayTimeline(startTime),
    shoppingItems: generateShoppingItems("game-day", undefined, 12),
    pinnedInspiration: [],
    bringBoard: [
      {
        id: uid(),
        category: "Main",
        label: "Italian party tray",
        qty: 1,
        status: "open",
        source: "host",
      },
      {
        id: uid(),
        category: "Sides",
        label: "Game-day dip",
        qty: 2,
        status: "claimed",
        source: "host",
        assigneeName: "Devin Brooks",
      },
      {
        id: uid(),
        category: "Drinks",
        label: "Soda and sparkling water",
        qty: 2,
        status: "open",
        source: "host",
      },
      {
        id: uid(),
        category: "Ice / Serveware",
        label: "Bag of ice",
        qty: 2,
        status: "open",
        source: "host",
      },
    ],
    hostUpdates: [
      {
        id: uid(),
        text: "Doors open at 9:30 so everyone is settled before kickoff.",
        at: "2026-07-16T18:00:00.000Z",
      },
    ],
    retrospective: {
      worked: "The two-screen setup kept the main room lively and gave kids a quieter option.",
      ranOut: "Ice and kid-friendly drinks.",
      changeNext: "Put dessert out before the second half so nobody misses it.",
      updatedAt: "2026-07-20T14:00:00.000Z",
    },
    hostNote:
      "Come early for coffee and breakfast bites. Kids are welcome; the den will have a quieter second screen.",
    heroImageUrl: "/brand/world-cup-watch-v1.jpg",
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
  // Wedding-scale category allocations that sum to the shown budget ($12,500).
  // Every surface (Overview projected/remaining, Budget totals) will now agree.
  const venueExp = uid();
  const cateringExp = uid();
  const florals1 = uid();
  const florals2 = uid();
  const musicDep = uid();
  const budgetCategories: BudgetCategory[] = [
    {
      id: uid(),
      name: "Venue",
      planned: 4500,
      expenses: [{ id: venueExp, label: "Tenuta di Fiore — deposit", amount: 2250 }],
    },
    {
      id: uid(),
      name: "Food & Drink",
      planned: 3800,
      expenses: [{ id: cateringExp, label: "Long-table dinner — deposit", amount: 1500 }],
    },
    { id: uid(), name: "Cake & Desserts", planned: 350, expenses: [] },
    {
      id: uid(),
      name: "Decorations",
      planned: 1400,
      expenses: [
        { id: florals1, label: "Cypress arch florals", amount: 420 },
        { id: florals2, label: "Long-table runners", amount: 180 },
      ],
    },
    {
      id: uid(),
      name: "Entertainment",
      planned: 1600,
      expenses: [{ id: musicDep, label: "String trio deposit", amount: 400 }],
    },
    { id: uid(), name: "Favors", planned: 850, expenses: [] },
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
    planningProfile: { version: 1, eventTimeZone: "Europe/Rome" },
    tasks,
    guests,
    budgetCategories,
    timeline: [
      { id: uid(), time: "4:30 PM", activity: "Guests arrive, prosecco on the terrace" },
      { id: uid(), time: "5:30 PM", activity: "Ceremony under the cypress arch" },
      { id: uid(), time: "6:15 PM", activity: "Aperitivo & family photos" },
      { id: uid(), time: "7:30 PM", activity: "Long-table dinner in the vineyard" },
      { id: uid(), time: "9:30 PM", activity: "Toasts, cake, first dance" },
    ],
    shoppingItems: [
      {
        id: uid(),
        name: "Welcome favors — olive oil minis",
        category: "Favors",
        qty: 60,
        estPrice: 8,
        status: "needed",
      },
      {
        id: uid(),
        name: "Ceremony program cards",
        category: "Decorations",
        qty: 65,
        estPrice: 2,
        status: "in-cart",
      },
      {
        id: uid(),
        name: "Sparklers for send-off",
        category: "Decorations",
        qty: 6,
        estPrice: 12,
        status: "needed",
      },
      {
        id: uid(),
        name: "Bocce set (backyard aperitivo)",
        category: "Entertainment",
        qty: 1,
        estPrice: 45,
        status: "needed",
      },
    ],
    bringBoard: [
      {
        id: uid(),
        category: "Main",
        label: "Focaccia — rosemary & sea salt",
        qty: 3,
        status: "open",
        source: "host",
      },
      {
        id: uid(),
        category: "Main",
        label: "Roasted porchetta trays",
        qty: 2,
        status: "claimed",
        source: "host",
        assigneeName: "Matteo Marchetti",
        assigneeHousehold: "Marchetti family",
      },
      {
        id: uid(),
        category: "Sides",
        label: "Antipasti board",
        qty: 2,
        status: "open",
        source: "host",
      },
      {
        id: uid(),
        category: "Sides",
        label: "Panzanella (summer tomato)",
        qty: 2,
        status: "claimed",
        source: "host",
        assigneeName: "Sofia Rossi",
      },
      { id: uid(), category: "Dessert", label: "Tiramisu", qty: 1, status: "open", source: "host" },
      {
        id: uid(),
        category: "Dessert",
        label: "Cannoli platter",
        qty: 2,
        status: "claimed",
        source: "host",
        assigneeName: "Giulia Bianchi",
      },
      {
        id: uid(),
        category: "Drinks",
        label: "Chianti bottles",
        qty: 6,
        status: "open",
        source: "host",
      },
      {
        id: uid(),
        category: "Drinks",
        label: "Sparkling water flats",
        qty: 3,
        status: "claimed",
        source: "host",
        assigneeName: "Marco Ferrari",
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

export type PartyReadState = {
  source: "none" | "server" | "cache" | "demo";
  lastSyncedAt: number | null;
};

type Ctx = {
  parties: Party[];
  /** Validated user-created browser parties available for an explicit account claim. */
  demoClaimCandidates: Party[];
  /** Database-enforced access level for each loaded party. */
  partyRoles: Record<string, import("./collaboration.functions").PartyRole>;
  status: "loading" | "ready" | "error";
  /** Whether the current view is live, demo data, or a validated offline copy. */
  readState: PartyReadState;
  /** Whether this party has an authoritative server row in the current session. */
  isPartyCloudVerified: (id: string) => boolean;
  isDemo: boolean;
  refetch: () => void;
  getParty: (id: string) => Party | undefined;
  getPartyRole: (id: string) => import("./collaboration.functions").PartyRole | undefined;
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
    planningProfile?: PartyPlanningProfile;
  }) => string;
  updateParty: (id: string, updater: (p: Party) => Party) => void;
  cloneParty: (id: string, overrides?: { name?: string; date?: string }) => string | null;
  deleteParty: (id: string) => Promise<{ error: string | null }>;
  /** Save state per party id (idle | saving | saved | offline | error | conflict). */
  saveStates: Record<string, SaveStateSnapshot>;
  /** Host updates still present only in the durable local write queue. */
  getPendingHostUpdates: (id: string) => Array<{ id: string; baselineUpdatedAt?: string }>;
  /** Conflict metadata (columns + local/server previews) per party. */
  conflicts: Record<string, import("./party-persistence").PendingConflict>;
  /** Ids whose initial insert permanently failed — recoverable local drafts. */
  insertRejected: Record<string, boolean>;
  /** Manually retry a party stuck in error/offline. Conflicts require resolveConflict. */
  retrySave: (id: string) => void;
  /** Resolve a semantic conflict explicitly. */
  resolveConflict: (id: string, choice: "mine" | "theirs") => void;
  /** Discard a locally-recoverable rejected draft. */
  discardLocalDraft: (id: string) => void;
  /** Explicitly copy selected browser parties into the current account. */
  claimDemoParties: (ids: string[]) => Promise<{
    claimedIds: string[];
    error: string | null;
    cleanupPending: boolean;
  }>;
};

import {
  loadDemoState as _loadDemoState,
  saveDemoState as _saveDemoState,
  loadDemoCustomParties as _loadDemoCustomParties,
  removeDemoCustomParties as _removeDemoCustomParties,
} from "./demo-storage";
import { claimDemoPartiesToAccount } from "./demo-claim";

function baseSeeds(): Party[] {
  return [seedMaya(), seedAvaLiam(), seedGrad(), seedWorldCup()];
}

const PartyContext = createContext<Ctx | null>(null);

// rowToParty and partyToRow now live in party-persistence.ts so tests can
// share them. Re-export the shapes used elsewhere in this module.
import { rowToParty as _rowToParty, partyToColumns, type PartyRow } from "./party-persistence";
import { PartyStore, type StoreEvent } from "./party-store";
import { makePartyOutbox, type PartyOutbox } from "./party-outbox";
import {
  loadTransientPartyReadSnapshot,
  makePartyReadCache,
  PARTY_READ_CACHE_VERSION,
  type PartyReadCache,
} from "./party-read-cache";
import { makeSupabaseClient } from "./party-supabase-client";

function rowToParty(r: unknown): Party {
  return _rowToParty(r as PartyRow);
}
function partyToRow(p: Party, userId: string): PartyRow {
  return { ...partyToColumns(p, userId), updated_at: p.updatedAt };
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
    planningProfile?: PartyPlanningProfile;
  },
  id: string,
): Party {
  // Runtime-narrow the id so any stray unknown value fails safely to undefined
  // instead of crashing or seeding a garbage pack.
  const starterId = toHolidayStarterId(input.holidayPackId);
  const pack = starterPack(starterId);
  const packTaskEntries = pack ? packTasks(pack, () => newId()) : [];
  const packBring = pack ? packBringBoard(pack, () => newId()) : [];
  const smart = materializePlaybook(
    partyPlaybook({
      occasion: input.occasion,
      profile: input.planningProfile,
      startTime: input.startTime,
      holidayPackId: pack?.id,
    }),
    () => newId(),
  );
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
    planningProfile: input.planningProfile,
    tasks: [
      ...packTaskEntries,
      ...generateTasks(input.occasion, input.date),
      ...smart.tasks,
      ...(input.extraTasks ?? []),
    ],
    guests: [],
    budgetCategories: createBudgetCategories(input.occasion, input.budget, uid),
    timeline:
      smart.timeline.length > 0
        ? smart.timeline
        : input.occasion === "game-day" && input.startTime
          ? seedGameDayTimeline(input.startTime)
          : [],
    shoppingItems: generateShoppingItems(input.occasion, input.themeId, input.guestEstimate),
    pinnedInspiration: [],
    bringBoard: packBring,
  };
}

export function PartyProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const isDemo = !user;
  const [parties, setParties] = useState<Party[]>([]);
  const [partyRoles, setPartyRoles] = useState<
    Record<string, import("./collaboration.functions").PartyRole>
  >({});
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [readState, setReadState] = useState<PartyReadState>({
    source: "none",
    lastSyncedAt: null,
  });
  const [reloadKey, setReloadKey] = useState(0);
  const [saveStates, setSaveStates] = useState<Record<string, SaveStateSnapshot>>({});
  const [cloudVerifiedParties, setCloudVerifiedParties] = useState<Record<string, boolean>>({});
  const [conflicts, setConflicts] = useState<
    Record<string, import("./party-persistence").PendingConflict>
  >({});
  const [insertRejected, setInsertRejected] = useState<Record<string, boolean>>({});
  const [demoClaimCandidates, setDemoClaimCandidates] = useState<Party[]>([]);
  // Authoritative synchronous parties reference so updateParty is deterministic
  // regardless of React batching. Kept in lock-step with the setParties calls.
  const partiesRef = useRef<Party[]>([]);
  const tombstonesRef = useRef<Set<string>>(new Set());
  const [demoWarning, setDemoWarning] = useState<null | "corrupt" | "quota" | "oversized">(null);
  const warnedRef = useRef<Set<string>>(new Set());

  const applyPartiesUpdate = useCallback((updater: (prev: Party[]) => Party[]) => {
    const next = updater(partiesRef.current);
    partiesRef.current = next;
    setParties(next);
  }, []);

  // Persistence store — deterministic queue with column-diffed writes,
  // optimistic concurrency, 3-way merges, and bounded retry.
  const storeRef = useRef<PartyStore | null>(null);
  const outboxRef = useRef<PartyOutbox | undefined>(undefined);
  const readCacheRef = useRef<PartyReadCache | null | undefined>(undefined);
  if (readCacheRef.current === undefined) {
    readCacheRef.current = makePartyReadCache() ?? null;
  }
  const readCache = readCacheRef.current ?? undefined;
  if (!storeRef.current) {
    outboxRef.current = makePartyOutbox();
    storeRef.current = new PartyStore({
      client: makeSupabaseClient(),
      isTombstoned: (id) => tombstonesRef.current.has(id),
      outbox: outboxRef.current,
      onEvent: (ev: StoreEvent) => {
        if (ev.type === "state") {
          if (ev.state === "error") trackProductEvent("party_save_failed");
          setSaveStates((prev) => ({ ...prev, [ev.id]: ev.state }));
          setConflicts((prev) => {
            const next = { ...prev };
            if (ev.conflict) next[ev.id] = ev.conflict;
            else delete next[ev.id];
            return next;
          });
          setInsertRejected((prev) => {
            const rejected = storeRef.current!.getState(ev.id).insertRejected;
            if (rejected === !!prev[ev.id]) return prev;
            const next = { ...prev };
            if (rejected) next[ev.id] = true;
            else delete next[ev.id];
            return next;
          });
        } else if (ev.type === "server-row") {
          applyPartiesUpdate((prev) => prev.map((p) => (p.id === ev.id ? ev.party : p)));
          setCloudVerifiedParties((current) => ({ ...current, [ev.id]: true }));
          // One acknowledged write is not proof that an account-wide cached
          // snapshot is current. Keep the offline notice until the full
          // authoritative query succeeds.
          setReadState((current) =>
            current.source === "cache" ? current : { source: "server", lastSyncedAt: Date.now() },
          );
        } else if (ev.type === "toast") {
          if (ev.kind === "error") toast.error(ev.message);
          else toast.message(ev.message);
        }
      },
    });
  }
  const store = storeRef.current;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => {
      store.flushAll();
      if (user) setReloadKey((key) => key + 1);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [store, user]);

  const lastFocusRefetchRef = useRef(0);
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!user) return;
    const maybeRefresh = () => {
      if (document.visibilityState !== "visible") return;
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

  // Auth identity lifecycle: the PartyStore instance is constructed once and
  // survives sign-in/out. On identity change we MUST drop the entire queue,
  // clear derived UI state (save pills, conflicts, "not saved" cards,
  // tombstones, one-time warnings), and re-seed only rows loaded for the new
  // owner. Without this, an offline write from account A can flush into
  // account B, or A's party names/toasts can leak into B's UI.
  const prevIdentityRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (authLoading) return;
    const nextIdentity = user?.id ?? null;
    const prev = prevIdentityRef.current;
    const identityChanged = prev !== nextIdentity;
    if (identityChanged) {
      // A signed-out or switched-away account must not leave a readable host
      // snapshot on a shared device. Pending writes have their own redacted,
      // user-scoped recovery lifecycle.
      if (typeof prev === "string") readCache?.remove(prev);
      // Cancel in-flight retries and drop queued writes for the prior user.
      // Timers inside PartyStore.sleep() resolve into a cleared queue and
      // become no-ops via the epoch guard in runOne/handleConflict.
      store.reset(nextIdentity);
      partiesRef.current = [];
      setParties([]);
      setPartyRoles({});
      setSaveStates({});
      setCloudVerifiedParties({});
      setConflicts({});
      setInsertRejected({});
      tombstonesRef.current = new Set();
      warnedRef.current = new Set();
      setDemoWarning(null);
      setReadState({ source: "none", lastSyncedAt: null });
      prevIdentityRef.current = nextIdentity;
    }
    let cancelled = false;
    if (!user) {
      setDemoClaimCandidates([]);
      const seeds = baseSeeds();
      const { parties: hydrated, warning } = _loadDemoState(seeds);
      const guided = hydrated.map((party) => ({
        ...party,
        tasks: party.tasks.map(withTaskGuidance),
      }));
      partiesRef.current = guided;
      setParties(guided);
      setPartyRoles(Object.fromEntries(guided.map((party) => [party.id, "owner"])));
      if (warning && !warnedRef.current.has(warning)) {
        warnedRef.current.add(warning);
        setDemoWarning(warning);
      }
      setReadState({ source: "demo", lastSyncedAt: null });
      setStatus("ready");
      return;
    }
    setStatus("loading");
    const hydrateRows = async (
      rows: PartyRow[],
      loadedRoles: Record<string, "owner" | "cohost">,
      nextReadState: PartyReadState,
    ) => {
      const loaded = rows.map((row) => rowToParty(row));
      // A cached snapshot can also contain a never-landed local insert. Only
      // rows carrying a server concurrency token may be presented to the
      // outbox as server-known; otherwise restorePending would turn that
      // insert into an UPDATE and could discard it on reconnect.
      const authoritativeRows =
        nextReadState.source === "cache"
          ? rows.filter((row) => typeof row.updated_at === "string" && row.updated_at.length > 0)
          : rows;
      const authoritativeIds = new Set(authoritativeRows.map((row) => row.id));
      for (const party of loaded) {
        if (authoritativeIds.has(party.id)) store.seedBaseline(party, user.id);
      }
      const pending = await outboxRef.current?.load(user.id);
      if (cancelled || user.id !== prevIdentityRef.current) return;
      const restored = store.restorePending(pending ?? [], authoritativeRows, user.id, false);
      const restoredById = new Map(restored.map((party) => [party.id, party]));
      const hydrated = loaded.map((party) => restoredById.get(party.id) ?? party);
      for (const party of restored) {
        if (!rows.some((row) => row.id === party.id)) hydrated.push(party);
      }
      partiesRef.current = hydrated;
      setParties(hydrated);
      setPartyRoles({
        ...loadedRoles,
        ...Object.fromEntries(
          restored
            .filter((party) => !rows.some((row) => row.id === party.id))
            .map((party) => [party.id, "owner" as const]),
        ),
      });
      setCloudVerifiedParties(
        nextReadState.source === "server"
          ? Object.fromEntries(rows.map((row) => [row.id, true]))
          : {},
      );
      for (const party of restored) store.retry(party.id);
      setDemoClaimCandidates(_loadDemoCustomParties().parties);
      setReadState(nextReadState);
      setStatus("ready");
    };
    supabase
      .from("parties")
      .select("*")
      .order("created_at", { ascending: true })
      .then(async ({ data, error }) => {
        if (cancelled) return;
        // Guard against identity flipping again mid-fetch.
        if ((user?.id ?? null) !== prevIdentityRef.current) return;
        if (error) {
          console.warn("[parties] load failed", {
            code: (error as { code?: string }).code,
          });
          const cached = await loadTransientPartyReadSnapshot(readCache, user.id, error);
          if (cancelled || user.id !== prevIdentityRef.current) return;
          if (cached) {
            await hydrateRows(
              cached.parties.map((party) => partyToRow(party, user.id)),
              cached.roles,
              { source: "cache", lastSyncedAt: cached.syncedAt },
            );
            return;
          }
          partiesRef.current = [];
          setParties([]);
          setPartyRoles({});
          setReadState({ source: "none", lastSyncedAt: null });
          setStatus("error");
          return;
        }
        const rows = (data ?? []) as PartyRow[];
        const loadedRoles = Object.fromEntries(
          (data ?? []).map((row) => [
            row.id,
            row.user_id === user.id ? ("owner" as const) : ("cohost" as const),
          ]),
        );
        await hydrateRows(rows, loadedRoles, {
          source: "server",
          lastSyncedAt: Date.now(),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, reloadKey, store, readCache]);

  useEffect(() => {
    if (!user || status !== "ready") return;
    if (readState.source !== "server" && readState.source !== "cache") return;
    if (readState.lastSyncedAt === null) return;
    readCache?.put({
      v: PARTY_READ_CACHE_VERSION,
      userId: user.id,
      syncedAt: readState.lastSyncedAt,
      parties,
      roles: partyRoles,
    });
  }, [parties, partyRoles, readCache, readState, status, user]);

  useEffect(() => {
    if (authLoading || user) return;
    if (status !== "ready") return;
    const result = _saveDemoState(parties, baseSeeds());
    if (!result.ok && result.reason && !warnedRef.current.has(result.reason)) {
      warnedRef.current.add(result.reason);
      setDemoWarning(result.reason);
    }
  }, [parties, user, authLoading, status]);

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
      demoClaimCandidates,
      partyRoles,
      status,
      readState,
      isPartyCloudVerified: (id) => !!cloudVerifiedParties[id],
      isDemo,
      saveStates,
      getPendingHostUpdates: (id) => store.getPendingHostUpdates(id),
      conflicts,
      insertRejected,
      retrySave: (id) => store.retry(id),
      resolveConflict: (id, choice) => store.resolveConflict(id, choice),
      discardLocalDraft: (id) => {
        tombstonesRef.current.add(id);
        store.discardLocalDraft(id);
        applyPartiesUpdate((prev) => prev.filter((p) => p.id !== id));
        setPartyRoles((prev) => {
          const { [id]: _drop, ...rest } = prev;
          return rest;
        });
        setSaveStates((prev) => {
          const { [id]: _drop, ...rest } = prev;
          return rest;
        });
        setCloudVerifiedParties((prev) => {
          const { [id]: _drop, ...rest } = prev;
          return rest;
        });
        setInsertRejected((prev) => {
          const { [id]: _drop, ...rest } = prev;
          return rest;
        });
      },
      claimDemoParties: async (ids) => {
        if (!user) {
          return {
            claimedIds: [],
            error: "Sign in before moving browser parties to an account.",
            cleanupPending: false,
          };
        }
        const requested = new Set(ids);
        const stored = _loadDemoCustomParties().parties;
        const selected = stored.filter((party) => requested.has(party.id));
        if (selected.length !== requested.size || selected.length === 0) {
          return {
            claimedIds: [],
            error: "Those browser parties are no longer available. Reload and try again.",
            cleanupPending: false,
          };
        }

        const identity = user.id;
        const result = await claimDemoPartiesToAccount({
          parties: selected,
          userId: identity,
          client: makeSupabaseClient(),
        });
        // Never attach results or delete browser data after an account switch.
        if (prevIdentityRef.current !== identity) {
          return {
            claimedIds: [],
            error: "Your account changed before the transfer finished. Nothing was removed.",
            cleanupPending: false,
          };
        }

        const claimedIds = result.claimed.map((row) => row.id);
        if (result.claimed.length > 0) {
          const canonical = result.claimed.map((row) => rowToParty(row));
          applyPartiesUpdate((current) => {
            const byId = new Map(current.map((party) => [party.id, party]));
            for (const party of canonical) byId.set(party.id, party);
            return [...byId.values()];
          });
          setPartyRoles((current) => ({
            ...current,
            ...Object.fromEntries(claimedIds.map((id) => [id, "owner" as const])),
          }));
          for (const party of canonical) store.seedBaseline(party, identity);
          setCloudVerifiedParties((current) => ({
            ...current,
            ...Object.fromEntries(claimedIds.map((id) => [id, true])),
          }));
        }

        const cleanup = _removeDemoCustomParties(claimedIds);
        setDemoClaimCandidates(_loadDemoCustomParties().parties);
        return {
          claimedIds,
          error: result.failure
            ? "One or more parties could not be moved. Your remaining browser copies are safe."
            : null,
          cleanupPending: !cleanup.ok,
        };
      },
      refetch: () => setReloadKey((k) => k + 1),
      getParty: (id) => parties.find((p) => p.id === id),
      getPartyRole: (id) => partyRoles[id],
      createParty: (input) => {
        const id =
          typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : uid();
        const p = makeParty(input, id);
        applyPartiesUpdate((prev) => [...prev, p]);
        setPartyRoles((prev) => ({ ...prev, [id]: "owner" }));
        if (user) store.enqueueInsert(p, user.id);
        return id;
      },
      updateParty: (id, updater) => {
        // Deterministic: compute next from the authoritative ref, not from the
        // React state closure. Two synchronous updateParty calls will both see
        // the previous call's write.
        const prev = partiesRef.current.find((p) => p.id === id);
        if (!prev) return;
        const next = updater(prev);
        applyPartiesUpdate((cur) => cur.map((p) => (p.id === id ? next : p)));
        if (user) store.enqueueUpdate(next, user.id);
      },
      cloneParty: (id, overrides) => {
        const src = partiesRef.current.find((x) => x.id === id);
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
        copy.tasks.push(...retrospectiveCarryForwardTasks(src.retrospective, uid));
        copy.retrospective = null;
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
        applyPartiesUpdate((prev) => [...prev, copy]);
        setPartyRoles((prev) => ({ ...prev, [newId]: "owner" }));
        if (user) store.enqueueInsert(copy, user.id);
        return newId;
      },
      deleteParty: async (id) => {
        const target = partiesRef.current.find((p) => p.id === id);
        if (!target) return { error: null };
        if (partyRoles[id] !== "owner") {
          return { error: "Only the party owner can delete this party." };
        }
        const restoreTarget = () => {
          tombstonesRef.current.delete(id);
          applyPartiesUpdate((list) => (list.some((p) => p.id === id) ? list : [...list, target]));
          setPartyRoles((prev) => ({ ...prev, [id]: "owner" }));
        };
        tombstonesRef.current.add(id);
        store.drop(id);
        applyPartiesUpdate((list) => list.filter((p) => p.id !== id));
        setPartyRoles((prev) => {
          const { [id]: _drop, ...rest } = prev;
          return rest;
        });
        setSaveStates((prev) => {
          const { [id]: _drop, ...rest } = prev;
          return rest;
        });
        setCloudVerifiedParties((prev) => {
          const { [id]: _drop, ...rest } = prev;
          return rest;
        });
        setInsertRejected((prev) => {
          const { [id]: _drop, ...rest } = prev;
          return rest;
        });
        if (!user) return { error: null };
        try {
          const { data, error } = await supabase.from("parties").delete().eq("id", id).select("id");
          if (error) {
            console.warn("[parties] delete failed", {
              code: (error as { code?: string }).code,
            });
            restoreTarget();
            return { error: "Couldn't delete this party. Try again." };
          }
          if (!data || data.length === 0) {
            return { error: null };
          }
          return { error: null };
        } catch {
          restoreTarget();
          return { error: "Couldn't delete this party. Check your connection and try again." };
        }
      },
    }),
    [
      parties,
      demoClaimCandidates,
      partyRoles,
      status,
      readState,
      cloudVerifiedParties,
      isDemo,
      user,
      store,
      saveStates,
      conflicts,
      insertRejected,
      applyPartiesUpdate,
    ],
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
  // Local calendar-day delta — never rounded milliseconds. See src/lib/date-only.ts.
  return daysUntilLocal(dateISO);
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
export { resizePartySizedShopping, STATUS_LABEL } from "./shopping";

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

export function setShoppingQuantity(p: Party, itemId: string, quantity: number): Party {
  const safeQuantity = Number.isFinite(quantity)
    ? Math.max(1, Math.min(999, Math.floor(quantity)))
    : 1;
  return {
    ...p,
    shoppingItems: p.shoppingItems.map((item) =>
      item.id === itemId
        ? {
            ...item,
            qty: safeQuantity,
            // A host edit becomes authoritative. Future RSVP changes must not
            // silently replace it.
            sizing: undefined,
          }
        : item,
    ),
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
