import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { fireConfetti } from "@/components/confetti-burst";
import {
  BUCKETS,
  categoryActual,
  daysUntil,
  guestCounts,
  newId,
  OCCASION_LABELS,
  progressPct,
  totalSpent,
  useParties,
  type Bucket,
  type Guest,
  type RSVP,
} from "@/lib/party-context";
import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ListChecks,
  Users,
  Wallet,
  Clock,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Palette,
  ShoppingCart,
  LayoutDashboard,
} from "lucide-react";
import { ThemeTab } from "@/components/theme-tab";
import { ShoppingTab } from "@/components/shopping-tab";
import { OverviewTab } from "@/components/overview-tab";

export type TabKey =
  | "overview"
  | "theme"
  | "shopping"
  | "checklist"
  | "guests"
  | "budget"
  | "timeline";


export const Route = createFileRoute("/party/$id")({
  component: PartyWorkspace,
  head: ({ params }) => ({
    meta: [
      { title: "Party workspace · Confetti" },
      { name: "description", content: "Plan every detail of your party." },
      { name: "robots", content: "noindex" },
      { property: "og:url", content: `/party/${params.id}` },
    ],
  }),
});

function PartyWorkspace() {
  const { id } = Route.useParams();
  const { getParty } = useParties();
  const party = getParty(id);
  const [tab, setTab] = useState<TabKey>("overview");

  if (!party) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="font-display text-2xl text-secondary">Party not found</h1>
          <Button asChild className="mt-4" variant="festive">
            <Link to="/app">Back to your parties</Link>
          </Button>
        </div>
      </div>
    );
  }

  const days = daysUntil(party.date);
  const g = guestCounts(party);
  const spent = totalSpent(party);
  const prog = progressPct(party);

  const tabs: { key: TabKey; label: string; icon: typeof ListChecks }[] = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "theme", label: "Theme", icon: Palette },
    { key: "shopping", label: "Shopping", icon: ShoppingCart },
    { key: "checklist", label: "Checklist", icon: ListChecks },
    { key: "guests", label: "Guests", icon: Users },
    { key: "budget", label: "Budget", icon: Wallet },
    { key: "timeline", label: "Timeline", icon: Clock },
  ];


  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0">
      {/* Header */}
      <header className="border-b border-border bg-card/70 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="icon">
                <Link to="/app" aria-label="Back">
                  <ArrowLeft />
                </Link>
              </Button>
              <BrandLockup />
            </div>
          </div>

          <div className="mt-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="soft">{OCCASION_LABELS[party.occasion]}</Badge>
              <Badge variant="accent">{party.theme}</Badge>
            </div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-secondary sm:text-4xl">
              {party.name}
            </h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="h-4 w-4" />
              {new Date(party.date).toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
              <span>·</span>
              <span className="font-medium text-primary">
                {days > 0 ? `${days} days to go` : days === 0 ? "Today!" : "Past"}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3 sm:max-w-lg">
              <Stat label="Progress" value={`${prog}%`} sub={`${party.tasks.filter(t=>t.done).length}/${party.tasks.length} tasks`} />
              <Stat label="RSVPs" value={`${g.yes}`} sub={`${g.maybe} maybe · ${g.invited} pending`} />
              <Stat label="Budget" value={`$${spent}`} sub={`of $${party.budget}`} />
            </div>
          </div>

          {/* Desktop tabs */}
          <nav className="mt-6 hidden gap-1 border-b border-transparent md:flex">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
                  tab === t.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-secondary"
                }`}
              >
                <t.icon className="h-4 w-4" /> {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {tab === "overview" && <OverviewTab partyId={party.id} onNavigate={setTab} />}
        {tab === "theme" && <ThemeTab partyId={party.id} />}
        {tab === "shopping" && <ShoppingTab partyId={party.id} />}
        {tab === "checklist" && <ChecklistTab partyId={party.id} />}
        {tab === "guests" && <GuestsTab partyId={party.id} />}
        {tab === "budget" && <BudgetTab partyId={party.id} />}
        {tab === "timeline" && <TimelineTab partyId={party.id} />}

      </main>

      {/* Mobile bottom tab nav - horizontally scrollable */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden">
        <div className="scrollbar-none flex overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex min-w-[68px] flex-1 shrink-0 flex-col items-center gap-1 py-3 text-[11px] transition ${
                tab === t.key ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <t.icon className="h-5 w-5" />
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-card p-3 shadow-card">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-display text-xl font-semibold text-secondary">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/* ---------------- Checklist ---------------- */

function ChecklistTab({ partyId }: { partyId: string }) {
  const { getParty, updateParty } = useParties();
  const party = getParty(partyId)!;
  const [newTitle, setNewTitle] = useState("");
  const [newBucket, setNewBucket] = useState<Bucket>("1-2 weeks");
  const [poppedId, setPoppedId] = useState<string | null>(null);

  const toggle = (id: string) => {
    const t = party.tasks.find((x) => x.id === id);
    if (t && !t.done) {
      setPoppedId(id);
      setTimeout(() => setPoppedId(null), 500);
    }
    updateParty(partyId, (p) => ({
      ...p,
      tasks: p.tasks.map((tt) => (tt.id === id ? { ...tt, done: !tt.done } : tt)),
    }));
  };

  const addTask = () => {
    if (!newTitle.trim()) return;
    updateParty(partyId, (p) => ({
      ...p,
      tasks: [...p.tasks, { id: newId(), title: newTitle.trim(), bucket: newBucket, done: false }],
    }));
    setNewTitle("");
  };

  const remove = (id: string) =>
    updateParty(partyId, (p) => ({ ...p, tasks: p.tasks.filter((t) => t.id !== id) }));

  return (
    <div className="space-y-8">
      {/* Add task */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Add a task…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
          />
          <Select value={newBucket} onValueChange={(v) => setNewBucket(v as Bucket)}>
            <SelectTrigger className="sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BUCKETS.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="festive" onClick={addTask}>
            <Plus /> Add
          </Button>
        </div>
      </div>

      {BUCKETS.map((bucket) => {
        const items = party.tasks.filter((t) => t.bucket === bucket);
        if (items.length === 0) return null;
        const doneCount = items.filter((t) => t.done).length;
        return (
          <section key={bucket}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-secondary">{bucket}</h2>
              <span className="text-xs text-muted-foreground">
                {doneCount}/{items.length} done
              </span>
            </div>
            <ul className="space-y-2">
              {items.map((t) => (
                <li
                  key={t.id}
                  className={`group flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-card transition ${
                    t.done ? "opacity-60" : ""
                  }`}
                >
                  <div className={poppedId === t.id ? "animate-pop" : ""}>
                    <Checkbox
                      checked={t.done}
                      onCheckedChange={() => toggle(t.id)}
                      className="h-5 w-5"
                    />
                  </div>
                  <span
                    className={`flex-1 text-sm ${
                      t.done ? "text-muted-foreground line-through" : "text-secondary"
                    }`}
                  >
                    {t.title}
                  </span>
                  {t.done && <CheckCircle2 className="h-4 w-4 text-success" />}
                  <button
                    onClick={() => remove(t.id)}
                    className="text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
                    aria-label="Delete task"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {party.tasks.length === 0 && (
        <EmptyState icon={ListChecks} title="No tasks yet" body="Add your first to-do above." />
      )}
    </div>
  );
}

/* ---------------- Guests ---------------- */

const RSVP_STYLES: Record<RSVP, { label: string; variant: "success" | "warning" | "destructive" | "soft" }> = {
  yes: { label: "Yes", variant: "success" },
  maybe: { label: "Maybe", variant: "warning" },
  no: { label: "No", variant: "destructive" },
  invited: { label: "No reply", variant: "soft" },
};

function GuestsTab({ partyId }: { partyId: string }) {
  const { getParty, updateParty } = useParties();
  const party = getParty(partyId)!;
  const g = guestCounts(party);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"adult" | "kid">("adult");

  const add = () => {
    if (!name.trim()) return;
    updateParty(partyId, (p) => ({
      ...p,
      guests: [...p.guests, { id: newId(), name: name.trim(), kind, rsvp: "invited" }],
    }));
    setName("");
  };

  const updateGuest = (id: string, patch: Partial<Guest>) =>
    updateParty(partyId, (p) => ({
      ...p,
      guests: p.guests.map((gg) => (gg.id === id ? { ...gg, ...patch } : gg)),
    }));

  const remove = (id: string) =>
    updateParty(partyId, (p) => ({ ...p, guests: p.guests.filter((gg) => gg.id !== id) }));

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="success">{g.yes} yes</Badge>
        <Badge variant="warning">{g.maybe} maybe</Badge>
        <Badge variant="destructive">{g.no} no</Badge>
        <Badge variant="soft">{g.invited} no reply</Badge>
        <span className="ml-auto text-sm text-muted-foreground">
          Headcount: <strong className="text-secondary">{g.adults}</strong> adults ·{" "}
          <strong className="text-secondary">{g.kids}</strong> kids
        </span>
      </div>

      {/* Add */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Guest name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <Select value={kind} onValueChange={(v) => setKind(v as "adult" | "kid")}>
            <SelectTrigger className="sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="adult">Adult</SelectItem>
              <SelectItem value="kid">Kid</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="festive" onClick={add}>
            <Plus /> Add
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        {party.guests.length === 0 ? (
          <EmptyState icon={Users} title="No guests yet" body="Add your first guest above." />
        ) : (
          <ul className="divide-y divide-border">
            {party.guests.map((guest) => (
              <li key={guest.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-medium text-secondary">
                  {guest.name.charAt(0).toUpperCase()}
                </div>
                <Input
                  className="max-w-[220px] border-transparent bg-transparent focus-visible:border-input"
                  value={guest.name}
                  onChange={(e) => updateGuest(guest.id, { name: e.target.value })}
                />
                <Select
                  value={guest.kind}
                  onValueChange={(v) => updateGuest(guest.id, { kind: v as "adult" | "kid" })}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adult">Adult</SelectItem>
                    <SelectItem value="kid">Kid</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={guest.rsvp}
                  onValueChange={(v) => updateGuest(guest.id, { rsvp: v as RSVP })}
                >
                  <SelectTrigger className="ml-auto w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invited">No reply</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="maybe">Maybe</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
                <Badge variant={RSVP_STYLES[guest.rsvp].variant} className="hidden sm:inline-flex">
                  {RSVP_STYLES[guest.rsvp].label}
                </Badge>
                <button
                  onClick={() => remove(guest.id)}
                  className="text-muted-foreground transition hover:text-destructive"
                  aria-label="Remove guest"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------------- Budget ---------------- */

function BudgetTab({ partyId }: { partyId: string }) {
  const { getParty, updateParty } = useParties();
  const party = getParty(partyId)!;
  const spent = totalSpent(party);
  const remaining = party.budget - spent;

  const addExpense = (catId: string, label: string, amount: number) =>
    updateParty(partyId, (p) => ({
      ...p,
      budgetCategories: p.budgetCategories.map((c) =>
        c.id === catId
          ? { ...c, expenses: [...c.expenses, { id: newId(), label, amount }] }
          : c,
      ),
    }));

  const removeExpense = (catId: string, expId: string) =>
    updateParty(partyId, (p) => ({
      ...p,
      budgetCategories: p.budgetCategories.map((c) =>
        c.id === catId ? { ...c, expenses: c.expenses.filter((e) => e.id !== expId) } : c,
      ),
    }));

  return (
    <div className="space-y-6">
      {/* Totals */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-festive p-5 text-primary-foreground shadow-card">
          <div className="text-xs uppercase tracking-wide opacity-80">Total budget</div>
          <div className="mt-1 font-display text-3xl font-semibold">${party.budget}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Spent</div>
          <div className="mt-1 font-display text-3xl font-semibold text-secondary">${spent}</div>
          <Progress value={party.budget ? (spent / party.budget) * 100 : 0} className="mt-3" />
        </div>
        <div
          className={`rounded-2xl border p-5 shadow-card ${
            remaining < 0
              ? "border-warning bg-warning/10"
              : "border-border bg-card"
          }`}
        >
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {remaining < 0 ? "Over by" : "Remaining"}
          </div>
          <div
            className={`mt-1 font-display text-3xl font-semibold ${
              remaining < 0 ? "text-warning-foreground" : "text-success"
            }`}
          >
            ${Math.abs(remaining)}
          </div>
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-4">
        {party.budgetCategories.map((c) => (
          <CategoryCard
            key={c.id}
            category={c}
            onAdd={(label, amount) => addExpense(c.id, label, amount)}
            onRemove={(expId) => removeExpense(c.id, expId)}
          />
        ))}
      </div>
    </div>
  );
}

function CategoryCard({
  category,
  onAdd,
  onRemove,
}: {
  category: ReturnType<typeof useParties>["parties"][0]["budgetCategories"][0];
  onAdd: (label: string, amount: number) => void;
  onRemove: (id: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const actual = categoryActual(category);
  const over = actual > category.planned;
  const pct = category.planned ? Math.min(100, (actual / category.planned) * 100) : 0;

  const submit = () => {
    const a = Number(amount);
    if (!label.trim() || !a || a <= 0) return;
    onAdd(label.trim(), a);
    setLabel("");
    setAmount("");
  };

  return (
    <div
      className={`rounded-2xl border bg-card p-5 shadow-card ${
        over ? "border-warning" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-secondary">{category.name}</h3>
          <div className="text-xs text-muted-foreground">
            Planned <span className="font-medium text-secondary">${category.planned}</span>
          </div>
        </div>
        <div className="text-right">
          <div
            className={`font-display text-xl font-semibold ${
              over ? "text-warning-foreground" : "text-secondary"
            }`}
          >
            ${actual}
          </div>
          {over && <Badge variant="warning">Over by ${actual - category.planned}</Badge>}
        </div>
      </div>
      <Progress value={pct} className="mt-3" />

      {category.expenses.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {category.expenses.map((e) => (
            <li
              key={e.id}
              className="group flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-sm"
            >
              <span className="text-secondary">{e.label}</span>
              <div className="flex items-center gap-3">
                <span className="font-medium text-secondary">${e.amount}</span>
                <button
                  onClick={() => onRemove(e.id)}
                  className="text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
                  aria-label="Remove expense"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Expense (e.g. Balloon arch)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Input
          type="number"
          placeholder="$"
          className="sm:w-28"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <Button variant="outline" onClick={submit}>
          <Plus /> Add
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Timeline ---------------- */

function TimelineTab({ partyId }: { partyId: string }) {
  const { getParty, updateParty } = useParties();
  const party = getParty(partyId)!;
  const [time, setTime] = useState("");
  const [activity, setActivity] = useState("");

  const add = () => {
    if (!time.trim() || !activity.trim()) return;
    updateParty(partyId, (p) => ({
      ...p,
      timeline: [...p.timeline, { id: newId(), time: time.trim(), activity: activity.trim() }],
    }));
    setTime("");
    setActivity("");
  };

  const remove = (id: string) =>
    updateParty(partyId, (p) => ({ ...p, timeline: p.timeline.filter((i) => i.id !== id) }));

  const move = (id: string, dir: -1 | 1) =>
    updateParty(partyId, (p) => {
      const idx = p.timeline.findIndex((i) => i.id === id);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= p.timeline.length) return p;
      const arr = [...p.timeline];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return { ...p, timeline: arr };
    });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2 text-sm text-secondary">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>Day-of run of show</span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Time (e.g. 2:00 PM)"
            className="sm:w-40"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          <Input
            placeholder="Activity"
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <Button variant="festive" onClick={add}>
            <Plus /> Add
          </Button>
        </div>
      </div>

      {party.timeline.length === 0 ? (
        <EmptyState icon={Clock} title="No timeline yet" body="Add the first moment above." />
      ) : (
        <ol className="relative space-y-3 border-l-2 border-primary/25 pl-6">
          {party.timeline.map((item, idx) => (
            <li key={item.id} className="group relative">
              <span className="absolute -left-[31px] top-2 h-4 w-4 rounded-full border-2 border-primary bg-background" />
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
                <div className="font-display text-lg font-semibold text-primary">{item.time}</div>
                <div className="flex-1 text-sm text-secondary">{item.activity}</div>
                <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => move(item.id, -1)}
                    disabled={idx === 0}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-secondary disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => move(item.id, 1)}
                    disabled={idx === party.timeline.length - 1}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-secondary disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => remove(item.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    aria-label="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ---------------- Shared ---------------- */

function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof ListChecks;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-secondary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="font-display text-lg text-secondary">{title}</div>
      <div className="text-sm text-muted-foreground">{body}</div>
    </div>
  );
}
