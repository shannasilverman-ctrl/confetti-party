// Holiday / Party Reveal — a calm summary of the current plan generated
// from the intake conversation. Editable via the existing workspace.

import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  Users,
  Wallet,
  Clock,
  Sparkles,
  ListChecks,
  Package,
  AlertTriangle,
  Info,
  NotebookPen,
} from "lucide-react";
import {
  useParties,
  daysUntil,
  guestCounts,
  totalSpent,
  progressPct,
  OCCASION_LABELS,
} from "@/lib/party-context";
import { themeById } from "@/lib/themes";
import { PACKS } from "@/lib/holiday-packs";
import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RetrospectiveDialog } from "@/components/retrospective-dialog";
import { formatDateOnly } from "@/lib/date-only";

export const Route = createFileRoute("/party/$id_/reveal")({
  component: RevealPage,
});

function RevealPage() {
  const { id } = Route.useParams();
  const { parties, status, refetch, isDemo } = useParties();
  const party = parties.find((p) => p.id === id);

  // PartyProvider hydrates asynchronously for signed-in hosts. Treating
  // the empty pre-hydration array as authoritative turns a valid deep link
  // into a false 404 and can poison the SSR response. Only decide that the
  // party is missing after the provider has reached a terminal state.
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div role="status" className="text-sm text-muted-foreground">
          Loading your party…
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-2xl text-secondary">We couldn’t load your party</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Check your connection and try again. Your plan is still safe.
          </p>
          <Button className="mt-4" variant="festive" onClick={refetch}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!party) throw notFound();

  const theme = themeById(party.themeId);
  const pack = party.holidayPackId ? PACKS[party.holidayPackId as keyof typeof PACKS] : undefined;
  const days = daysUntil(party.date);
  const gc = guestCounts(party);
  const spent = totalSpent(party);
  const pct = progressPct(party);
  const openBring = (party.bringBoard ?? []).filter((b) => b.status === "open").length;
  const nextThree = party.tasks.filter((t) => !t.done).slice(0, 3);

  const risks: string[] = [];
  if (days >= 0 && days <= 7 && openBring > 0) {
    risks.push(
      `${openBring} bring-board item${openBring === 1 ? "" : "s"} still unclaimed with under a week to go.`,
    );
  }
  if (spent > party.budget) {
    risks.push(`Projected spend is over budget by $${Math.round(spent - party.budget)}.`);
  }
  if (gc.yes === 0 && days > 0) {
    risks.push("No yes RSVPs yet — consider a reminder nudge.");
  }

  return (
    <div className="min-h-screen bg-background">
      <div
        className="mx-auto max-w-4xl px-4 pt-4 md:pt-8"
        style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
      >
        <header className="flex items-center justify-between gap-2">
          <Button asChild variant="ghost" size="sm" className="gap-1 min-h-11">
            <Link to="/party/$id" params={{ id }}>
              <ArrowLeft className="h-4 w-4" /> Workspace
            </Link>
          </Button>
          <BrandLockup />
          <Button asChild variant="secondary" size="sm" className="min-h-11">
            <Link to="/party/$id/day-of" params={{ id }}>
              Day of →
            </Link>
          </Button>
        </header>

        {isDemo && (
          <div
            className="mt-3 flex items-start gap-2 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-secondary"
            role="note"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>
              <strong>Sample reveal.</strong> This fictional plan is safe to explore and never
              changes a real event.
            </span>
          </div>
        )}

        <section className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Your reveal
          </div>
          <h1 className="mt-2 font-display text-3xl font-semibold text-secondary md:text-4xl">
            {party.name}
          </h1>
          <div className="mt-1 flex flex-wrap gap-2">
            <Badge variant="secondary">{OCCASION_LABELS[party.occasion]}</Badge>
            {pack && <Badge variant="accent">{pack.label} pack</Badge>}
            {theme && <Badge variant="accent">{theme.name}</Badge>}
          </div>
          <div className="mt-4 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />{" "}
              {formatDateOnly(party.date, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}{" "}
              · {days >= 0 ? `${days} day${days === 1 ? "" : "s"} to go` : "past"}
            </div>
            {party.startTime && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" /> {party.startTime}
              </div>
            )}
            {party.location && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" /> {party.location}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" /> {gc.yes} yes · {gc.maybe} maybe · target{" "}
              {party.guestEstimate}
            </div>
          </div>
          {party.hostNote && (
            <div className="mt-4 rounded-2xl bg-muted/40 p-4 text-sm text-foreground whitespace-pre-wrap">
              {party.hostNote}
            </div>
          )}
        </section>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ListChecks className="h-4 w-4 text-primary" /> Your next three actions
              </div>
              <Button asChild variant="link" size="sm">
                <Link to="/party/$id" params={{ id }}>
                  Open checklist
                </Link>
              </Button>
            </div>
            <ul className="mt-3 space-y-2">
              {nextThree.length === 0 ? (
                <li className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
                  All set — nothing pending.
                </li>
              ) : (
                nextThree.map((t) => (
                  <li key={t.id} className="rounded-xl border border-border px-3 py-2 text-sm">
                    <div className="font-medium text-foreground">{t.title}</div>
                    <div className="text-xs text-muted-foreground">{t.bucket}</div>
                  </li>
                ))
              )}
            </ul>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between text-sm font-semibold text-foreground">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" /> Budget
              </div>
              <div className="tabular-nums">
                ${Math.round(spent)} / ${party.budget}
              </div>
            </div>
            <Progress
              value={Math.min(100, Math.round((spent / Math.max(1, party.budget)) * 100))}
              aria-label="Budget used"
              className="mt-3"
            />
            <div className="mt-2 text-xs text-muted-foreground">Planning progress {pct}%</div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Package className="h-4 w-4 text-primary" /> Bring board
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {(party.bringBoard ?? []).length === 0 ? (
                <>No shared items yet. Add some in the workspace.</>
              ) : (
                <>
                  {(party.bringBoard ?? []).filter((b) => b.status !== "open").length} claimed ·{" "}
                  {openBring} open
                </>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <AlertTriangle className="h-4 w-4 text-primary" /> Risks
            </div>
            {risks.length === 0 ? (
              <div className="mt-2 text-sm text-muted-foreground">Nothing flagged. Keep going.</div>
            ) : (
              <ul className="mt-2 space-y-1.5 text-sm text-foreground">
                {risks.map((r, i) => (
                  <li key={i} className="rounded-lg bg-muted/40 px-3 py-2">
                    {r}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {(days < 0 || party.retrospective) && (
          <Card className="mt-6 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <NotebookPen className="h-4 w-4 text-primary" /> Post-event retrospective
              </div>
              <RetrospectiveDialog partyId={id} />
            </div>
            {party.retrospective ? (
              <ul className="mt-3 space-y-2 text-sm">
                {party.retrospective.worked && (
                  <li className="rounded-lg bg-muted/40 px-3 py-2">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      What worked
                    </div>
                    <div className="mt-0.5 whitespace-pre-wrap">{party.retrospective.worked}</div>
                  </li>
                )}
                {party.retrospective.ranOut && (
                  <li className="rounded-lg bg-muted/40 px-3 py-2">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Ran out / fell short
                    </div>
                    <div className="mt-0.5 whitespace-pre-wrap">{party.retrospective.ranOut}</div>
                  </li>
                )}
                {party.retrospective.changeNext && (
                  <li className="rounded-lg bg-muted/40 px-3 py-2">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Change next time
                    </div>
                    <div className="mt-0.5 whitespace-pre-wrap">
                      {party.retrospective.changeNext}
                    </div>
                  </li>
                )}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Capture what worked, what ran out, and what to change. It'll show up as suggestions
                the next time you clone this party.
              </p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
