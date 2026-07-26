import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { RsvpShareButton } from "@/components/rsvp-share-button";
import { InviteDialog } from "@/components/invite-dialog";
import { EditDetailsDialog } from "@/components/edit-details-dialog";
import {
  BUCKETS,
  TASK_ACTION_LABELS,
  daysUntil,
  guestCounts,
  shoppingProjectedRemaining,
  totalSpent,
  useParties,
  newId,
  planningDetailForTask,
  planningDetailIsOpen,
  resizePartySizedShopping,
  resolvePlanningDetails,
  type PlanningDetail,
  type Task,
} from "@/lib/party-context";
import { TaskDetailsDialog } from "@/components/task-details-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { celebrate, celebrateAtEvent } from "@/components/confetti-burst";
import {
  localPlanningSuggestions,
  locationIsSpecific,
  type LocalPlanningKind,
} from "@/lib/local-planning";
import {
  partyPlaybook,
  preschoolPartyPaths,
  reconcilePartyPlaybook,
  type PartyPlanningProfile,
  type PartyPlaybook,
} from "@/lib/party-intelligence";
import { partyQuantityPlan, type PartyQuantityPlan } from "@/lib/party-quantities";
import {
  guestPlanSnapshot,
  materializeGuestImpact,
  type GuestPlanImpact,
  type GuestPlanSnapshot,
} from "@/lib/guest-plan-impact";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Camera,
  Copy,
  Gift,
  ListChecks,
  Mail,
  Sparkle,
  Sparkles,
  Timer,
  Users,
  Wallet,
  ShoppingCart,
  ExternalLink,
  House,
  MapPinned,
  UtensilsCrossed,
  ShieldCheck,
  WandSparkles,
  Calculator,
} from "lucide-react";

type NavTab =
  | "overview"
  | "theme"
  | "shopping"
  | "checklist"
  | "guests"
  | "bring"
  | "budget"
  | "timeline";

