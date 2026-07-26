import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { fireConfetti, celebrate, celebrateAtEvent } from "@/components/confetti-burst";
import {
  BUCKETS,
  categoryActual,
  daysUntil,
  guestCounts,
  newId,
  OCCASION_LABELS,
  planningDetailIsOpen,
  progressPct,
  totalSpent,
  useParties,
  type Bucket,
  type Guest,
  type RSVP,
} from "@/lib/party-context";
import { BrandLockup } from "@/components/brand";
import { partyHeroImage } from "@/lib/party-visual";
import { DeletePartyButton } from "@/components/delete-party-button";
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
  CalendarClock,
  CalendarDays,
  ListChecks,
  Users,
  Wallet,
  Clock,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Pencil,
  Check,
  X,
  Sparkles,
  Palette,
  ShoppingCart,
  LayoutDashboard,
  Mail,
  Gift,
  Sparkle,
  Timer,
  MapPin,
  Clock as ClockIcon,
} from "lucide-react";
import { ThemeTab } from "@/components/theme-tab";
import { EditDetailsDialog } from "@/components/edit-details-dialog";
import { ShoppingTab } from "@/components/shopping-tab";
import { OverviewTab } from "@/components/overview-tab";
import { RsvpShareButton } from "@/components/rsvp-share-button";
import { InviteDialog } from "@/components/invite-dialog";
import { BringBoardEditor } from "@/components/bring-board-editor";
import { HostMessageHelper } from "@/components/host-message-helper";
import { PhotoDropEditor } from "@/components/photo-drop-editor";
import { ConfirmDelete } from "@/components/confirm-delete";
import { ChecklistTaskRow } from "@/components/checklist-task-row";
import { SaveStatus } from "@/components/save-status";
import { formatDateOnly } from "@/lib/date-only";
import { generatedTaskMetadata } from "@/lib/task-guidance";

