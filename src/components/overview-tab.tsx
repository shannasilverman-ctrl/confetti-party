import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { RsvpShareButton } from "@/components/rsvp-share-button";
import { InviteDialog } from "@/components/invite-dialog";
import { EditDetailsDialog } from "@/components/edit-details-dialog";
import {
  BUCKETS,
  daysUntil,
  guestCounts,
  progressPct,
  shoppingProjectedRemaining,
  totalSpent,
  useParties,
  type Task,
} from "@/lib/party-context";
import { themeById } from "@/lib/themes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Clock,
  ListChecks,
  MapPin,
  Mail,
  Sparkles,
  Users,
  Wallet,
  ShoppingCart,
} from "lucide-react";

type NavTab =
  | "overview"
  | "theme"
  | "shopping"
  | "checklist"
  | "guests"
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
  const prog = progressPct(party);
  const g = guestCounts(party);
  const spent = totalSpent(party);
  const remainingEst = shoppingProjectedRemaining(party);
  const projected = spent + remainingEst;
  const overBudget = projected > party.budget;
  const theme = themeById(party.themeId);

  const bucketIdx = (b: Task["bucket"]) => BUCKETS.indexOf(b);
  const upNext = [...party.tasks]
    .filter((t) => !t.done)
    .sort((a, b) => bucketIdx(a.bucket) - bucketIdx(b.bucket))
    .slice(0, 3);

  const noReply = party.guests.filter((gu) => gu.rsvp === "invited").slice(0, 4);
  const partyWeek = days <= 7 && days >= 0;

  const toggleTask = (id: string) =>
    updateParty(partyId, (p) => ({
      ...p,
      tasks: p.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    }));

  return (
    <div className="space-y-6">
      {/* Header card */}
      <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-card sm:p-7">
        <div className="absolute inset-0 bg-confetti opacity-25" aria-hidden />
        <div className="relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-5">
          <CountdownRing days={days} progress={prog} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {theme && <Badge variant="accent">{theme.name}</Badge>}
              <Badge variant="soft">
                {days > 0
                  ? `${days} days to go`
                  : days === 0
                    ? "Today"
                    : `${Math.abs(days)} days ago`}
              </Badge>
            </div>
            <h2 className="mt-2 truncate font-display text-2xl font-semibold text-secondary sm:text-3xl">
              {party.name}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {prog}% planned ·{" "}
              {party.tasks.filter((t) => t.done).length}/{party.tasks.length} tasks complete
            </p>
          </div>
        </div>
      </section>

      {/* Up next */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" />
          <h3 className="font-display text-lg font-semibold text-secondary">Up next</h3>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => onNavigate("checklist")}
          >
            All tasks <ArrowRight />
          </Button>
        </div>
        {upNext.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            You're caught up. Nothing left on the checklist.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {upNext.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-background/60 px-3 py-2"
              >
                <Checkbox
                  checked={t.done}
                  onCheckedChange={() => toggleTask(t.id)}
                  className="h-5 w-5"
                  aria-label={`Complete: ${t.title}`}
                />
                <span className="flex-1 min-w-0 truncate text-sm text-secondary">{t.title}</span>
                <span className="hidden text-[11px] text-muted-foreground sm:inline">
                  {t.bucket}
                </span>
              </li>
            ))}
          </ul>
        )}
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
              {g.invited > noReply.length ? ` and ${g.invited - noReply.length} more` : ""}
              {" "}haven't replied yet.
            </p>
          </div>
        )}
        <div className="mt-4">
          <RsvpShareButton partyId={partyId} />
        </div>
      </section>

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
          <MiniStat
            label="Projected"
            value={`$${projected}`}
            emphasize={overBudget}
          />
        </div>
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Budget ${party.budget}</span>
            <span>
              {party.budget
                ? Math.round((projected / party.budget) * 100)
                : 0}
              % projected
            </span>
          </div>
          <Progress
            value={
              party.budget ? Math.min(100, (projected / party.budget) * 100) : 0
            }
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

function CountdownRing({ days, progress }: { days: number; progress: number }) {
  const size = 96;
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, progress));
  const offset = c - (pct / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="hsl(var(--muted))"
          strokeWidth={8}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#hostwell-ring)"
          strokeWidth={8}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
        <defs>
          <linearGradient id="hostwell-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="100%" stopColor="hsl(var(--accent))" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display text-xl font-semibold text-secondary">
          {days < 0 ? "—" : days}
        </div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {days === 1 ? "day" : "days"}
        </div>
      </div>
    </div>
  );
}