export function OverviewTab({
  partyId,
  onNavigate,
}: {
  partyId: string;
  onNavigate: (tab: NavTab) => void;
}) {
  const { getParty, updateParty } = useParties();
  const party = getParty(partyId)!;
  const [inviteOpen, setInviteOpen] = useState(false);

  const days = daysUntil(party.date);
  const dateTbd = planningDetailIsOpen(party, "date");
  const budgetTbd = planningDetailIsOpen(party, "budget");
  const g = guestCounts(party);
  const spent = totalSpent(party);
  const remainingEst = shoppingProjectedRemaining(party);
  const projected = spent + remainingEst;
  const overBudget = !budgetTbd && projected > party.budget;
  const bucketIdx = (b: Task["bucket"]) => BUCKETS.indexOf(b);
  const sortedIncomplete = [...party.tasks]
    .filter((t) => !t.done)
    .sort((a, b) => bucketIdx(a.bucket) - bucketIdx(b.bucket));
  const planningMoves = sortedIncomplete.filter((task) => planningDetailForTask(task));
  const hasPlanningMoves = planningMoves.length > 0;
  const upNext = hasPlanningMoves ? planningMoves : sortedIncomplete.slice(0, 3);

  const noReply = party.guests.filter((gu) => gu.rsvp === "invited").slice(0, 4);
  const partyWeek = !dateTbd && days <= 7 && days >= 0;
  const localSuggestions = localPlanningSuggestions(party);
  const playbook = partyPlaybook({
    occasion: party.occasion,
    profile: party.planningProfile,
    startTime: party.startTime,
    holidayPackId: party.holidayPackId,
  });
  const quantities = partyQuantityPlan(party.planningProfile, {
    occasion: party.occasion,
    holidayPackId: party.holidayPackId,
  });
  const guestPlan = guestPlanSnapshot(party);

  const toggleTask = (id: string) =>
    updateParty(partyId, (p) => ({
      ...p,
      tasks: p.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    }));

  return (
    <div className="space-y-6">
      {/* Journey actions — always show working links to the pages that exist for this party */}
      <PartyJourneyActions
        partyId={partyId}
        hasBring={(party.bringBoard ?? []).length > 0}
        hasPhotoDrop={!!party.photoDrop}
        rsvpToken={party.rsvpToken}
        dateTbd={dateTbd}
        onOpenInvite={() => setInviteOpen(true)}
        onOpenBring={() => onNavigate("bring" as NavTab)}
      />

      {playbook && (
        <PartyIntelligenceCard
          partyId={party.id}
          playbook={playbook}
          profile={party.planningProfile}
          onNavigate={onNavigate}
        />
      )}
      {guestPlan && (
        <GuestPlanImpactCard partyId={party.id} snapshot={guestPlan} onNavigate={onNavigate} />
      )}
      {quantities && <PartyQuantityCard partyId={party.id} plan={quantities} />}

      {/* Next-best actions: unresolved inputs become actions, never checkboxes. */}
      <section
        aria-label={hasPlanningMoves ? "Your next moves" : "Up next tasks"}
        className="rounded-2xl border border-border bg-card p-5 shadow-card"
      >
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          <h3 className="font-display text-lg font-semibold text-secondary">
            {hasPlanningMoves ? "Your next moves" : "Up next"}
          </h3>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => onNavigate("checklist")}
          >
            All tasks <ArrowRight />
          </Button>
        </div>
        {hasPlanningMoves && (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Pick whichever feels easiest. One answer is enough—the rest can wait.
          </p>
        )}
        {upNext.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            You're caught up. Nothing left on the checklist.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {upNext.map((task) => {
              const planningDetail = planningDetailForTask(task);
              return (
                <li
                  key={task.id}
                  data-testid={planningDetail ? `next-move-${planningDetail}` : undefined}
                  className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-background/60 px-3 py-2"
                >
                  {planningDetail ? (
                    <>
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                        aria-hidden
                      >
                        <PlanningMoveIcon detail={planningDetail} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-secondary">{task.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {planningMoveCopy(planningDetail).hint}
                        </div>
                      </div>
                      {planningDetail === "theme" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-11 shrink-0"
                          onClick={() => onNavigate("theme")}
                        >
                          {planningMoveCopy(planningDetail).action}
                        </Button>
                      ) : (
                        <EditDetailsDialog
                          partyId={partyId}
                          initialField={planningDetail}
                          triggerLabel={planningMoveCopy(planningDetail).action}
                        />
                      )}
                    </>
                  ) : (
                    <>
                      <Checkbox
                        checked={task.done}
                        onClick={(event) => {
                          if (!task.done) celebrateAtEvent("micro", event);
                        }}
                        onCheckedChange={() => toggleTask(task.id)}
                        className="h-5 w-5"
                        aria-label={`Complete: ${task.title}`}
                      />
                      <div className="min-w-0 flex-1 py-1">
                        <div className="text-sm font-medium text-secondary">{task.title}</div>
                        {task.reason && (
                          <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                            {task.reason}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <TaskDetailsDialog partyId={partyId} task={task} />
                          {task.action && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="min-h-11"
                              onClick={() => onNavigate(task.action!)}
                            >
                              {TASK_ACTION_LABELS[task.action]} <ArrowRight />
                            </Button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="local-planning-title"
        data-testid="local-planning"
        className="overflow-hidden rounded-2xl border border-border bg-card shadow-card"
      >
        <div className="border-b border-border bg-primary/5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <MapPinned className="h-4 w-4 text-primary" aria-hidden />
                <h3
                  id="local-planning-title"
                  className="font-display text-lg font-semibold text-secondary"
                >
                  Make it local
                </h3>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                Confetti gives you the paths. Maps gives you current businesses, ratings, and
                hours—so we never pretend inventory is live when it isn't.
              </p>
            </div>
            {!locationIsSpecific(party.location) && (
              <EditDetailsDialog partyId={party.id} triggerLabel="Add city or ZIP" />
            )}
          </div>
        </div>
        <div className="grid gap-px bg-border sm:grid-cols-3">
          {localSuggestions.map((suggestion) => (
            <article key={suggestion.id} className="flex flex-col bg-card p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <LocalPlanningIcon kind={suggestion.kind} />
              </div>
              <h4 className="mt-3 font-display text-base font-semibold text-secondary">
                {suggestion.title}
              </h4>
              <p className="mt-1 flex-1 text-sm leading-6 text-muted-foreground">
                {suggestion.reason}
              </p>
              {suggestion.searchUrl && suggestion.searchLabel ? (
                <Button asChild variant="outline" size="sm" className="mt-4 min-h-11">
                  <a
                    href={suggestion.searchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                  >
                    {suggestion.searchLabel} <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 min-h-11"
                  onClick={() => onNavigate(suggestion.action ?? "theme")}
                >
                  {suggestion.action === "shopping" ? "Open the list" : "Build this version"}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </article>
          ))}
        </div>
        <p className="px-5 py-3 text-[11px] leading-5 text-muted-foreground">
          Search links are starting points, not endorsements. Confirm pricing, fit, accessibility,
          reviews, and availability with each provider.
        </p>
      </section>

      {/* RSVP snapshot */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="font-display text-lg font-semibold text-secondary">RSVP snapshot</h3>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => onNavigate("guests")}
          >
            Manage guests <ArrowRight />
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="success">{g.yes} yes</Badge>
          <Badge variant="warning">{g.maybe} maybe</Badge>
          <Badge variant="destructive">{g.no} no</Badge>
          <Badge variant="soft">{g.invited} no reply</Badge>
        </div>
        {noReply.length > 0 && (
          <div className="mt-4 rounded-xl bg-warning/10 p-3 text-sm text-warning-foreground">
            <div className="flex items-center gap-2 font-medium">
              <CalendarClock className="h-4 w-4" />
              Time to nudge
            </div>
            <p className="mt-1 text-muted-foreground">
              {noReply.map((n) => n.name).join(", ")}
              {g.invited > noReply.length ? ` and ${g.invited - noReply.length} more` : ""} haven't
              replied yet.
            </p>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="festive" size="sm" onClick={() => setInviteOpen(true)}>
            <Mail /> Create invite
          </Button>
          <RsvpShareButton partyId={partyId} />
        </div>
      </section>
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} partyId={partyId} />

      {/* Budget health */}
      <section
        className={`rounded-2xl border p-5 shadow-card ${
          overBudget ? "border-warning bg-warning/10" : "border-border bg-card"
        }`}
      >
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <h3 className="font-display text-lg font-semibold text-secondary">Budget health</h3>
          {overBudget && (
            <Badge variant="warning" className="ml-auto">
              <AlertTriangle className="mr-1 h-3 w-3" /> Projected over
            </Badge>
          )}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <MiniStat label="Spent" value={`$${spent}`} />
          <MiniStat label="Est. remaining" value={`$${remainingEst}`} />
          <MiniStat label="Projected" value={`$${projected}`} emphasize={overBudget} />
        </div>
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            {budgetTbd ? (
              <>
                <span>Budget to decide</span>
                <span>Estimates saved</span>
              </>
            ) : (
              <>
                <span>Budget ${party.budget}</span>
                <span>
                  {party.budget ? Math.round((projected / party.budget) * 100) : 0}% projected
                </span>
              </>
            )}
          </div>
          <Progress
            value={!budgetTbd && party.budget ? Math.min(100, (projected / party.budget) * 100) : 0}
            aria-label="Budget used"
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onNavigate("budget")}>
            <Wallet /> Budget details
          </Button>
          <Button variant="outline" size="sm" onClick={() => onNavigate("shopping")}>
            <ShoppingCart /> Shopping list
          </Button>
        </div>
      </section>

      {/* Party week */}
      {partyWeek && (
        <section className="rounded-2xl border border-primary/40 bg-primary/5 p-5 shadow-card">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-display text-lg font-semibold text-secondary">Party week</h3>
          </div>
          <p className="mt-2 text-sm text-secondary">
            {days === 0
              ? "It's party day. Walk the setup plan and run the day-of timeline."
              : `${days} day${days === 1 ? "" : "s"} to go. Lock the run of show and review the theme setup plan.`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="festive" size="sm" onClick={() => onNavigate("timeline")}>
              Open Timeline <ArrowRight />
            </Button>
            <Button variant="outline" size="sm" onClick={() => onNavigate("theme")}>
              Setup plan
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function GuestPlanImpactCard({
  partyId,
  snapshot,
  onNavigate,
}: {
  partyId: string;
  snapshot: GuestPlanSnapshot;
  onNavigate: (tab: NavTab) => void;
}) {
  const { updateParty } = useParties();

  const applyCurrentReplies = () => {
    const suggestion = snapshot.countSuggestion;
    if (!suggestion) {
      onNavigate("guests");
      return;
    }
    updateParty(partyId, (party) => {
      const profile = {
        version: 1 as const,
        ...party.planningProfile,
        expectedAdults: suggestion.adults,
        expectedKids: suggestion.kids,
      };
      const reconciled = reconcilePartyPlaybook(party, profile, newId);
      const resizedShopping = resizePartySizedShopping(reconciled.shoppingItems, suggestion.total);
      return resolvePlanningDetails(
        {
          ...reconciled,
          guestEstimate: suggestion.total,
          shoppingItems: resizedShopping.items,
        },
        ["guests"],
      );
    });
    toast.success(
      `Quantities now use ${suggestion.total} current yes/maybe ${suggestion.total === 1 ? "reply" : "replies"}.`,
    );
    celebrate("micro");
  };

  const actOnImpact = (impact: GuestPlanImpact) => {
    if (impact.id === "headcount" && snapshot.countSuggestion) {
      applyCurrentReplies();
      return;
    }
    if (impact.id !== "headcount" && !impact.applied) {
      updateParty(partyId, (party) => materializeGuestImpact(party, impact, newId).party);
      toast.success(
        impact.id === "arrival"
          ? "Arrival plan added to the timeline"
          : "Planning check added to the checklist",
      );
      celebrate("micro");
    }
    onNavigate(impact.action);
  };

  return (
    <section
      aria-labelledby="guest-plan-impact-title"
      data-testid="guest-plan-impact-card"
      className="overflow-hidden rounded-3xl border border-primary/20 bg-card shadow-card"
    >
      <div className="bg-[linear-gradient(135deg,hsl(var(--primary)/0.1),hsl(var(--accent)/0.08))] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary"
            aria-hidden
          >
            <Users className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Live from your guest list
            </div>
            <h3
              id="guest-plan-impact-title"
              className="mt-1 font-display text-xl font-semibold text-secondary"
            >
              Guest answers, turned into a plan
            </h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              Confetti translates replies into the food, timing, comfort, and responsibility checks
              they affect—so you do not have to reread every answer and remember the consequence.
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:max-w-xl">
          <MiniStat label="Confirmed" value={String(snapshot.confirmed.total)} />
          <MiniStat label="Maybe" value={String(snapshot.maybe.total)} />
          <MiniStat label="Waiting" value={String(snapshot.pending.total)} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/15 bg-background/80 px-2.5 py-1">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
            Rule-based, not guessed
          </span>
          <span className="rounded-full border border-primary/15 bg-background/80 px-2.5 py-1">
            Nothing changes without you
          </span>
        </div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
        {snapshot.impacts.map((impact) => (
          <article
            key={impact.id}
            data-testid={`guest-plan-impact-${impact.id}`}
            className={`flex flex-col rounded-2xl border p-4 ${
              impact.priority === "action"
                ? "border-primary/20 bg-primary/[0.035]"
                : "border-border bg-background/60"
            }`}
          >
            <div className="flex items-start gap-2">
              {impact.priority === "action" ? (
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              ) : (
                <ShieldCheck
                  className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              )}
              <div className="min-w-0">
                <h4 className="text-sm font-semibold leading-5 text-secondary">{impact.title}</h4>
                <p className="mt-1 text-xs leading-5 text-secondary">{impact.summary}</p>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{impact.reason}</p>
              </div>
            </div>
            <Button
              variant={impact.priority === "action" ? "outline" : "ghost"}
              size="sm"
              className="mt-3 min-h-11 self-start"
              onClick={() => actOnImpact(impact)}
            >
              {impact.actionLabel} <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}

function PartyQuantityCard({ partyId, plan }: { partyId: string; plan: PartyQuantityPlan }) {
  return (
    <section
      aria-labelledby="party-quantity-title"
      data-testid="party-quantity-card"
      className="rounded-3xl border border-border bg-card p-5 shadow-card sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"
            aria-hidden
          >
            <Calculator className="h-4 w-4" />
          </span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Working estimate
            </div>
            <h3
              id="party-quantity-title"
              className="mt-0.5 font-display text-xl font-semibold text-secondary"
            >
              Enough for {plan.children} {plan.children === 1 ? "child" : "children"} and{" "}
              {plan.adults} {plan.adults === 1 ? "adult" : "adults"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              A useful starting point—with every assumption visible.
            </p>
          </div>
        </div>
        <EditDetailsDialog partyId={partyId} triggerLabel="Adjust counts" />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {plan.estimates.map((item) => (
          <div key={item.id} className="rounded-2xl border border-border bg-background/70 p-3">
            <div className="font-display text-2xl font-semibold text-secondary">
              {item.recommendation}
            </div>
            <div className="mt-0.5 text-xs font-medium text-secondary">{item.label}</div>
            <div className="mt-1 text-[10px] leading-4 text-muted-foreground">
              {item.assumption}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] leading-4 text-muted-foreground">{plan.note}</p>
    </section>
  );
}

function PartyIntelligenceCard({
  partyId,
  playbook,
  profile,
  onNavigate,
}: {
  partyId: string;
  playbook: PartyPlaybook;
  profile?: PartyPlanningProfile;
  onNavigate: (tab: NavTab) => void;
}) {
  const startingPath = preschoolPartyPaths(profile)[0];
  const pathIsRecommendation =
    startingPath != null && (!profile?.format || profile.format === "help-me-choose");

  return (
    <section
      aria-labelledby="party-intelligence-title"
      data-testid="party-intelligence-card"
      className="overflow-hidden rounded-3xl border border-primary/20 bg-card shadow-card"
    >
      <div className="bg-primary/[0.065] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary"
            aria-hidden
          >
            <WandSparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Confetti understands this party
            </div>
            <h3
              id="party-intelligence-title"
              className="mt-1 font-display text-xl font-semibold text-secondary"
            >
              {playbook.title}
            </h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              {playbook.promise}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-secondary">
          {playbook.recommendedDurationMinutes && (
            <span className="rounded-full border border-primary/15 bg-background px-3 py-1.5">
              {playbook.recommendedDurationMinutes}-minute flow
            </span>
          )}
          <span className="rounded-full border border-primary/15 bg-background px-3 py-1.5">
            {playbook.rsvpQuestions.length} useful RSVP questions
          </span>
          <span className="rounded-full border border-primary/15 bg-background px-3 py-1.5">
            {playbook.guardrails.length}{" "}
            {playbook.ageBand ? "age-aware guardrails" : "planning guardrails"}
          </span>
        </div>

        {startingPath && (
          <div
            data-testid="preschool-starting-path"
            className="mt-4 rounded-2xl border border-primary/15 bg-background p-4"
          >
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
              Starting path · {pathIsRecommendation ? "Confetti recommendation" : "Your choice"}
            </div>
            <div className="mt-1 font-display text-base font-semibold text-secondary">
              {startingPath.title}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {startingPath.recommendationReason}
            </p>
            <p className="mt-2 text-xs font-medium leading-5 text-secondary">
              Next: {startingPath.nextStep}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                onClick={() => {
                  if (startingPath.format === "home") {
                    onNavigate("theme");
                    return;
                  }
                  document
                    .getElementById("local-planning-title")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {startingPath.format === "home"
                  ? "Build the at-home version"
                  : "Compare local options"}
                <ArrowRight />
              </Button>
              <EditDetailsDialog partyId={partyId} triggerLabel="Change path" />
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-px bg-border md:grid-cols-[1.15fr_0.85fr]">
        <div className="bg-card p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-secondary">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
            Already handled in your plan
          </div>
          <ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            {playbook.guardrails.slice(0, 4).map((item) => (
              <li key={item.id} className="rounded-xl bg-muted/55 px-3 py-2.5">
                <span className="font-medium text-secondary">{item.title}</span>
                <span className="mt-0.5 block text-xs leading-5">{item.detail}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col justify-between bg-card p-5">
          <div>
            <div className="text-sm font-semibold text-secondary">The next no-brainer</div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Review the party flow first. Then your checklist, food, and guest communication can
              follow the same plan.
            </p>
          </div>
          <Button
            variant="festive"
            size="sm"
            className="mt-4 min-h-11 w-full"
            onClick={() => onNavigate("timeline")}
          >
            Review
            {playbook.recommendedDurationMinutes
              ? ` the ${playbook.recommendedDurationMinutes}-minute flow`
              : " the party flow"}{" "}
            <ArrowRight />
          </Button>
        </div>
      </div>
    </section>
  );
}

function LocalPlanningIcon({ kind }: { kind: LocalPlanningKind }) {
  if (kind === "food") return <UtensilsCrossed className="h-4 w-4" aria-hidden />;
  if (kind === "at-home") return <House className="h-4 w-4" aria-hidden />;
  return <MapPinned className="h-4 w-4" aria-hidden />;
}

function planningMoveCopy(detail: PlanningDetail): { action: string; hint: string } {
  switch (detail) {
    case "date":
      return { action: "Choose date", hint: "Unlocks invite sharing and a real countdown." };
    case "guests":
      return { action: "Estimate guests", hint: "A rough number is plenty for now." };
    case "budget":
      return { action: "Set budget", hint: "Choose a comfortable ceiling—or decide later." };
    case "theme":
      return { action: "Explore looks", hint: "Find a direction without locking it in." };
  }
}

function PlanningMoveIcon({ detail }: { detail: PlanningDetail }) {
  switch (detail) {
    case "date":
      return <CalendarClock className="h-4 w-4" />;
    case "guests":
      return <Users className="h-4 w-4" />;
    case "budget":
      return <Wallet className="h-4 w-4" />;
    case "theme":
      return <Sparkles className="h-4 w-4" />;
  }
}

function MiniStat({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-xl bg-background/70 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={`mt-0.5 font-display text-lg font-semibold ${
          emphasize ? "text-warning-foreground" : "text-secondary"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Journey shortcuts on the Overview: every control routes to something real.
 * Reveal + Day-of always exist. Guest link copies or opens invite. Bring Board
 * and Photo Drop navigate into the shared "Bring & Photos" workspace tab where
 * hosts edit both features — no dead pills.
 */
function PartyJourneyActions({
  partyId,
  hasBring,
  hasPhotoDrop,
  rsvpToken,
  dateTbd,
  onOpenInvite,
  onOpenBring,
}: {
  partyId: string;
  hasBring: boolean;
  hasPhotoDrop: boolean;
  rsvpToken?: string;
  dateTbd: boolean;
  onOpenInvite: () => void;
  onOpenBring: () => void;
}) {
  const copyGuestLink = async () => {
    if (!rsvpToken || dateTbd) {
      onOpenInvite();
      return;
    }
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/rsvp/${rsvpToken}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Guest link copied.");
      celebrate("micro");
    } catch {
      toast.error("Couldn't copy — try the share button in Guests.");
    }
  };

  return (
    <section
      aria-label="Party quick actions"
      className="rounded-2xl border border-border bg-card p-3 shadow-card"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="festive" className="min-h-11">
          <Link to="/party/$id/reveal" params={{ id: partyId }}>
            <Sparkle className="h-4 w-4" /> Reveal
          </Link>
        </Button>
        <Button asChild size="sm" variant="secondary" className="min-h-11">
          <Link to="/party/$id/day-of" params={{ id: partyId }}>
            <Timer className="h-4 w-4" /> Day-of Mode
          </Link>
        </Button>
        <Button size="sm" variant="outline" className="min-h-11" onClick={copyGuestLink}>
          <Copy className="h-4 w-4" />{" "}
          {dateTbd ? "Finish invite details" : rsvpToken ? "Copy guest link" : "Create invite"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="min-h-11"
          onClick={onOpenBring}
          aria-label={hasBring ? "Open Bring Board" : "Set up Bring Board"}
        >
          <Gift className="h-4 w-4" />
          {hasBring ? "Bring Board" : "Set up Bring Board"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="min-h-11"
          onClick={onOpenBring}
          aria-label={hasPhotoDrop ? "Open Photo Drop" : "Set up Photo Drop"}
        >
          <Camera className="h-4 w-4" />
          {hasPhotoDrop ? "Photo Drop" : "Set up Photo Drop"}
        </Button>
      </div>
    </section>
  );
}
