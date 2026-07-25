import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  daysUntil,
  guestCounts,
  progressPct,
  totalSpent,
  useParties,
  OCCASION_LABELS,
  type OccasionType,
  type Task,
  newId,
} from "@/lib/party-context";
import { themesForOccasion, type Theme } from "@/lib/themes";
import { HOLIDAY_STARTERS, getStarter, type HolidayStarterId } from "@/lib/holiday-packs";
import { LegalFooter } from "@/components/legal-footer";

import { partiesSummary } from "@/lib/parties-summary";

import { BrandLockup } from "@/components/brand";
import { DeletePartyButton } from "@/components/delete-party-button";
import { AuthNav } from "@/components/auth-nav";
import { AppSaveStatus } from "@/components/app-save-status";
import { ConfettiBurst, celebrateAtEvent, celebrate } from "@/components/confetti-burst";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CalendarDays,
  Users,
  Wallet,
  Plus,
  ArrowRight,
  PartyPopper,
  Check,
  Sparkles,
  X,
  RefreshCw,
  MessageSquare,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { formatDateOnly } from "@/lib/date-only";

type AppSearch = { new?: boolean };

export const Route = createFileRoute("/app")({
  component: Dashboard,
  validateSearch: (s: Record<string, unknown>): AppSearch => ({
    new: s.new === true || s.new === "true" || s.new === "1" || s.new === 1 ? true : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Your parties · Confetti" },
      { name: "description", content: "See every party you're hosting, in one calm place." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function Dashboard() {
  const { parties, status, isDemo, refetch, cloneParty } = useParties();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [wizardOpen, setWizardOpen] = useState(!!search.new);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    if (search.new) {
      setWizardOpen(true);
      void navigate({ to: "/app", search: {}, replace: true });
    }
  }, [search.new, navigate]);

  const showBanner = isDemo && !bannerDismissed;
  const isEmptyLoggedIn = !isDemo && status === "ready" && parties.length === 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-4 sm:px-6">
          <BrandLockup />
          <div className="flex items-center gap-1.5 sm:gap-2">
            <AuthNav variant="app" />
            <Button asChild variant="outline" size="sm">
              <Link to="/talk">
                <MessageSquare className="h-4 w-4" />
                <span className="hidden sm:inline">Talk it out</span>
              </Link>
            </Button>
            <Button
              variant="festive"
              size="sm"
              onClick={() => setWizardOpen(true)}
              data-testid="new-party-trigger"
              aria-label="New Party"
            >
              <Plus />
              <span className="hidden sm:inline">New Party</span>
            </Button>
          </div>
        </div>
      </header>

      <AppSaveStatus />

      {showBanner && (
        <div className="border-b border-border bg-primary/5">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-3">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            <p className="flex-1 text-sm text-secondary">
              You're in demo mode. Sign up free to save your parties.
            </p>
            <Button asChild size="sm" variant="festive">
              <Link to="/auth" search={{ mode: "signup" }}>
                Sign up free
              </Link>
            </Button>
            <button
              type="button"
              aria-label="Dismiss"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              onClick={() => setBannerDismissed(true)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
              <Sparkles className="h-3 w-3" /> Your calm co-host
            </div>
            <h1 className="font-display text-3xl font-semibold text-secondary sm:text-4xl">
              Your parties
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {status === "loading"
                ? "Loading your parties…"
                : status === "error"
                  ? "We couldn't load your parties."
                  : parties.length === 0
                    ? isDemo
                      ? "Explore a sample or start your own."
                      : "Nothing here yet — plan your first party."
                    : partiesSummary(parties).copy}
            </p>
          </div>
          {status === "ready" &&
            parties.length > 0 &&
            (() => {
              const upcoming = [...parties]
                .filter((p) => daysUntil(p.date) >= 0)
                .sort((a, b) => daysUntil(a.date) - daysUntil(b.date))[0];
              if (!upcoming) return null;
              const d = daysUntil(upcoming.date);
              return (
                <Link
                  to="/party/$id"
                  params={{ id: upcoming.id }}
                  className="group flex items-center gap-4 rounded-2xl border border-border bg-card px-4 py-3 shadow-card transition hover:-translate-y-0.5 hover:shadow-elevated"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Next up
                    </div>
                    <div className="truncate font-display text-base font-semibold text-secondary">
                      {upcoming.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {d === 0 ? "Today" : d === 1 ? "Tomorrow" : `${d} days out`}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-primary opacity-0 transition group-hover:opacity-100" />
                </Link>
              );
            })()}
        </div>

        {status === "loading" ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[320px] animate-pulse rounded-3xl border border-border bg-card"
              >
                <div className="h-28 rounded-t-3xl bg-muted/70" />
                <div className="space-y-3 p-5">
                  <div className="h-5 w-2/3 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <div className="h-14 rounded-xl bg-muted/70" />
                    <div className="h-14 rounded-xl bg-muted/70" />
                  </div>
                  <div className="h-2 w-full rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : status === "error" ? (
          <div className="rounded-3xl border border-border bg-card p-10 text-center">
            <h3 className="font-display text-xl font-semibold text-secondary">
              Something went wrong
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              We couldn't load your parties. Check your connection and try again.
            </p>
            <Button className="mt-5" variant="festive" onClick={refetch}>
              <RefreshCw className="h-4 w-4" /> Retry
            </Button>
          </div>
        ) : isEmptyLoggedIn ? (
          <div className="rounded-3xl border-2 border-dashed border-border bg-card/60 p-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <PartyPopper className="h-7 w-7" />
            </div>
            <h3 className="mt-5 font-display text-2xl font-semibold text-secondary">
              Plan your first party
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
              Answer a few quick questions and Confetti will set up your checklist, shopping list,
              and day-of timeline.
            </p>
            <Button className="mt-6" variant="festive" onClick={() => setWizardOpen(true)}>
              <Plus /> Start a party
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {parties.map((p) => {
              const days = daysUntil(p.date);
              const g = guestCounts(p);
              const spent = totalSpent(p);
              const prog = progressPct(p);
              return (
                <article
                  key={p.id}
                  aria-labelledby={`party-${p.id}-title`}
                  className="group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-card transition hover:-translate-y-1 hover:shadow-elevated focus-within:-translate-y-1 focus-within:shadow-elevated"
                >
                  <div className="relative h-28 bg-festive p-5">
                    <div className="absolute inset-0 bg-confetti opacity-40 mix-blend-overlay" />
                    <Badge variant="onFestive" className="relative">
                      {OCCASION_LABELS[p.occasion]}
                    </Badge>
                    <div className="relative mt-2 text-primary-foreground/90 text-sm">
                      {p.theme}
                    </div>
                  </div>
                  <div className="flex-1 p-5">
                    <h3
                      id={`party-${p.id}-title`}
                      className="font-display text-xl font-semibold text-secondary"
                    >
                      <Link
                        to="/party/$id"
                        params={{ id: p.id }}
                        className="rounded-sm outline-none after:absolute after:inset-0 after:content-[''] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                      >
                        {p.name}
                      </Link>
                    </h3>
                    <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatDateOnly(p.date, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                      <span className="mx-1">·</span>
                      <span className="font-medium text-primary">
                        {days > 0 ? `${days} days to go` : days === 0 ? "Today!" : "Past"}
                      </span>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl bg-muted/60 p-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Users className="h-3.5 w-3.5" /> Guests
                        </div>
                        <div className="mt-0.5 font-semibold text-secondary">
                          {g.total || p.guestEstimate}
                        </div>
                      </div>
                      <div className="rounded-xl bg-muted/60 p-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Wallet className="h-3.5 w-3.5" /> Budget
                        </div>
                        <div className="mt-0.5 font-semibold text-secondary">
                          ${spent} <span className="text-muted-foreground">/ ${p.budget}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5">
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Planning progress</span>
                        <span className="font-semibold text-secondary">{prog}%</span>
                      </div>
                      <Progress value={prog} aria-label="Checklist progress" />
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-2 text-sm font-medium">
                      <span className="text-primary opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                        Open workspace <ArrowRight className="ml-1 inline h-4 w-4" />
                      </span>
                      {/* Sibling actions — lifted above the title link's ::after overlay */}
                      <div className="relative z-10 flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Duplicate ${p.name}`}
                          onClick={() => {
                            const id = cloneParty(p.id);
                            if (id) toast.success("Party duplicated.");
                          }}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold text-secondary hover:bg-muted"
                        >
                          <Copy className="h-3.5 w-3.5" /> Duplicate
                        </button>
                        <DeletePartyButton
                          partyId={p.id}
                          partyName={p.name}
                          variant="ghost"
                          size="icon"
                        />
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}

            <button
              onClick={() => setWizardOpen(true)}
              className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-border bg-transparent p-6 text-muted-foreground transition hover:border-primary hover:bg-card hover:text-primary"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Plus className="h-6 w-6" />
              </div>
              <div className="font-display text-lg text-secondary">Start a new party</div>
              <div className="text-xs">3 quick steps</div>
            </button>
          </div>
        )}
      </main>

      <NewPartyWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      <LegalFooter />
    </div>
  );
}

const OCCASIONS: { value: OccasionType; label: string; emoji: string }[] = [
  { value: "birthday", label: "Birthday", emoji: "🎂" },
  { value: "baby-shower", label: "Baby Shower", emoji: "🍼" },
  { value: "graduation", label: "Graduation", emoji: "🎓" },
  { value: "holiday", label: "Holiday", emoji: "🎄" },
  { value: "dinner-party", label: "Dinner Party", emoji: "🍷" },
  { value: "game-day", label: "Watch Party", emoji: "🏆" },
  { value: "cookout", label: "BBQ & Cookout", emoji: "🔥" },
  { value: "other", label: "Other", emoji: "🎉" },
];

function NewPartyWizard({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { createParty, getParty } = useParties();
  const navigate = Route.useNavigate();
  const [step, setStep] = useState<1 | 2 | 3 | "done">(1);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [occasion, setOccasion] = useState<OccasionType | null>(null);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [location, setLocation] = useState("");
  const [guestEstimate, setGuestEstimate] = useState(20);
  const [budget, setBudget] = useState(500);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [holidayStarter, setHolidayStarter] = useState<HolidayStarterId | null>(null);

  const themeOptions = occasion ? themesForOccasion(occasion) : [];

  function reset() {
    setStep(1);
    setCreatedId(null);
    setOccasion(null);
    setName("");
    setDate("");
    setStartTime("");
    setLocation("");
    setGuestEstimate(20);
    setBudget(500);
    setTheme(null);
    setHolidayStarter(null);
  }

  function finish() {
    if (!occasion || !date || !theme) return;
    // Seed a small set of theme decor tasks into the checklist.
    // Skip purely instructional ideas (estPrice 0) so seeded tasks are actionable items.
    const extraTasks: Task[] = theme.decorIdeas
      .filter((idea) => idea.estPrice > 0)
      .slice(0, 4)
      .map((idea) => ({
        id: newId(),
        title: `${idea.kind === "DIY" ? "DIY: " : ""}${idea.title}`,
        bucket: idea.bucket,
        done: false,
      }));
    const id = createParty({
      name: name || `New ${OCCASION_LABELS[occasion]}`,
      occasion,
      date,
      startTime: startTime.trim() || undefined,
      location: location.trim() || undefined,
      guestEstimate,
      budget,
      theme: theme.name,
      themeId: theme.id,
      extraTasks,
      holidayPackId: occasion === "holiday" && holidayStarter ? holidayStarter : undefined,
    });
    setCreatedId(id);
    setStep("done");
    // Big physics cannon for the "your plan is ready" moment.
    if (typeof window !== "undefined") {
      setTimeout(() => celebrate("cannon"), 60);
    }
  }

  function openPlan() {
    if (!createdId) return;
    const id = createdId;
    onOpenChange(false);
    reset();
    void navigate({ to: "/party/$id", params: { id } });
  }

  // Reset selected theme when occasion changes so palette matches
  function selectOccasion(o: OccasionType) {
    setOccasion(o);
    setTheme(null);
    if (o !== "holiday") setHolidayStarter(null);
  }

  function pickStarter(id: HolidayStarterId) {
    setHolidayStarter(id);
    const starter = getStarter(id);
    // Prefill an editable name only when the field is empty, so we never overwrite the host's input.
    if (starter && !name.trim()) setName(starter.suggestedName);
  }

  const createdParty = createdId ? getParty(createdId) : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        onCloseAutoFocus={(event) => {
          // Trigger is a plain <Button>, not <DialogTrigger asChild>, so
          // Radix cannot auto-restore focus. Manually return focus to the
          // "New party" trigger to satisfy the dialog contract.
          const trigger = document.querySelector<HTMLElement>('[data-testid="new-party-trigger"]');
          if (trigger) {
            event.preventDefault();
            trigger.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-secondary">
            {step === 1 && "What are you hosting?"}
            {step === 2 && "The essentials"}
            {step === 3 && "Pick your theme"}
            {step === "done" && "Your plan is ready"}
          </DialogTitle>
          <div className="mt-2 flex gap-1.5">
            {[1, 2, 3].map((n) => {
              const active = step === "done" ? true : n <= step;
              return (
                <div
                  key={n}
                  className={`h-1.5 flex-1 rounded-full transition ${
                    active ? "bg-primary" : "bg-muted"
                  }`}
                />
              );
            })}
          </div>
        </DialogHeader>

        {step === 1 && (
          <div className="grid grid-cols-2 gap-3 py-4" data-testid="wizard-step-1">
            {OCCASIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                data-testid={`wizard-occasion-${o.value}`}
                onClick={() => selectOccasion(o.value)}
                className={`min-h-11 rounded-2xl border p-5 text-left transition ${
                  occasion === o.value
                    ? "border-primary bg-primary/5 shadow-card"
                    : "border-border hover:border-primary/40 hover:bg-muted/40"
                }`}
              >
                <div className="text-2xl">{o.emoji}</div>
                <div className="mt-2 font-medium text-secondary">{o.label}</div>
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4 py-4" data-testid="wizard-step-2">
            {occasion === "holiday" && (
              <fieldset
                aria-label="Holiday starter"
                className="rounded-2xl border border-border bg-muted/30 p-3"
              >
                <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Starter (optional)
                </legend>
                <p className="mb-2 px-1 text-xs text-muted-foreground">
                  Pre-fills a name, checklist, and bring board. Everything stays editable.
                </p>
                <div
                  role="radiogroup"
                  aria-label="Holiday starter choices"
                  className="flex flex-wrap gap-2"
                >
                  {HOLIDAY_STARTERS.map((s) => {
                    const active = holidayStarter === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        data-testid={`wizard-starter-${s.id}`}
                        onClick={() => pickStarter(s.id)}
                        className={`inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition ${
                          active
                            ? "border-primary bg-primary/10 text-secondary shadow-sm"
                            : "border-border bg-background text-secondary hover:border-primary/40"
                        }`}
                      >
                        <span aria-hidden>{s.emoji}</span>
                        <span>{s.label}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}
            <div>
              <Label htmlFor="name">Party name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  occasion ? `e.g. Sam's ${OCCASION_LABELS[occasion]}` : "Give it a name"
                }
              />
            </div>
            <div>
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="start-time">Start time (optional)</Label>
                <Input
                  id="start-time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  placeholder="e.g. 2:00 PM"
                />
              </div>
              <div>
                <Label htmlFor="location">Location (optional)</Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Our backyard"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="guests">Guests (est.)</Label>
                <Input
                  id="guests"
                  type="number"
                  min={1}
                  value={guestEstimate}
                  onChange={(e) => setGuestEstimate(Number(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="budget">Budget ($)</Label>
                <Input
                  id="budget"
                  type="number"
                  min={0}
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="py-4" data-testid="wizard-step-3">
            {themeOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No themes yet for this occasion. You can still create the party and pick one later.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {themeOptions.map((t) => {
                  const selected = theme?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      data-testid={`wizard-theme-${t.id}`}
                      onClick={(e) => {
                        if (theme?.id !== t.id) celebrateAtEvent("small", e);
                        setTheme(t);
                      }}
                      className={`group min-h-11 overflow-hidden rounded-2xl border text-left transition ${
                        selected
                          ? "border-primary shadow-card ring-2 ring-primary/30"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                        <img
                          src={t.heroImage}
                          alt={t.name}
                          loading="lazy"
                          className="h-full w-full object-cover transition group-hover:scale-105"
                        />
                        {selected && (
                          <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-card">
                            <Check className="h-4 w-4" />
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <div className="font-display text-base font-semibold text-secondary">
                          {t.name}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {t.vibe}
                        </p>
                        <div className="mt-2 flex gap-1">
                          {t.palette.map((c, i) => (
                            <span
                              key={i}
                              className="h-4 w-4 rounded-full border border-border"
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {step === "done" && createdParty && (
          <div className="py-4 text-center">
            <div className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-festive text-primary-foreground shadow-elevated">
              <div
                className="absolute inset-0 animate-ping rounded-full bg-primary/30"
                aria-hidden
              />
              <PartyPopper className="h-10 w-10 animate-scale-in" />
              <ConfettiBurst active count={22} spread={130} />
            </div>
            <h3 className="mt-5 font-display text-2xl font-semibold text-secondary">
              {createdParty.name}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Everything's seeded. Open the plan whenever you're ready.
            </p>
            <div className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-3">
              <PlanStat label="Tasks generated" value={createdParty.tasks.length} />
              <PlanStat label="Shopping items" value={createdParty.shoppingItems.length} />
              <PlanStat label="Theme applied" value={createdParty.theme} />
              <PlanStat label="Budget set" value={`$${createdParty.budget}`} />
            </div>
          </div>
        )}

        <DialogFooter className="flex-row justify-between sm:justify-between">
          {step === "done" ? (
            <>
              <Button
                variant="ghost"
                data-testid="wizard-close"
                className="min-h-[45px]"
                onClick={() => {
                  onOpenChange(false);
                  reset();
                }}
              >
                Close
              </Button>
              <Button
                variant="festive"
                data-testid="wizard-open-plan"
                className="min-h-[45px]"
                onClick={openPlan}
              >
                <Sparkles /> Open your party plan
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                data-testid="wizard-back"
                className="min-h-[45px]"
                onClick={() =>
                  step === 1 ? onOpenChange(false) : setStep(((step as number) - 1) as 1 | 2)
                }
              >
                {step === 1 ? "Cancel" : "Back"}
              </Button>
              {(step as number) < 3 ? (
                <Button
                  variant="festive"
                  data-testid="wizard-continue"
                  className="min-h-[45px]"
                  disabled={(step === 1 && !occasion) || (step === 2 && (!date || !name))}
                  onClick={() => setStep(((step as number) + 1) as 2 | 3)}
                >
                  Continue <ArrowRight />
                </Button>
              ) : (
                <Button
                  variant="festive"
                  data-testid="wizard-create"
                  className="min-h-[45px]"
                  disabled={!theme}
                  onClick={finish}
                >
                  <PartyPopper /> Create party
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-left shadow-card">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-display text-lg font-semibold text-secondary">{value}</div>
    </div>
  );
}
