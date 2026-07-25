// Day-of Host Mode — calm mobile-first surface with next actions,
// timeline, arrivals and quick host updates.

import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Circle, Megaphone, UserCheck } from "lucide-react";
import { useParties, newId } from "@/lib/party-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { BrandLockup } from "@/components/brand";
import { celebrate } from "@/components/confetti-burst";

export const Route = createFileRoute("/party/$id_/day-of")({
  component: DayOfPage,
});

function DayOfPage() {
  const { id } = Route.useParams();
  const { parties, updateParty } = useParties();
  const party = parties.find((p) => p.id === id);
  const [note, setNote] = useState("");
  if (!party) throw notFound();

  if (!party) throw notFound();
  const nextThree = useMemo(() => party.tasks.filter((t) => !t.done).slice(0, 3), [party.tasks]);
  const timeline = party.timeline ?? [];
  const yesGuests = party.guests.filter((g) => g.rsvp === "yes");
  const checkins = party.checkins ?? {};

  function toggleTask(taskId: string, evt?: React.MouseEvent) {
    updateParty(party!.id, (p) => ({
      ...p,
      tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)),
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
    toast.success("Update posted to your guest invite.");
  }

  const arrived = Object.keys(checkins).length;

  return (
    <div className="min-h-screen bg-background">
      <div
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

        <section className="mt-4 rounded-3xl border border-border bg-card p-5 shadow-card">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Day of · {party.name}
          </div>
          <h1 className="mt-1 font-display text-2xl font-semibold text-secondary">
            Next three actions
          </h1>
          <ul className="mt-3 space-y-2">
            {nextThree.length === 0 ? (
              <li className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
                All set — you're floating.
              </li>
            ) : (
              nextThree.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={(e) => toggleTask(t.id, e)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border px-3 py-3 text-left transition hover:bg-muted/40"
                  >
                    <Circle className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{t.title}</div>
                      <div className="text-xs text-muted-foreground">{t.bucket}</div>
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>

        <Card className="mt-4 p-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Megaphone className="h-4 w-4 text-primary" /> Post an update to guests
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
              Post update
            </Button>
          </div>
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
            <div className="mb-2 text-sm font-semibold text-foreground">Timeline</div>
            <ul className="space-y-2 text-sm">
              {timeline.map((item) => (
                <li key={item.id} className="flex items-start gap-3">
                  <span className="mt-0.5 min-w-16 text-xs font-medium tabular-nums text-muted-foreground">
                    {item.time}
                  </span>
                  <span className="text-foreground">{item.activity}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
