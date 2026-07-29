// Day-of Host Mode — calm mobile-first surface with next actions,
// timeline, arrivals and quick host updates.

import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Circle, Clock3, Info, Megaphone, UserCheck } from "lucide-react";
import { useParties, newId, isSeededDemoPartyId, planningDetailForTask } from "@/lib/party-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { BrandLockup } from "@/components/brand";
import { celebrate } from "@/components/confetti-burst";
import { TaskDetailsDialog } from "@/components/task-details-dialog";
import { prioritizeDayOfTasks } from "@/lib/day-of-actions";
import { dayOfRunSheet, formatMinutesUntil } from "@/lib/day-of-run-sheet";
import { OfflineSnapshotNotice } from "@/components/offline-snapshot-notice";

export const Route = createFileRoute("/party/$id_/day-of")({
  component: DayOfPage,
  head: () => ({
    meta: [
      { title: "Day-of Mode · Confetti" },
      {
        name: "description",
        content: "Run the gathering with next actions, arrivals, timeline, and guest-page updates.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function DayOfPage() {
  const { id } = Route.useParams();
  const { parties, status, refetch, updateParty, isDemo } = useParties();
  const party = parties.find((p) => p.id === id);
  const [note, setNote] = useState("");
  const [postStatus, setPostStatus] = useState("");
  const [now, setNow] = useState(() => new Date());
  // Compute derived state before any early return so hook order is stable
  // across renders where the party may briefly disappear (e.g. delete).
  const nextThree = useMemo(() => prioritizeDayOfTasks(party?.tasks ?? []), [party?.tasks]);
  const runSheet = useMemo(
    () => dayOfRunSheet(party?.date ?? "", party?.startTime, party?.timeline ?? [], now),
    [party?.date, party?.startTime, party?.timeline, now],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <div role="status" className="text-sm text-muted-foreground">
          Loading your party…
        </div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center">
          <h1 className="font-display text-2xl text-secondary">We couldn’t load your party</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Check your connection and try again. Your plan is still safe.
          </p>
          <Button className="mt-4" variant="festive" onClick={refetch}>
            Try again
          </Button>
        </div>
      </main>
    );
  }

  if (!party) throw notFound();
  const timeline = party.timeline ?? [];
  const yesGuests = party.guests.filter((g) => g.rsvp === "yes");
  const checkins = party.checkins ?? {};
  const isSeededSample = isDemo && isSeededDemoPartyId(party.id);
  const isLocalParty = isDemo && !isSeededSample;

  function toggleTask(taskId: string, evt?: React.MouseEvent) {
    updateParty(party!.id, (p) => ({
      ...p,
      tasks: p.tasks.map((task) =>
        task.id === taskId && !planningDetailForTask(task) ? { ...task, done: !task.done } : task,
      ),
    }));
    if (evt) celebrate("micro", { x: evt.clientX, y: evt.clientY });
  }

  function toggleCheckin(guestId: string, evt?: React.MouseEvent) {
    const wasHere = !!checkins[guestId];
    updateParty(party!.id, (p) => {
      const next = { ...(p.checkins ?? {}) };
      if (next[guestId]) delete next[guestId];
      else next[guestId] = new Date().toISOString();
      return { ...p, checkins: next };
    });
    if (evt && !wasHere) celebrate("micro", { x: evt.clientX, y: evt.clientY });
  }

  function postUpdate() {
    const text = note.trim();
    if (!text) return;
    updateParty(party!.id, (p) => ({
      ...p,
      hostUpdates: [
        { id: newId(), text, at: new Date().toISOString() },
        ...(p.hostUpdates ?? []),
      ].slice(0, 20),
    }));
    setNote("");
    const message = isSeededSample
      ? "Sample update added here. No guests were notified."
      : isLocalParty
        ? "Update saved on this device only. No guests were notified."
        : "Update posted to the guest page.";
    setPostStatus(message);
  }

  const arrived = Object.keys(checkins).length;
  const isLive = runSheet.phase === "before" || runSheet.phase === "live";
  const runSheetEyebrow =
    runSheet.phase === "preview"
      ? "Run sheet preview"
      : runSheet.phase === "past"
        ? "Past run sheet"
        : runSheet.phase === "empty"
          ? "Flexible run sheet"
          : "Live run sheet";
  const firstLabel =
    runSheet.phase === "preview" ? "Start" : runSheet.phase === "past" ? "Last planned" : "Now";
  const secondLabel =
    runSheet.phase === "preview" ? "Then" : runSheet.phase === "past" ? "After" : "Next";
  const firstMoment =
    runSheet.phase === "preview"
      ? runSheet.next
      : runSheet.phase === "before"
        ? null
        : runSheet.current;
  const secondMoment = runSheet.phase === "preview" ? runSheet.following : runSheet.next;
  const countdown = isLive ? formatMinutesUntil(runSheet.minutesUntilNext) : null;
  const deviceTime = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(now);

  return (
    <div className="min-h-screen bg-background">
      <main
        className="mx-auto max-w-2xl px-4 pt-4"
        style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
      >
        <header className="flex items-center justify-between gap-2">
          <Button asChild variant="ghost" size="sm" className="gap-1 min-h-11">
            <Link to="/party/$id" params={{ id }}>
              <ArrowLeft className="h-4 w-4" /> Workspace
            </Link>
          </Button>
          <BrandLockup />
          <div className="w-11" aria-hidden />
        </header>

        <OfflineSnapshotNotice className="mt-3" />

        {isDemo && (
          <div
            className="mt-3 flex items-start gap-2 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-secondary"
            role="note"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            {isSeededSample ? (
              <span>
                <strong>Sample Day-of Mode.</strong> Try tasks, check-ins, and updates
                safely—nothing here notifies real guests.
              </span>
            ) : (
              <span>
                <strong>Saved on this device.</strong> Day-of changes stay in this browser. Sign up
                before inviting guests or using a shared guest page.
              </span>
            )}
          </div>
        )}

        <section
          className="mt-4 overflow-hidden rounded-3xl border border-secondary/15 bg-secondary text-secondary-foreground shadow-elevated"
          aria-labelledby="day-of-run-sheet-title"
          data-testid="day-of-run-sheet"
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/85">
              {runSheetEyebrow}
            </div>
            {isLive && (
              <div className="flex items-center gap-1.5 text-xs font-medium tabular-nums text-white/90">
                <Clock3 className="h-3.5 w-3.5" aria-hidden />
                <span>{deviceTime}</span>
                <span className="sr-only">on this device</span>
              </div>
            )}
          </div>
          <div className="px-5 pb-5 pt-4">
            <h1
              id="day-of-run-sheet-title"
              className="font-display text-3xl font-semibold tracking-[-0.03em] text-white"
            >
              {runSheet.phase === "before"
                ? "Before the run sheet starts"
                : runSheet.phase === "empty"
                  ? "Keep the day flexible"
                  : runSheet.phase === "past"
                    ? "The planned day has passed"
                    : runSheet.phase === "preview"
                      ? "See the day before it gets busy"
                      : "Stay with this moment"}
            </h1>
            <p className="mt-2 max-w-lg text-sm leading-6 text-white/85">
              {runSheet.phase === "preview"
                ? "This is a preview, not a live clock. On the gathering date, Confetti will keep now and next in view."
                : runSheet.phase === "past"
                  ? "This schedule is preserved as a record. Confetti is not presenting it as live."
                  : runSheet.phase === "empty"
                    ? "Add times in the workspace whenever a run of show would help. Untimed moments stay flexible."
                    : "Based on this device’s time. Adjust the timeline in the workspace if the day changes."}
            </p>

            {runSheet.phase !== "empty" && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/15 bg-white/10 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/90">
                    {firstLabel}
                  </div>
                  {firstMoment ? (
                    <>
                      <div className="mt-2 text-lg font-semibold leading-snug text-white">
                        {firstMoment.item.activity}
                      </div>
                      <div className="mt-1 text-sm tabular-nums text-white/90">
                        {firstMoment.item.time}
                      </div>
                    </>
                  ) : (
                    <div className="mt-2 text-lg font-semibold leading-snug text-white">
                      Get ready at your own pace
                    </div>
                  )}
                </div>
                <div className="rounded-2xl border border-primary/40 bg-primary/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/90">
                      {secondLabel}
                    </div>
                    {countdown && (
                      <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-semibold tabular-nums text-white">
                        {countdown}
                      </span>
                    )}
                  </div>
                  {secondMoment ? (
                    <>
                      <div className="mt-2 text-lg font-semibold leading-snug text-white">
                        {secondMoment.item.activity}
                      </div>
                      <div className="mt-1 text-sm tabular-nums text-white/90">
                        {secondMoment.item.time}
                      </div>
                    </>
                  ) : (
                    <div className="mt-2 text-lg font-semibold leading-snug text-white">
                      No later timed moment
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="mt-4 rounded-3xl border border-border bg-card p-5 shadow-card">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Day of · {party.name}
          </div>
          <h2 className="mt-1 font-display text-2xl font-semibold text-secondary">
            What needs attention
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Assigned commitments stay visible first, followed by work closest to the gathering.
          </p>
          <ul className="mt-3 space-y-2">
            {nextThree.length === 0 ? (
              <li className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
                All set — you're floating.
              </li>
            ) : (
              nextThree.map((t) => (
                <li
                  key={t.id}
                  className="flex items-start gap-2 rounded-xl border border-border p-2"
                >
                  <button
                    onClick={(e) => toggleTask(t.id, e)}
                    className="flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-muted/40"
                    aria-label={`Complete: ${t.title}`}
                  >
                    <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground">{t.title}</div>
                      <div className="text-xs text-muted-foreground">{t.bucket}</div>
                      {t.reason && (
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {t.reason}
                        </p>
                      )}
                    </div>
                  </button>
                  <TaskDetailsDialog partyId={party.id} task={t} />
                </li>
              ))
            )}
          </ul>
        </section>

        <Card className="mt-4 p-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Megaphone className="h-4 w-4 text-primary" />{" "}
            {isSeededSample
              ? "Try a sample guest update"
              : isLocalParty
                ? "Add a local guest-page update"
                : "Post an update to the guest page"}
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Running 15 minutes late — pizza's on the way!"
            rows={2}
            maxLength={280}
          />
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="festive" onClick={postUpdate} disabled={!note.trim()}>
              {isSeededSample
                ? "Add sample update"
                : isLocalParty
                  ? "Save local update"
                  : "Post update"}
            </Button>
          </div>
          {postStatus && (
            <p className="mt-2 text-xs text-muted-foreground" role="status" aria-live="polite">
              {postStatus}
            </p>
          )}
          {(party.hostUpdates ?? []).length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {(party.hostUpdates ?? []).slice(0, 3).map((u) => (
                <li
                  key={u.id}
                  className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
                >
                  {u.text}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="mt-4 p-5">
          <div className="mb-2 flex items-center justify-between text-sm font-semibold text-foreground">
            <span className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-primary" /> Arrivals
            </span>
            <span className="text-xs text-muted-foreground">
              {arrived} / {yesGuests.length} in
            </span>
          </div>
          {yesGuests.length === 0 ? (
            <div className="text-sm text-muted-foreground">No yes RSVPs to check in.</div>
          ) : (
            <ul className="space-y-1.5">
              {yesGuests.map((g) => {
                const here = !!checkins[g.id];
                return (
                  <li key={g.id}>
                    <button
                      onClick={(e) => toggleCheckin(g.id, e)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${here ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"}`}
                    >
                      {here ? (
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground" />
                      )}
                      <span className="flex-1 text-sm text-foreground">{g.name}</span>
                      {here && <span className="text-[11px] text-muted-foreground">here</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {timeline.length > 0 && (
          <Card className="mt-4 p-5">
            <div className="mb-1 text-sm font-semibold text-foreground">Full run sheet</div>
            <p className="mb-3 text-xs leading-5 text-muted-foreground">
              Timed moments follow this device’s clock. Flexible moments remain unranked.
            </p>
            <ul className="space-y-2 text-sm">
              {timeline.map((item) => (
                <li
                  key={item.id}
                  className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${
                    runSheet.current?.item.id === item.id
                      ? "border-secondary/30 bg-secondary/5"
                      : runSheet.next?.item.id === item.id
                        ? "border-primary/30 bg-primary/5"
                        : "border-transparent"
                  }`}
                  aria-current={runSheet.current?.item.id === item.id ? "step" : undefined}
                >
                  <span className="mt-0.5 min-w-16 text-xs font-medium tabular-nums text-muted-foreground">
                    {item.time || "Flexible"}
                  </span>
                  <span className="min-w-0 flex-1 text-foreground">{item.activity}</span>
                  {runSheet.current?.item.id === item.id && (
                    <span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-secondary-foreground">
                      Now
                    </span>
                  )}
                  {runSheet.next?.item.id === item.id && (
                    <span className="rounded-full bg-primary/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                      {runSheet.phase === "preview" ? "Start" : "Next"}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </main>
    </div>
  );
}
