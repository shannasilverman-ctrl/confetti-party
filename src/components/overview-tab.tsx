import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { RsvpShareButton } from "@/components/rsvp-share-button";
import { InviteDialog } from "@/components/invite-dialog";
import { EditDetailsDialog } from "@/components/edit-details-dialog";
import {
  BUCKETS,
  daysUntil,
  guestCounts,
  shoppingProjectedRemaining,
  totalSpent,
  useParties,
  planningDetailForTask,
  planningDetailIsOpen,
  type PlanningDetail,
  type Task,
} from "@/lib/party-context";
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
                      <span className="min-w-0 flex-1 truncate text-sm text-secondary">
                        {task.title}
                      </span>
                      <span className="hidden text-[11px] text-muted-foreground sm:inline">
                        {task.bucket}
                      </span>
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
