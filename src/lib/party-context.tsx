import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type OccasionType =
  | "birthday"
  | "baby-shower"
  | "graduation"
  | "holiday"
  | "dinner-party"
  | "other";

export type RSVP = "invited" | "yes" | "no" | "maybe";

export type Bucket = "6+ weeks out" | "3-5 weeks" | "1-2 weeks" | "Party week" | "Day of";

export const BUCKETS: Bucket[] = [
  "6+ weeks out",
  "3-5 weeks",
  "1-2 weeks",
  "Party week",
  "Day of",
];

export type Task = { id: string; title: string; bucket: Bucket; done: boolean };
export type Guest = { id: string; name: string; kind: "adult" | "kid"; rsvp: RSVP };
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
  guestEstimate: number;
  budget: number;
  theme: string;
  tasks: Task[];
  guests: Guest[];
  budgetCategories: BudgetCategory[];
  timeline: TimelineItem[];
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
  other: [
    { title: "Confirm date and venue", bucket: "6+ weeks out" },
    { title: "Send invites", bucket: "3-5 weeks" },
    { title: "Plan food and drink", bucket: "1-2 weeks" },
    { title: "Confirm RSVPs", bucket: "Party week" },
    { title: "Set up", bucket: "Day of" },
  ],
};

export function generateTasks(occasion: OccasionType, dateISO: string): Task[] {
  const template = TASK_TEMPLATES[occasion] ?? TASK_TEMPLATES.other;
  const weeks = Math.max(
    0,
    Math.floor((new Date(dateISO).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7)),
  );
  // Filter out buckets that are impossible given the timeline
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
    // mark a chunk done for demo progress
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
        { id: uid(), label: "Rainbow balloon arch", amount: 35 },
        { id: uid(), label: "Unicorn tableware", amount: 20 },
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
  // 120+60+65+35+20+42 = 342 ✓
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
  return {
    id: "maya-8th",
    name: "Maya's 8th Birthday",
    occasion: "birthday",
    date,
    guestEstimate: 18,
    budget: 600,
    theme: "Unicorn Rainbow",
    tasks,
    guests,
    budgetCategories,
    timeline,
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
    theme: "Backyard Casual",
    tasks,
    guests: [],
    budgetCategories: DEFAULT_CATEGORIES(),
    timeline: [],
  };
}

// ---- Context ----

type Ctx = {
  parties: Party[];
  getParty: (id: string) => Party | undefined;
  createParty: (input: {
    name: string;
    occasion: OccasionType;
    date: string;
    guestEstimate: number;
    budget: number;
    theme: string;
  }) => string;
  updateParty: (id: string, updater: (p: Party) => Party) => void;
};

const PartyContext = createContext<Ctx | null>(null);

export function PartyProvider({ children }: { children: ReactNode }) {
  const [parties, setParties] = useState<Party[]>(() => [seedMaya(), seedGrad()]);

  const value = useMemo<Ctx>(
    () => ({
      parties,
      getParty: (id) => parties.find((p) => p.id === id),
      createParty: (input) => {
        const id = uid();
        const p: Party = {
          id,
          name: input.name,
          occasion: input.occasion,
          date: input.date,
          guestEstimate: input.guestEstimate,
          budget: input.budget,
          theme: input.theme,
          tasks: generateTasks(input.occasion, input.date),
          guests: [],
          budgetCategories: DEFAULT_CATEGORIES(),
          timeline: [],
        };
        setParties((prev) => [...prev, p]);
        return id;
      },
      updateParty: (id, updater) =>
        setParties((prev) => prev.map((p) => (p.id === id ? updater(p) : p))),
    }),
    [parties],
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
  other: "Other",
};