export type TabKey =
  | "overview"
  | "theme"
  | "shopping"
  | "checklist"
  | "guests"
  | "bring"
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
  const { getParty, status } = useParties();
  const party = getParty(id);
  const [tab, setTab] = useState<TabKey>("overview");

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading your party…</div>
      </div>
    );
  }

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

  const dateTbd = planningDetailIsOpen(party, "date");
  const guestsTbd = planningDetailIsOpen(party, "guests");
  const budgetTbd = planningDetailIsOpen(party, "budget");
  const days = dateTbd ? null : daysUntil(party.date);
  const g = guestCounts(party);
  const spent = totalSpent(party);
  const prog = progressPct(party);
  const eventVisual = partyHeroImage(party);

  const cartCount = party.shoppingItems.filter(
    (i) => i.status === "needed" || i.status === "in-cart",
  ).length;

  const bringOpen = (party.bringBoard ?? []).filter((b) => b.status === "open").length;

  const tabs: { key: TabKey; label: string; icon: typeof ListChecks; badge?: number }[] = [
    { key: "overview", label: "Overview", icon: LayoutDashboard },
    { key: "theme", label: "Theme", icon: Palette },
    { key: "shopping", label: "Shopping", icon: ShoppingCart, badge: cartCount },
    { key: "checklist", label: "Checklist", icon: ListChecks },
    { key: "guests", label: "Guests", icon: Users },
    { key: "bring", label: "Bring & Photos", icon: Gift, badge: bringOpen },
    { key: "budget", label: "Budget", icon: Wallet },
    { key: "timeline", label: "Timeline", icon: Clock },
  ];

  return (
    <div className="bg-brand-wash min-h-screen pb-nav-safe md:pb-0">
      {/* Header */}
      <header>
        <div className="mx-auto max-w-6xl px-3 pt-3 sm:px-6 sm:pt-5">
          <div className="flex items-center justify-between gap-3 rounded-full border border-white/80 bg-white/92 px-3 py-1.5 shadow-brand backdrop-blur-xl sm:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <Button asChild variant="ghost" size="icon" className="shrink-0">
                <Link to="/app" aria-label="Back to your parties">
                  <ArrowLeft />
                </Link>
              </Button>
              <BrandLockup />
            </div>
            <div className="flex items-center gap-2">
              <Button asChild size="sm" variant="outline" className="hidden sm:inline-flex">
                <Link to="/party/$id/reveal" params={{ id: party.id }}>
                  <Sparkle className="h-4 w-4" /> Reveal
                </Link>
              </Button>
              <Button asChild size="sm" variant="secondary" className="hidden sm:inline-flex">
                <Link to="/party/$id/day-of" params={{ id: party.id }}>
                  <Timer className="h-4 w-4" /> Day-of
                </Link>
              </Button>
              <DeletePartyButton
                partyId={party.id}
                partyName={party.name}
                redirectOnDelete
                variant="ghost"
                size="sm"
              />
            </div>
          </div>

          <div className="relative mt-4 min-h-[23rem] overflow-hidden rounded-[2rem] bg-festive text-primary-foreground shadow-brand sm:min-h-[28rem] sm:rounded-[2.5rem]">
            <img
              src={eventVisual}
              alt=""
              data-party-banner={party.id}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div
              className="absolute inset-0 bg-gradient-to-t from-[hsl(270_49%_14%/0.96)] via-[hsl(270_49%_18%/0.38)] to-[hsl(270_49%_14%/0.08)]"
              aria-hidden
            />
            <div className="relative flex min-h-[23rem] flex-col justify-end p-5 sm:min-h-[28rem] sm:p-9">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="onFestive">{OCCASION_LABELS[party.occasion]}</Badge>
                {party.theme.trim() && <Badge variant="onFestive">{party.theme}</Badge>}
                <div className="ml-auto [&_button]:bg-white/12 [&_button]:text-white [&_button]:hover:bg-white/20">
                  <EditDetailsDialog partyId={party.id} />
                </div>
              </div>
              <h1 className="mt-3 max-w-3xl break-words font-display text-4xl font-medium leading-[0.98] text-white sm:text-6xl">
                {party.name}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/80">
                {dateTbd ? (
                  <>
                    <CalendarClock className="h-4 w-4 shrink-0" />
                    <span className="font-semibold text-white">Date to decide</span>
                    <span>Keep planning—nothing has been guessed.</span>
                  </>
                ) : (
                  <>
                    <CalendarDays className="h-4 w-4 shrink-0" />
                    <span>
                      {formatDateOnly(party.date, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    <span aria-hidden>·</span>
                    <span className="font-semibold text-white">
                      {days! > 0 ? `${days} days to go` : days === 0 ? "Today" : "Past"}
                    </span>
                  </>
                )}
              </div>
              {(party.startTime || party.location) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/80">
                  {party.startTime && (
                    <span className="inline-flex items-center gap-1.5">
                      <ClockIcon className="h-3.5 w-3.5" aria-hidden />
                      {party.startTime}
                    </span>
                  )}
                  {party.location && (
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{party.location}</span>
                    </span>
                  )}
                </div>
              )}

              <div className="mt-6 grid grid-cols-3 gap-2 sm:max-w-2xl sm:gap-3">
                <Stat
                  label="Progress"
                  value={`${prog}%`}
                  sub={`${party.tasks.filter((t) => t.done).length}/${party.tasks.length} tasks`}
                />
                <Stat
                  label="RSVPs"
                  value={`${g.yes}`}
                  sub={
                    guestsTbd && g.total === 0
                      ? "Guest count to decide"
                      : `${g.maybe} maybe · ${g.invited} pending`
                  }
                />
                <Stat
                  label="Budget"
                  value={budgetTbd ? "To decide" : `$${spent}`}
                  sub={budgetTbd ? `$${spent} tracked so far` : `of $${party.budget}`}
                />
              </div>

              <div className="mt-3">
                <SaveStatus partyId={party.id} />
              </div>
            </div>
          </div>

          {/* Desktop tabs */}
          <nav
            className="mt-4 hidden gap-1 overflow-x-auto rounded-2xl border border-white/80 bg-white/88 px-2 shadow-card backdrop-blur-xl md:flex"
            aria-label="Party sections"
          >
            {tabs.map((t) => (
              <button
                key={t.key}
                data-testid={`party-tab-${t.key}`}
                onClick={() => setTab(t.key)}
                className={`flex min-h-11 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
                  tab === t.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-secondary"
                }`}
                aria-current={tab === t.key ? "page" : undefined}
              >
                <t.icon className="h-4 w-4" /> {t.label}
                {t.badge != null && t.badge > 0 && (
                  <span className="ml-1 min-w-[18px] rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold leading-4 text-primary">
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        {tab === "overview" && <OverviewTab partyId={party.id} onNavigate={setTab} />}
        {tab === "theme" && <ThemeTab partyId={party.id} />}
        {tab === "shopping" && <ShoppingTab partyId={party.id} />}
        {tab === "checklist" && <ChecklistTab partyId={party.id} onNavigate={setTab} />}
        {tab === "guests" && <GuestsTab partyId={party.id} />}
        {tab === "bring" && (
          <div className="space-y-10">
            <BringBoardEditor partyId={party.id} />
            <PhotoDropEditor partyId={party.id} />
          </div>
        )}
        {tab === "budget" && <BudgetTab partyId={party.id} />}
        {tab === "timeline" && <TimelineTab partyId={party.id} />}
      </main>

      {/* Mobile bottom tab nav - horizontally scrollable, respects safe area */}
      <nav
        data-testid="party-mobile-nav"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Party sections"
      >
        <div className="scrollbar-none flex overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              data-testid={`party-tab-mobile-${t.key}`}
              onClick={() => setTab(t.key)}
              className={`relative flex min-h-[56px] min-w-[68px] flex-1 shrink-0 flex-col items-center justify-center gap-1 py-2 text-[11px] transition ${
                tab === t.key ? "text-primary" : "text-muted-foreground"
              }`}
              aria-current={tab === t.key ? "page" : undefined}
            >
              <span className="relative">
                <t.icon className="h-5 w-5" />
                {t.badge != null && t.badge > 0 && (
                  <span className="absolute -right-2 -top-1 min-w-[16px] rounded-full bg-primary px-1 text-[9px] font-semibold leading-4 text-primary-foreground">
                    {t.badge}
                  </span>
                )}
              </span>
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
    <div className="min-w-0 rounded-2xl border border-white/15 bg-white/12 p-3 backdrop-blur-sm sm:p-4">
      <div className="truncate text-[10px] font-medium uppercase tracking-[0.12em] text-white/70">
        {label}
      </div>
      <div className="mt-0.5 truncate font-display text-xl font-semibold text-white sm:text-2xl">
        {value}
      </div>
      {sub && <div className="truncate text-[10px] text-white/70 sm:text-[11px]">{sub}</div>}
    </div>
  );
}

/* ---------------- Checklist ---------------- */

function ChecklistTab({
  partyId,
  onNavigate,
}: {
  partyId: string;
  onNavigate: (tab: TabKey) => void;
}) {
  const { getParty, updateParty } = useParties();
  const party = getParty(partyId)!;
  const [newTitle, setNewTitle] = useState("");
  const [newBucket, setNewBucket] = useState<Bucket>("1-2 weeks");
  const [poppedId, setPoppedId] = useState<string | null>(null);

  // Celebrate ONLY on the transition to 100% complete (not every render at 100%).
  const wasComplete = useRef<boolean | null>(null);
  useEffect(() => {
    const total = party.tasks.length;
    const done = party.tasks.filter((t) => t.done).length;
    const complete = total > 0 && done === total;
    if (wasComplete.current === null) {
      wasComplete.current = complete;
      return;
    }
    if (complete && !wasComplete.current) {
      fireConfetti({ count: 32, spread: 200 });
      toast.success("All set!", { description: "Every task is checked off." });
    }
    wasComplete.current = complete;
  }, [party.tasks]);

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
      tasks: [
        ...p.tasks,
        {
          id: newId(),
          title: newTitle.trim(),
          bucket: newBucket,
          done: false,
          ...generatedTaskMetadata(newTitle.trim()),
        },
      ],
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
            <SelectTrigger className="sm:w-48" aria-label="Task timing">
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
                <ChecklistTaskRow
                  key={t.id}
                  partyId={partyId}
                  task={t}
                  popped={poppedId === t.id}
                  onToggle={() => toggle(t.id)}
                  onRemove={() => remove(t.id)}
                  onResolvePlanning={(detail) =>
                    onNavigate(detail === "theme" ? "theme" : "overview")
                  }
                  onOpenAction={(action) => onNavigate(action)}
                />
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

const RSVP_STYLES: Record<
  RSVP,
  { label: string; variant: "success" | "warning" | "destructive" | "soft" }
> = {
  yes: { label: "Yes", variant: "success" },
  maybe: { label: "Maybe", variant: "warning" },
  no: { label: "No", variant: "destructive" },
  invited: { label: "No reply", variant: "soft" },
};

const ARRIVAL_PLAN_LABELS = {
  "from-start": "Joining from the start",
  "arriving-later": "Arriving later",
  "not-sure": "Arrival time not sure yet",
} as const;

function GuestsTab({ partyId }: { partyId: string }) {
  const { getParty, updateParty } = useParties();
  const party = getParty(partyId)!;
  const g = guestCounts(party);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"adult" | "kid">("adult");
  const [inviteOpen, setInviteOpen] = useState(false);

  const add = (e?: React.MouseEvent) => {
    if (!name.trim()) return;
    updateParty(partyId, (p) => ({
      ...p,
      guests: [...p.guests, { id: newId(), name: name.trim(), kind, rsvp: "invited" }],
    }));
    setName("");
    if (e) celebrateAtEvent("micro", e);
    else celebrate("micro");
  };

  const updateGuest = (id: string, patch: Partial<Guest>) => {
    const prev = party.guests.find((gg) => gg.id === id);
    updateParty(partyId, (p) => ({
      ...p,
      guests: p.guests.map((gg) => (gg.id === id ? { ...gg, ...patch } : gg)),
    }));
    if (patch.rsvp === "yes" && prev && prev.rsvp !== "yes") celebrate("micro");
  };

  const remove = (id: string) =>
    updateParty(partyId, (p) => ({ ...p, guests: p.guests.filter((gg) => gg.id !== id) }));

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="success">{g.yes} yes</Badge>
        <Badge variant="warning">{g.maybe} maybe</Badge>
        <Badge variant="destructive">{g.no} no</Badge>
        <Badge variant="soft">{g.invited} no reply</Badge>
        <span className="flex w-full flex-wrap items-center gap-3 text-sm text-muted-foreground sm:ml-auto sm:w-auto">
          <span>
            Headcount: <strong className="text-secondary">{g.adults}</strong> adults ·{" "}
            <strong className="text-secondary">{g.kids}</strong> kids
          </span>
          <Button variant="festive" size="sm" onClick={() => setInviteOpen(true)}>
            <Mail /> Create invite
          </Button>
          <RsvpShareButton partyId={partyId} />
        </span>
      </div>
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} partyId={partyId} />
      <HostMessageHelper partyId={partyId} />

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
            {party.guests.map((guest, guestIndex) => (
              <li
                key={guest.id}
                className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-secondary">
                  {guest.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <Input
                      className="min-w-0 border-transparent bg-transparent focus-visible:border-input sm:max-w-[220px]"
                      value={guest.name}
                      aria-label={`Edit name for ${guest.name || "guest"}`}
                      onChange={(e) => updateGuest(guest.id, { name: e.target.value })}
                    />
                    {guest.source === "link" && (
                      <Badge variant="soft" className="hidden shrink-0 text-[10px] sm:inline-flex">
                        via link
                      </Badge>
                    )}
                  </div>
                  {(guest.responseDetails?.arrivalPlan ||
                    guest.responseDetails?.accessNotes ||
                    guest.dietary?.length ||
                    guest.allergens?.length) && (
                    <div
                      className="mt-1.5 flex flex-wrap gap-1.5 px-3 text-[11px] leading-4 text-muted-foreground"
                      data-testid={`guest-planning-details-${guest.id}`}
                    >
                      {guest.responseDetails?.arrivalPlan && (
                        <span className="rounded-full bg-primary/8 px-2 py-1 text-secondary">
                          {ARRIVAL_PLAN_LABELS[guest.responseDetails.arrivalPlan]}
                        </span>
                      )}
                      {guest.dietary?.map((item, index) => (
                        <span
                          key={`dietary-${index}-${item}`}
                          className="rounded-full bg-muted px-2 py-1"
                        >
                          {item}
                        </span>
                      ))}
                      {guest.allergens?.map((item, index) => (
                        <span
                          key={`allergen-${index}-${item}`}
                          className="rounded-full bg-destructive/8 px-2 py-1 text-destructive"
                        >
                          Avoid {item}
                        </span>
                      ))}
                      {guest.responseDetails?.accessNotes && (
                        <span className="w-full whitespace-pre-wrap break-words text-secondary">
                          Comfort/access: {guest.responseDetails.accessNotes}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="col-start-2 flex min-w-0 items-center gap-2 sm:contents">
                  <Select
                    value={guest.kind}
                    onValueChange={(v) => updateGuest(guest.id, { kind: v as "adult" | "kid" })}
                  >
                    <SelectTrigger
                      className="min-w-0 flex-1 sm:w-24 sm:flex-none"
                      aria-label={`Kind for ${guest.name || "guest"}`}
                    >
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
                    <SelectTrigger
                      className="min-w-0 flex-1 sm:ml-auto sm:w-32 sm:flex-none"
                      aria-label={`RSVP for ${guest.name || "guest"}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="invited">No reply</SelectItem>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="maybe">Maybe</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                  <Badge
                    variant={RSVP_STYLES[guest.rsvp].variant}
                    className="hidden sm:inline-flex"
                  >
                    {RSVP_STYLES[guest.rsvp].label}
                  </Badge>
                  <ConfirmDelete
                    mode={guest.rsvp === "invited" ? "undo" : "confirm"}
                    itemLabel={guest.name || "guest"}
                    impact={
                      guest.rsvp === "yes"
                        ? "This guest is going. Removing clears their RSVP."
                        : guest.rsvp === "maybe"
                          ? "This guest is a maybe. Removing clears their response."
                          : undefined
                    }
                    onConfirm={() => remove(guest.id)}
                    onUndo={() => {
                      updateParty(partyId, (p) => {
                        if (p.guests.some((candidate) => candidate.id === guest.id)) return p;
                        const guests = [...p.guests];
                        guests.splice(Math.min(guestIndex, guests.length), 0, guest);
                        return { ...p, guests };
                      });
                    }}
                    trigger={
                      <button
                        type="button"
                        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-destructive"
                        aria-label={`Remove ${guest.name || "guest"}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    }
                  />
                </div>
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
        c.id === catId ? { ...c, expenses: [...c.expenses, { id: newId(), label, amount }] } : c,
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
          <Progress
            value={party.budget ? (spent / party.budget) * 100 : 0}
            aria-label="Budget used"
            className="mt-3"
          />
        </div>
        <div
          className={`rounded-2xl border p-5 shadow-card ${
            remaining < 0 ? "border-warning bg-warning/10" : "border-border bg-card"
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
      <Progress value={pct} aria-label="Task progress" className="mt-3" />

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
                  className="inline-flex min-h-11 min-w-11 items-center justify-center text-muted-foreground transition hover:text-destructive sm:min-h-0 sm:min-w-0 sm:opacity-0 sm:group-hover:opacity-100"
                  aria-label={`Remove expense ${e.label}`}
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
  const [editing, setEditing] = useState<{
    id: string;
    time: string;
    activity: string;
  } | null>(null);

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

  const saveEdit = () => {
    if (!editing?.time.trim() || !editing.activity.trim()) return;
    updateParty(partyId, (p) => ({
      ...p,
      timeline: p.timeline.map((item) =>
        item.id === editing.id
          ? {
              ...item,
              time: editing.time.trim().slice(0, 60),
              activity: editing.activity.trim().slice(0, 240),
            }
          : item,
      ),
    }));
    setEditing(null);
  };

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
              <div
                data-testid={`timeline-item-${item.id}`}
                className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-4 shadow-card sm:gap-3"
              >
                {editing?.id === item.id ? (
                  <>
                    <Input
                      className="min-h-11 sm:w-44"
                      value={editing.time}
                      maxLength={60}
                      aria-label={`Time for ${item.activity}`}
                      onChange={(event) =>
                        setEditing((current) =>
                          current ? { ...current, time: event.target.value } : current,
                        )
                      }
                    />
                    <Input
                      className="min-h-11 min-w-0 flex-1"
                      value={editing.activity}
                      maxLength={240}
                      aria-label="Timeline activity"
                      onChange={(event) =>
                        setEditing((current) =>
                          current ? { ...current, activity: event.target.value } : current,
                        )
                      }
                      onKeyDown={(event) => event.key === "Enter" && saveEdit()}
                    />
                    <Button
                      type="button"
                      variant="festive"
                      size="sm"
                      className="min-h-11"
                      onClick={saveEdit}
                      disabled={!editing.time.trim() || !editing.activity.trim()}
                    >
                      <Check aria-hidden /> Save
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-11"
                      onClick={() => setEditing(null)}
                    >
                      <X aria-hidden /> Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="font-display text-lg font-semibold text-primary">
                      {item.time}
                    </div>
                    <div className="min-w-0 flex-1 text-sm text-secondary">{item.activity}</div>
                  </>
                )}
                {editing?.id !== item.id && (
                  <div className="ml-auto flex items-center gap-1 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={() =>
                        setEditing({ id: item.id, time: item.time, activity: item.activity })
                      }
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-secondary sm:min-h-8 sm:min-w-8"
                      aria-label={`Edit ${item.activity}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(item.id, -1)}
                      disabled={idx === 0}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-secondary disabled:opacity-30 sm:min-h-8 sm:min-w-8"
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(item.id, 1)}
                      disabled={idx === party.timeline.length - 1}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-secondary disabled:opacity-30 sm:min-h-8 sm:min-w-8"
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(item.id)}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-destructive sm:min-h-8 sm:min-w-8"
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
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
