import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  daysUntil,
  guestCounts,
  progressPct,
  totalSpent,
  useParties,
  OCCASION_LABELS,
  type OccasionType,
  type BringCategory,
  type Party,
  type Task,
  newId,
  openPlanningDetails,
  planningDetailIsOpen,
  PLANNING_TASK_TITLES,
} from "@/lib/party-context";
import { themesForOccasion, type Theme } from "@/lib/themes";
import { HOLIDAY_STARTERS, getStarter, type HolidayStarterId } from "@/lib/holiday-packs";
import { LegalFooter } from "@/components/legal-footer";

import { partiesSummary } from "@/lib/parties-summary";
import { partyHeroImage } from "@/lib/party-visual";

import { BrandLockup } from "@/components/brand";
import { DeletePartyButton } from "@/components/delete-party-button";
import { AuthNav } from "@/components/auth-nav";
import { AppSaveStatus } from "@/components/app-save-status";
import { InstallAppPrompt } from "@/components/install-app-prompt";
import { ConfettiBurst, celebrate } from "@/components/confetti-burst";
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
import { DemoClaimDialog } from "@/components/demo-claim-dialog";
import {
  CalendarDays,
  Users,
  Wallet,
  Plus,
  ArrowRight,
  PartyPopper,
  Sparkles,
  X,
  RefreshCw,
  MessageSquare,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { formatDateOnly } from "@/lib/date-only";
import {
  partyPlaybook,
  preschoolPartyPaths,
  type HostEffort,
  type PartyFormat,
  type PartyPlanningProfile,
} from "@/lib/party-intelligence";
import { useAuth } from "@/lib/auth";
import { DEMO_CLAIM_RETURN_TO } from "@/lib/demo-claim";
import { analyzePlanningIdea } from "@/lib/talk-demo";
import { materializeDraft } from "@/lib/talk-materialize";
import { resolveQuickStart } from "@/lib/quick-start";
import { OfflineSnapshotNotice } from "@/components/offline-snapshot-notice";

type AppSearch = { new?: boolean; claimDemo?: boolean };

export const Route = createFileRoute("/app")({
  component: Dashboard,
  validateSearch: (s: Record<string, unknown>): AppSearch => ({
    new: s.new === true || s.new === "true" || s.new === "1" || s.new === 1 ? true : undefined,
    claimDemo:
      s.claimDemo === true || s.claimDemo === "true" || s.claimDemo === "1" || s.claimDemo === 1
        ? true
        : undefined,
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
  const {
    parties,
    status,
    readState,
    isDemo,
    refetch,
    cloneParty,
    demoClaimCandidates,
    claimDemoParties,
  } = useParties();
  const { user } = useAuth();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [wizardOpen, setWizardOpen] = useState(!!search.new);
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimReminderDismissed, setClaimReminderDismissed] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const planningReady = status === "ready";

  useEffect(() => {
    if (search.new) {
      setWizardOpen(true);
      void navigate({
        to: "/app",
        search: search.claimDemo ? { claimDemo: true } : {},
        replace: true,
      });
    }
  }, [search.new, search.claimDemo, navigate]);

  useEffect(() => {
    if (!search.claimDemo || isDemo || status !== "ready") return;
    if (demoClaimCandidates.length === 0) {
      void navigate({ to: "/app", search: {}, replace: true });
      return;
    }
    setClaimOpen(true);
  }, [search.claimDemo, isDemo, status, demoClaimCandidates.length, navigate]);

  const showBanner = isDemo && !bannerDismissed;
  const showClaimReminder =
    !isDemo &&
    status === "ready" &&
    demoClaimCandidates.length > 0 &&
    !claimOpen &&
    !claimReminderDismissed;
  const isEmptyLoggedIn = !isDemo && status === "ready" && parties.length === 0;
  const featuredParty =
    status === "ready"
      ? [...parties]
          .filter((party) => !planningDetailIsOpen(party, "date") && daysUntil(party.date) >= 0)
          .sort((a, b) => daysUntil(a.date) - daysUntil(b.date))[0]
      : undefined;
  const featuredPartyImage = featuredParty ? partyHeroImage(featuredParty) : undefined;
  const otherParties = featuredParty
    ? parties.filter((party) => party.id !== featuredParty.id)
    : parties;

  return (
    <div
      className="min-h-screen bg-brand-wash"
      data-testid="party-dashboard"
      data-hydrated={planningReady ? "true" : "false"}
      aria-busy={!planningReady}
    >
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 rounded-[1.35rem] border border-white/80 bg-white/90 px-3 py-2.5 shadow-elevated backdrop-blur-xl sm:rounded-full sm:px-5">
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
              disabled={!planningReady}
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

      {readState.source === "cache" && (
        <div className="mx-auto mt-3 max-w-6xl px-3 sm:px-6">
          <OfflineSnapshotNotice />
        </div>
      )}

      {showClaimReminder && (
        <div className="mx-auto mt-3 max-w-6xl px-3 sm:px-6" data-testid="demo-claim-reminder">
          <div className="relative rounded-2xl border border-primary/15 bg-white/85 p-4 pr-14 shadow-soft backdrop-blur sm:flex sm:items-center sm:gap-3 sm:py-3">
            <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary sm:mt-0" />
              <p className="text-sm leading-5 text-secondary">
                {demoClaimCandidates.length === 1
                  ? "One party is still saved only in this browser."
                  : `${demoClaimCandidates.length} parties are still saved only in this browser.`}
                {" Nothing moves without your confirmation."}
              </p>
            </div>
            <Button
              size="sm"
              variant="festive"
              className="mt-3 w-full sm:mt-0 sm:w-auto"
              onClick={() => setClaimOpen(true)}
            >
              Review browser {demoClaimCandidates.length === 1 ? "party" : "parties"}
            </Button>
            <button
              type="button"
              aria-label="Dismiss browser party reminder"
              className="absolute right-2 top-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted sm:static"
              onClick={() => setClaimReminderDismissed(true)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {showBanner && (
        <div className="mx-auto mt-3 max-w-6xl px-3 sm:px-6">
          <div className="relative rounded-2xl border border-primary/10 bg-white/75 p-4 pr-14 shadow-soft backdrop-blur sm:flex sm:items-center sm:gap-3 sm:py-3">
            <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary sm:mt-0" />
              <p className="text-sm leading-5 text-secondary">
                Saved on this device. Sign up to keep your parties across devices and create
                shareable guest links.
              </p>
            </div>
            <Button asChild size="sm" variant="festive" className="mt-3 w-full sm:mt-0 sm:w-auto">
              <Link to="/auth" search={{ mode: "signup", returnTo: DEMO_CLAIM_RETURN_TO }}>
                Keep them everywhere
              </Link>
            </Button>
            <button
              type="button"
              aria-label="Dismiss"
              className="absolute right-2 top-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted sm:static"
              onClick={() => setBannerDismissed(true)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-10">
        <InstallAppPrompt />
        <section className="relative mb-12 grid gap-6 overflow-hidden rounded-[2rem] border border-white/80 bg-white/72 p-5 shadow-lift backdrop-blur-xl sm:p-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,1.1fr)] lg:items-stretch lg:p-3 lg:pl-10">
          <div className="absolute inset-0 bg-confetti opacity-45" aria-hidden />
          <div
            className="absolute -left-24 -top-32 h-80 w-80 rounded-full bg-[hsl(215_70%_92%/0.72)] blur-3xl"
            aria-hidden
          />
          <div
            className="absolute -bottom-36 left-1/3 h-72 w-72 rounded-full bg-[hsl(347_70%_94%/0.8)] blur-3xl"
            aria-hidden
          />
          <div className="relative flex min-w-0 flex-col justify-center py-4 lg:py-10">
            <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--brand-gold)]">
              The joyful way to host
            </div>
            <h1 className="font-display text-[3.25rem] font-medium leading-[0.94] tracking-[-0.045em] text-foreground sm:text-6xl lg:text-[4.7rem]">
              Your parties
            </h1>
            <p className="mt-1 font-display text-3xl font-medium italic tracking-[-0.035em] text-secondary sm:text-4xl">
              beautifully in hand.
            </p>
            <p className="mt-5 max-w-md text-sm leading-6 text-muted-foreground sm:text-base">
              {status === "loading"
                ? "Gathering every lovely detail…"
                : status === "error"
                  ? "We couldn't load your parties."
                  : parties.length === 0
                    ? isDemo
                      ? "Explore a sample or start with the one idea already in your head."
                      : "Start with one idea. Confetti will help with the rest."
                    : partiesSummary(parties).copy}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button
                variant="festive"
                onClick={() => setWizardOpen(true)}
                disabled={!planningReady}
              >
                <Plus className="h-4 w-4" /> Start a party
              </Button>
              <Button asChild variant="ghost" className="text-secondary">
                <Link to="/talk">
                  Talk it out <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          {featuredParty ? (
            <Link
              to="/party/$id"
              params={{ id: featuredParty.id }}
              className="group relative min-h-72 overflow-hidden rounded-[1.65rem] bg-secondary shadow-card outline-none transition duration-500 hover:-translate-y-1 hover:shadow-elevated focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 lg:min-h-[29rem]"
            >
              {featuredPartyImage ? (
                <img
                  src={featuredPartyImage}
                  alt=""
                  data-party-banner={featuredParty.id}
                  className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.035]"
                />
              ) : (
                <div className="absolute inset-0 bg-festive" aria-hidden />
              )}
              <div
                className="absolute inset-0 bg-gradient-to-t from-[hsl(270_49%_19%/0.94)] via-[hsl(270_49%_24%/0.18)] to-transparent"
                aria-hidden
              />
              <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-7">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/75">
                  <span className="rounded-full border border-white/25 bg-white/10 px-2.5 py-1 backdrop-blur">
                    Next up
                  </span>
                  {daysUntil(featuredParty.date) === 0
                    ? "Today"
                    : daysUntil(featuredParty.date) === 1
                      ? "Tomorrow"
                      : `${daysUntil(featuredParty.date)} days out`}
                </div>
                <div className="font-display text-3xl font-medium leading-tight tracking-[-0.025em] sm:text-4xl">
                  {featuredParty.name}
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm text-white/78">
                  <CalendarDays className="h-4 w-4" />
                  {formatDateOnly(featuredParty.date, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
                <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold">
                  Continue planning
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </div>
              </div>
            </Link>
          ) : (
            <div className="relative min-h-64 overflow-hidden rounded-[1.65rem] bg-secondary p-7 text-white shadow-card lg:min-h-[29rem]">
              <div
                className="absolute inset-0 bg-confetti opacity-15 mix-blend-screen"
                aria-hidden
              />
              <div className="relative flex h-full flex-col justify-end">
                <PartyPopper className="mb-5 h-9 w-9 text-accent" />
                <div className="font-display text-3xl leading-tight">
                  One idea is enough to begin.
                </div>
                <p className="mt-3 max-w-sm text-sm leading-6 text-white/70">
                  The date, guest count, budget, and theme can all stay flexible.
                </p>
              </div>
            </div>
          )}
        </section>

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
              One idea is enough. Confetti will build the starting plan and keep track of anything
              you want to decide later.
            </p>
            <Button
              className="mt-6"
              variant="festive"
              onClick={() => setWizardOpen(true)}
              disabled={!planningReady}
            >
              <Plus /> Start a party
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                  {featuredParty ? "Also in your orbit" : "The plans in motion"}
                </div>
                <h2 className="mt-1 font-display text-3xl font-medium tracking-[-0.025em] text-secondary">
                  {featuredParty
                    ? otherParties.length > 0
                      ? "Everything else, still in hand"
                      : "What will you host next?"
                    : "Every celebration, one calm place"}
                </h2>
              </div>
              <div className="hidden text-sm text-muted-foreground sm:block">
                {otherParties.length}{" "}
                {featuredParty
                  ? otherParties.length === 1
                    ? "other gathering"
                    : "other gatherings"
                  : otherParties.length === 1
                    ? "gathering"
                    : "gatherings"}
              </div>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {otherParties.map((p, index) => {
                const days = daysUntil(p.date);
                const dateTbd = planningDetailIsOpen(p, "date");
                const guestsTbd = planningDetailIsOpen(p, "guests");
                const budgetTbd = planningDetailIsOpen(p, "budget");
                const g = guestCounts(p);
                const hasGuestList = g.total > 0;
                const spent = totalSpent(p);
                const prog = progressPct(p);
                const cardImage = partyHeroImage(p);
                const isFeatureCard = !featuredParty && index === 0;
                return (
                  <article
                    key={p.id}
                    aria-labelledby={`party-${p.id}-title`}
                    className={`group relative overflow-hidden rounded-[1.75rem] border border-white/80 bg-white/94 shadow-card backdrop-blur-sm transition duration-300 hover:-translate-y-1.5 hover:shadow-elevated focus-within:-translate-y-1 focus-within:shadow-elevated ${
                      isFeatureCard
                        ? "flex flex-col sm:col-span-2 lg:grid lg:grid-cols-[1.08fr_0.92fr]"
                        : "flex flex-col"
                    }`}
                  >
                    <div
                      className={`relative overflow-hidden p-5 ${
                        isFeatureCard ? "h-56 sm:h-72 lg:h-full lg:min-h-[27rem]" : "h-36"
                      } bg-secondary`}
                    >
                      <img
                        src={cardImage}
                        alt=""
                        data-party-banner={p.id}
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                      <div
                        className="absolute inset-0 bg-gradient-to-b from-secondary/20 via-secondary/25 to-secondary/85"
                        aria-hidden
                      />
                      <Badge variant="onFestive" className="relative">
                        {OCCASION_LABELS[p.occasion]}
                      </Badge>
                      <div className="relative mt-2 text-primary-foreground/90 text-sm">
                        {p.theme}
                      </div>
                    </div>
                    <div className={`flex flex-1 flex-col ${isFeatureCard ? "p-6 sm:p-8" : "p-5"}`}>
                      <h3
                        id={`party-${p.id}-title`}
                        className={`font-display font-medium tracking-[-0.02em] text-foreground ${
                          isFeatureCard ? "text-3xl sm:text-4xl" : "text-[1.35rem]"
                        }`}
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
                        {dateTbd ? (
                          <span className="font-medium text-primary">Date to decide</span>
                        ) : (
                          <>
                            {formatDateOnly(p.date, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                            <span className="mx-1">·</span>
                            <span className="font-medium text-primary">
                              {days > 0 ? `${days} days to go` : days === 0 ? "Today!" : "Past"}
                            </span>
                          </>
                        )}
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl bg-muted/60 p-3">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Users className="h-3.5 w-3.5" />{" "}
                            {hasGuestList ? "Guest list" : "Guest goal"}
                          </div>
                          <div className="mt-0.5 font-bold text-foreground">
                            {hasGuestList ? g.total : !guestsTbd ? p.guestEstimate : "To decide"}
                          </div>
                        </div>
                        <div className="rounded-xl bg-muted/60 p-3">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Wallet className="h-3.5 w-3.5" /> Budget
                          </div>
                          <div className="mt-0.5 font-bold text-foreground">
                            {budgetTbd ? (
                              "To decide"
                            ) : (
                              <>
                                ${spent}{" "}
                                <span className="text-muted-foreground">/ ${p.budget}</span>
                              </>
                            )}
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

                      <div className="mt-auto flex items-center justify-between gap-2 pt-5 text-sm font-medium">
                        <span className="text-primary opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
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
                disabled={!planningReady}
                className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-[1.75rem] border-2 border-dashed border-secondary/20 bg-white/35 p-6 text-muted-foreground backdrop-blur-sm transition hover:-translate-y-1 hover:border-secondary/45 hover:bg-white/80 hover:text-secondary hover:shadow-card"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Plus className="h-6 w-6" />
                </div>
                <div className="font-display text-lg text-secondary">Start a new party</div>
                <div className="text-xs">One idea is enough</div>
              </button>
            </div>
          </>
        )}
      </main>

      <NewPartyWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      <DemoClaimDialog
        open={claimOpen}
        onOpenChange={setClaimOpen}
        parties={demoClaimCandidates}
        accountEmail={user?.email}
        onClaim={claimDemoParties}
        onFinish={(partyId) => {
          setClaimOpen(false);
          if (partyId) {
            void navigate({ to: "/party/$id", params: { id: partyId } });
          } else {
            setClaimReminderDismissed(true);
            void navigate({ to: "/app", search: {}, replace: true });
          }
        }}
      />
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
  const { createParty, getParty, updateParty } = useParties();
  const navigate = Route.useNavigate();
  const [step, setStep] = useState<"idea" | "done">("idea");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [occasion, setOccasion] = useState<OccasionType | null>(null);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [location, setLocation] = useState("");
  const [guestEstimate, setGuestEstimate] = useState("");
  const [budget, setBudget] = useState("");
  const [theme, setTheme] = useState<Theme | null>(null);
  const [holidayStarter, setHolidayStarter] = useState<HolidayStarterId | null>(null);
  const [honoreeAge, setHonoreeAge] = useState("");
  const [expectedKids, setExpectedKids] = useState("");
  const [expectedAdults, setExpectedAdults] = useState("");
  const [effort, setEffort] = useState<HostEffort>("balanced");
  const [partyFormat, setPartyFormat] = useState<PartyFormat>("help-me-choose");

  const themeOptions = occasion ? themesForOccasion(occasion) : [];
  const ideaAnalysis = useMemo(() => (name.trim() ? analyzePlanningIdea(name) : null), [name]);

  function reset() {
    setStep("idea");
    setCreatedId(null);
    setOccasion(null);
    setName("");
    setDate("");
    setStartTime("");
    setLocation("");
    setGuestEstimate("");
    setBudget("");
    setTheme(null);
    setHolidayStarter(null);
    setHonoreeAge("");
    setExpectedKids("");
    setExpectedAdults("");
    setEffort("balanced");
    setPartyFormat("help-me-choose");
  }

  function finish() {
    const resolved = resolveQuickStart({
      idea: name,
      occasion,
      date,
      startTime,
      location,
      guestEstimate,
      budget,
      holidayStarter,
      honoreeAge,
      expectedKids,
      expectedAdults,
      effort,
      partyFormat,
    });
    const {
      party: generated,
      blockingUnknowns,
      optionalUnknowns,
    } = materializeDraft(resolved.patch);
    const missing = new Set([
      ...blockingUnknowns.map((unknown) => unknown.field),
      ...optionalUnknowns.map((unknown) => unknown.field),
    ]);
    const planningTasks: Task[] = [
      ...(missing.has("date")
        ? [
            {
              id: newId(),
              title: PLANNING_TASK_TITLES.date,
              bucket: "6+ weeks out" as const,
              done: false,
            },
          ]
        : []),
      ...(missing.has("guestEstimate")
        ? [
            {
              id: newId(),
              title: PLANNING_TASK_TITLES.guests,
              bucket: "6+ weeks out" as const,
              done: false,
            },
          ]
        : []),
      ...(missing.has("budget")
        ? [
            {
              id: newId(),
              title: PLANNING_TASK_TITLES.budget,
              bucket: "6+ weeks out" as const,
              done: false,
            },
          ]
        : []),
      ...(theme == null
        ? [
            {
              id: newId(),
              title: PLANNING_TASK_TITLES.theme,
              bucket: "3-5 weeks" as const,
              done: false,
            },
          ]
        : []),
    ];
    // Seed a small set of theme decor tasks into the checklist.
    // Skip purely instructional ideas (estPrice 0) so seeded tasks are actionable items.
    const themeTasks: Task[] = (theme?.decorIdeas ?? [])
      .filter((idea) => idea.estPrice > 0)
      .slice(0, 4)
      .map((idea) => ({
        id: newId(),
        title: `${idea.kind === "DIY" ? "DIY: " : ""}${idea.title}`,
        bucket: idea.bucket,
        done: false,
      }));
    const seenTasks = new Set<string>();
    const tasks = [...planningTasks, ...generated.tasks, ...themeTasks].filter((task) => {
      const key = task.title.trim().toLowerCase();
      if (seenTasks.has(key)) return false;
      seenTasks.add(key);
      return true;
    });
    const allowedBringCategories = new Set<BringCategory>([
      "Main",
      "Sides",
      "Dessert",
      "Drinks",
      "Ice / Serveware",
      "Kids",
      "Décor",
    ]);
    const bringBoard: NonNullable<Party["bringBoard"]> = generated.bringBoard.map((item) => ({
      ...item,
      category: allowedBringCategories.has(item.category as BringCategory)
        ? (item.category as BringCategory)
        : "Sides",
    }));
    const resolvedHolidayStarter = HOLIDAY_STARTERS.some(
      (starter) => starter.id === generated.holidayPackId,
    )
      ? (generated.holidayPackId as HolidayStarterId)
      : undefined;

    const id = createParty({
      name: generated.name,
      occasion: generated.occasion,
      date: generated.date,
      startTime: generated.startTime ?? undefined,
      location: generated.location ?? undefined,
      guestEstimate: generated.guestEstimate,
      budget: generated.budget,
      theme: theme?.name ?? "",
      themeId: theme?.id,
      holidayPackId: resolvedHolidayStarter,
      planningProfile: generated.planningProfile ?? undefined,
    });
    updateParty(id, (current) => ({
      ...current,
      name: generated.name,
      occasion: generated.occasion,
      date: generated.date,
      startTime: generated.startTime ?? undefined,
      location: generated.location ?? undefined,
      guestEstimate: generated.guestEstimate,
      budget: generated.budget,
      theme: theme?.name ?? "",
      themeId: theme?.id,
      holidayPackId: resolvedHolidayStarter,
      planningProfile: generated.planningProfile ?? undefined,
      hostNote: generated.hostNote ?? undefined,
      tasks,
      bringBoard,
      shoppingItems: theme ? current.shoppingItems : generated.shoppingItems,
      timeline: generated.timeline,
      budgetCategories: generated.budgetCategories,
    }));
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
    if (o !== "birthday") {
      setHonoreeAge("");
    }
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
            {step === "idea" && "What are you thinking?"}
            {step === "done" && "Your plan is ready"}
          </DialogTitle>
          {step === "idea" && (
            <p className="mt-1 text-sm text-muted-foreground">
              Give us one thought or everything you know. Nothing here has to be final.
            </p>
          )}
        </DialogHeader>

        {step === "idea" && (
          <div
            className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 py-4"
            data-testid="wizard-step-1"
          >
            <div>
              <Label htmlFor="name">Start with the idea</Label>
              <Input
                id="name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sunday dinner, Maya's birthday, World Cup watch party…"
                className="mt-1.5"
              />
              {ideaAnalysis && ideaAnalysis.capturedFacts.length > 0 && (
                <div
                  className="mt-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5"
                  data-testid="wizard-captured-facts"
                  aria-live="polite"
                >
                  <p className="text-xs font-semibold text-secondary">Picked up from your idea</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {ideaAnalysis.capturedFacts.map((fact) => (
                      <Badge key={fact} variant="secondary" className="font-normal">
                        {fact}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    These become editable starting details. Anything we did not catch stays open.
                  </p>
                </div>
              )}
            </div>

            <fieldset>
              <legend className="text-sm font-medium text-secondary">
                What kind of gathering?{" "}
                <span className="font-normal text-muted-foreground">Optional</span>
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {OCCASIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    data-testid={`wizard-occasion-${o.value}`}
                    onClick={() => selectOccasion(o.value)}
                    className={`inline-flex min-h-12 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm transition ${
                      occasion === o.value
                        ? "border-primary bg-primary/10 text-secondary shadow-sm"
                        : "border-border bg-background text-secondary hover:border-primary/40"
                    }`}
                  >
                    <span aria-hidden>{o.emoji}</span>
                    <span>{o.label}</span>
                  </button>
                ))}
              </div>
            </fieldset>

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
            {occasion === "birthday" && (
              <BirthdaySmartStart
                age={honoreeAge}
                onAgeChange={setHonoreeAge}
                expectedKids={expectedKids}
                onExpectedKidsChange={setExpectedKids}
                expectedAdults={expectedAdults}
                onExpectedAdultsChange={setExpectedAdults}
                effort={effort}
                onEffortChange={setEffort}
                format={partyFormat}
                onFormatChange={setPartyFormat}
                startTime={startTime}
              />
            )}
            {occasion && occasion !== "birthday" && (
              <GatheringSmartStart
                occasion={occasion}
                holidayPackId={holidayStarter ?? undefined}
                expectedKids={expectedKids}
                onExpectedKidsChange={setExpectedKids}
                expectedAdults={expectedAdults}
                onExpectedAdultsChange={setExpectedAdults}
                effort={effort}
                onEffortChange={setEffort}
                format={partyFormat}
                onFormatChange={setPartyFormat}
                startTime={startTime}
              />
            )}
            <details className="group rounded-2xl border border-border bg-muted/20">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-secondary">
                Add anything you already know
                <span className="text-xs font-normal text-primary group-open:hidden">
                  Date, place, guests, budget
                </span>
                <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">
                  All optional
                </span>
              </summary>
              <div className="grid gap-4 border-t border-border p-4">
                <div>
                  <Label htmlFor="date">Date (optional)</Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
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
                    <Label htmlFor="guests">Guests (optional)</Label>
                    <Input
                      id="guests"
                      type="number"
                      min={1}
                      value={guestEstimate}
                      onChange={(e) => setGuestEstimate(e.target.value)}
                      placeholder="Not sure"
                    />
                  </div>
                  <div>
                    <Label htmlFor="budget">Budget (optional)</Label>
                    <Input
                      id="budget"
                      type="number"
                      min={0}
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      placeholder="Not sure"
                    />
                  </div>
                </div>
              </div>
            </details>

            {themeOptions.length > 0 && (
              <div>
                <div className="text-sm font-medium text-secondary">
                  Pick a look{" "}
                  <span className="font-normal text-muted-foreground">or leave it for later</span>
                </div>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {themeOptions.slice(0, 4).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      data-testid={`wizard-theme-${t.id}`}
                      onClick={() => setTheme(theme?.id === t.id ? null : t)}
                      className={`min-h-11 shrink-0 rounded-full border px-4 py-2 text-sm transition ${
                        theme?.id === t.id
                          ? "border-primary bg-primary/10 text-secondary"
                          : "border-border bg-background text-secondary"
                      }`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
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
              Your starting plan is ready. Anything you skipped is waiting—not guessed.
            </p>
            <div className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-3">
              <PlanStat label="Tasks generated" value={createdParty.tasks.length} />
              <PlanStat label="Shopping items" value={createdParty.shoppingItems.length} />
              <PlanStat
                label="Look"
                value={createdParty.themeId ? createdParty.theme : "To decide"}
              />
              <PlanStat
                label="Open decisions"
                value={openPlanningDetails(createdParty).length || "None"}
              />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 min-[360px]:flex-row min-[360px]:justify-between">
          {step === "done" ? (
            <>
              <Button
                variant="ghost"
                data-testid="wizard-close"
                className="min-h-[45px] w-full min-[360px]:w-auto"
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
                className="min-h-[45px] w-full min-[360px]:w-auto"
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
                className="min-h-[45px] w-full min-[360px]:w-auto"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                variant="festive"
                data-testid="wizard-create"
                className="min-h-[45px] w-full min-[360px]:w-auto"
                disabled={!name.trim() && !occasion}
                onClick={finish}
              >
                <PartyPopper /> Build my starting plan
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BirthdaySmartStart({
  age,
  onAgeChange,
  expectedKids,
  onExpectedKidsChange,
  expectedAdults,
  onExpectedAdultsChange,
  effort,
  onEffortChange,
  format,
  onFormatChange,
  startTime,
}: {
  age: string;
  onAgeChange: (value: string) => void;
  expectedKids: string;
  onExpectedKidsChange: (value: string) => void;
  expectedAdults: string;
  onExpectedAdultsChange: (value: string) => void;
  effort: HostEffort;
  onEffortChange: (value: HostEffort) => void;
  format: PartyFormat;
  onFormatChange: (value: PartyFormat) => void;
  startTime: string;
}) {
  const parsedAge = Number(age);
  const adultBirthday = parsedAge >= 18;
  const playbook = partyPlaybook({
    occasion: "birthday",
    profile: {
      version: 1,
      ...(parsedAge > 0 ? { honoreeAge: parsedAge } : {}),
      effort,
      format,
    },
    startTime,
  });
  const pathOptions = preschoolPartyPaths({
    version: 1,
    ...(parsedAge > 0 ? { honoreeAge: parsedAge } : {}),
    ...(expectedKids !== "" ? { expectedKids: Number(expectedKids) || 0 } : {}),
    ...(expectedAdults !== "" ? { expectedAdults: Number(expectedAdults) || 0 } : {}),
    effort,
    format,
  });

  return (
    <section
      aria-labelledby="birthday-smart-start-title"
      className="rounded-3xl border border-primary/20 bg-primary/[0.055] p-4 sm:p-5"
      data-testid="birthday-smart-start"
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-xl"
          aria-hidden
        >
          🎈
        </span>
        <div>
          <h3
            id="birthday-smart-start-title"
            className="font-display text-lg font-semibold text-secondary"
          >
            Help Confetti understand this birthday
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            These few details change the timing, activities, guest questions, safety checks, and
            local ideas we recommend.
          </p>
        </div>
      </div>

      <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="honoree-age">Age they&apos;re turning</Label>
            <Input
              id="honoree-age"
              type="number"
              min={1}
              max={120}
              inputMode="numeric"
              value={age}
              onChange={(event) => onAgeChange(event.target.value)}
              placeholder="4"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="expected-kids">{adultBirthday ? "Children coming" : "Children"}</Label>
            <Input
              id="expected-kids"
              type="number"
              min={0}
              inputMode="numeric"
              value={expectedKids}
              onChange={(event) => onExpectedKidsChange(event.target.value)}
              placeholder={
                playbook?.recommendedKidCount ? String(playbook.recommendedKidCount) : "?"
              }
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="expected-adults">
              {adultBirthday ? "Adults coming" : "Adults staying"}
            </Label>
            <Input
              id="expected-adults"
              type="number"
              min={0}
              inputMode="numeric"
              value={expectedAdults}
              onChange={(event) => onExpectedAdultsChange(event.target.value)}
              placeholder="Not sure"
              className="mt-1"
            />
          </div>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-secondary">How much should you carry?</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[
              ["easy", "Make it easy"],
              ["balanced", "Balanced"],
              ["all-out", "Go all out"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onEffortChange(value as HostEffort)}
                aria-pressed={effort === value}
                className={`min-h-11 rounded-2xl border px-2 py-2 text-xs sm:text-sm ${
                  effort === value
                    ? "border-primary bg-primary/10 font-medium text-secondary"
                    : "border-border bg-background text-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        {pathOptions.length > 0 ? (
          <fieldset
            data-testid="preschool-party-paths"
            className="rounded-2xl border border-primary/20 bg-background p-3.5"
          >
            <legend className="px-1 text-sm font-semibold text-secondary">
              {format === "help-me-choose"
                ? "Confetti’s starting recommendation"
                : "Your party path"}
            </legend>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {pathOptions[0].recommendationReason} You can change this anytime.
            </p>
            <div
              className="mt-3 grid gap-2 sm:grid-cols-2"
              role="radiogroup"
              aria-label="Party path"
            >
              {pathOptions.map((path) => {
                const active = path.recommended;
                const choiceLabel =
                  format === "help-me-choose"
                    ? active
                      ? "Confetti pick"
                      : "Another good path"
                    : format === path.format
                      ? "Your choice"
                      : "Alternative";
                return (
                  <button
                    key={path.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onFormatChange(path.format)}
                    className={`min-h-11 rounded-2xl border p-3 text-left transition ${
                      active
                        ? "border-primary bg-primary/[0.065] shadow-sm"
                        : "border-border bg-background hover:border-primary/40"
                    }`}
                  >
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${
                        active ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {choiceLabel}
                    </span>
                    <span className="mt-1 block font-display text-base font-semibold text-secondary">
                      {path.title}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {path.bestFor}
                    </span>
                    {active ? (
                      <>
                        <span className="mt-2 block text-xs font-medium leading-5 text-secondary">
                          {path.flow}
                        </span>
                        <span className="mt-2 block text-[11px] leading-4 text-muted-foreground">
                          Tradeoff: {path.tradeoff}
                        </span>
                      </>
                    ) : (
                      <span className="mt-2 block text-[11px] font-medium text-primary">
                        Select to see the plan and tradeoff
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {format !== "help-me-choose" && (
              <button
                type="button"
                className="mt-2 min-h-11 px-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
                onClick={() => onFormatChange("help-me-choose")}
              >
                Let Confetti choose from my answers
              </button>
            )}
          </fieldset>
        ) : (
          <fieldset>
            <legend className="text-sm font-medium text-secondary">Where should it happen?</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {[
                ["help-me-choose", "Help me choose"],
                ["home", "At home"],
                ["venue", "At a venue"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onFormatChange(value as PartyFormat)}
                  aria-pressed={format === value}
                  className={`min-h-11 rounded-full border px-4 py-2 text-sm ${
                    format === value
                      ? "border-primary bg-primary/10 font-medium text-secondary"
                      : "border-border bg-background text-secondary"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {playbook && (
          <div className="rounded-2xl border border-primary/20 bg-background p-3.5">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Confetti gets it
            </div>
            <div className="mt-1 font-display text-lg font-semibold text-secondary">
              {playbook.title}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{playbook.promise}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-secondary">
              <span className="rounded-full bg-muted px-3 py-1.5">
                About {playbook.recommendedDurationMinutes} minutes
              </span>
              <span className="rounded-full bg-muted px-3 py-1.5">
                {playbook.tasks.length} party-specific jobs covered
              </span>
              <span className="rounded-full bg-muted px-3 py-1.5">
                {playbook.rsvpQuestions.length} {adultBirthday ? "guest-ready" : "parent-ready"}{" "}
                RSVP questions
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function GatheringSmartStart({
  occasion,
  holidayPackId,
  expectedKids,
  onExpectedKidsChange,
  expectedAdults,
  onExpectedAdultsChange,
  effort,
  onEffortChange,
  format,
  onFormatChange,
  startTime,
}: {
  occasion: OccasionType;
  holidayPackId?: string;
  expectedKids: string;
  onExpectedKidsChange: (value: string) => void;
  expectedAdults: string;
  onExpectedAdultsChange: (value: string) => void;
  effort: HostEffort;
  onEffortChange: (value: HostEffort) => void;
  format: PartyFormat;
  onFormatChange: (value: PartyFormat) => void;
  startTime: string;
}) {
  const playbook = partyPlaybook({
    occasion,
    profile: {
      version: 1,
      ...(expectedKids !== "" ? { expectedKids: Number(expectedKids) || 0 } : {}),
      ...(expectedAdults !== "" ? { expectedAdults: Number(expectedAdults) || 0 } : {}),
      effort,
      format,
    },
    startTime,
    holidayPackId,
  });

  return (
    <section
      aria-labelledby="gathering-smart-start-title"
      className="rounded-3xl border border-primary/20 bg-primary/[0.055] p-4 sm:p-5"
      data-testid="gathering-smart-start"
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-xl"
          aria-hidden
        >
          ✨
        </span>
        <div>
          <h3
            id="gathering-smart-start-title"
            className="font-display text-lg font-semibold text-secondary"
          >
            Help Confetti understand this gathering
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            A rough audience and effort level are enough to change the quantities, flow, checklist,
            and local shortcuts we build.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="gathering-expected-adults">Adults</Label>
            <Input
              id="gathering-expected-adults"
              type="number"
              min={0}
              inputMode="numeric"
              value={expectedAdults}
              onChange={(event) => onExpectedAdultsChange(event.target.value)}
              placeholder="Not sure"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="gathering-expected-kids">Children</Label>
            <Input
              id="gathering-expected-kids"
              type="number"
              min={0}
              inputMode="numeric"
              value={expectedKids}
              onChange={(event) => onExpectedKidsChange(event.target.value)}
              placeholder="None or not sure"
              className="mt-1"
            />
          </div>
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-secondary">Where will people gather?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              ["help-me-choose", "Help me choose"],
              ["home", "At home"],
              ["venue", "At a venue"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onFormatChange(value as PartyFormat)}
                aria-pressed={format === value}
                className={`min-h-11 rounded-full border px-4 py-2 text-sm ${
                  format === value
                    ? "border-primary bg-primary/10 font-medium text-secondary"
                    : "border-border bg-background text-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium text-secondary">
            How much should the host carry?
          </legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[
              ["easy", "Make it easy"],
              ["balanced", "Balanced"],
              ["all-out", "Go all out"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onEffortChange(value as HostEffort)}
                aria-pressed={effort === value}
                className={`min-h-11 rounded-2xl border px-2 py-2 text-xs sm:text-sm ${
                  effort === value
                    ? "border-primary bg-primary/10 font-medium text-secondary"
                    : "border-border bg-background text-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        {playbook && (
          <div className="rounded-2xl border border-primary/20 bg-background p-3.5">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Confetti gets it
            </div>
            <div className="mt-1 font-display text-lg font-semibold text-secondary">
              {playbook.title}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{playbook.promise}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-secondary">
              {playbook.recommendedDurationMinutes && (
                <span className="rounded-full bg-muted px-3 py-1.5">
                  A {playbook.recommendedDurationMinutes}-minute starting flow
                </span>
              )}
              <span className="rounded-full bg-muted px-3 py-1.5">
                {playbook.tasks.length} easy-to-miss jobs covered
              </span>
              <span className="rounded-full bg-muted px-3 py-1.5">
                {playbook.rsvpQuestions.length} useful guest questions
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
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
