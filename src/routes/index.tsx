import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BrandLockup } from "@/components/brand";
import { AuthNav } from "@/components/auth-nav";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { affiliateDisclosureEnabled, AFFILIATE_DISCLOSURE } from "@/lib/affiliates";
import { getActiveSeasonalMoment } from "@/lib/seasonal";
import { X } from "lucide-react";
import { celebrate, fireCannon } from "@/components/confetti-burst";
import {
  ArrowRight,
  ArrowRight as ArrowRightIcon,
  Check,
  Calendar,
  Clock,
  MapPin,
  Users,
  Wallet,
  AlertTriangle,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "Confetti | Party Planning Made Easy" },
      {
        name: "description",
        content:
          "Plan any party from first idea to final toast. Checklists, guests, budget, and day-of timeline in one warm little app.",
      },
      { property: "og:title", content: "Confetti | Party Planning Made Easy" },
      {
        property: "og:description",
        content: "From first idea to final toast — everything you need to host well.",
      },
      { property: "og:url", content: "/" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
});

function Landing() {
  const navigate = useNavigate();
  useEffect(() => {
    // Gentle cannon behind the headline once the wordmark letters have popped in.
    const t = setTimeout(() => {
      if (typeof window === "undefined") return;
      fireCannon({
        origin: { x: window.innerWidth / 2, y: Math.min(320, window.innerHeight * 0.32) },
        count: 55,
      });
    }, 750);
    return () => clearTimeout(t);
  }, []);

  const startPlanning = (e: React.MouseEvent) => {
    celebrate("cannon", { x: e.clientX, y: e.clientY });
    // Let the burst breathe for a beat before navigating.
    setTimeout(() => navigate({ to: "/app", search: { new: true } }), 220);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <BrandLockup animated />
        <nav className="flex items-center gap-3 sm:gap-5">
          <Link
            to="/party/$id"
            params={{ id: "maya-8th" }}
            className="hidden text-sm font-medium text-secondary/80 hover:text-secondary sm:inline"
          >
            See a sample party
          </Link>
          <div className="hidden sm:block">
            <AuthNav variant="landing" />
          </div>
          <Button variant="festive" onClick={startPlanning}>
            Start planning
          </Button>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-confetti">
        <FloatingConfettiField />
        <div className="relative mx-auto max-w-4xl px-6 pb-20 pt-10 text-center sm:pt-16">
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight text-secondary sm:text-6xl md:text-7xl">
            The group chat can't
            <br />
            plan the party.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
            <span className="font-semibold text-secondary">Confetti can.</span> Guests, checklist,
            budget, and the day-of timeline in one calm place, so you get to enjoy the party
            you're throwing.
          </p>
          <p className="mx-auto mt-4 max-w-md text-sm italic text-muted-foreground/80">
            Party planning made easy, from first idea to final toast.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" variant="festive" onClick={startPlanning}>
              Start planning <ArrowRight />
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/party/$id" params={{ id: "maya-8th" }}>
                Crash a sample party
              </Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Free. No sign-up needed to look around.
          </p>
        </div>
      </section>

      {/* Chaos → Calm */}
      <section className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
        <div className="grid items-center gap-10 md:grid-cols-[1fr_auto_1fr]">
          {/* Chaos: message bubbles */}
          <div className="relative mx-auto w-full max-w-sm">
            <div className="mb-3 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              The group chat
            </div>
            <div className="flex flex-col gap-3">
              <Bubble rot={-2}>wait who's bringing the cake??</Bubble>
              <Bubble rot={1.5} align="right">
                did anyone invite the Nguyens?
              </Bubble>
              <Bubble rot={-1}>is it BYOB or…?</Bubble>
              <Bubble rot={2} align="right" strike>
                scroll up someone said 3pm
              </Bubble>
            </div>
          </div>

          {/* Arrow */}
          <div className="hidden items-center justify-center md:flex">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-festive text-primary-foreground shadow-elevated">
              <ArrowRightIcon className="h-6 w-6" />
            </div>
          </div>
          <div className="flex items-center justify-center md:hidden">
            <div className="rotate-90 flex h-12 w-12 items-center justify-center rounded-full bg-festive text-primary-foreground shadow-card">
              <ArrowRightIcon className="h-5 w-5" />
            </div>
          </div>

          {/* Calm: app card */}
          <div className="relative mx-auto w-full max-w-sm">
            <div className="mb-3 text-center text-[11px] font-medium uppercase tracking-wider text-primary">
              With Confetti
            </div>
            <div className="rotate-[1.5deg] rounded-3xl border border-border bg-card p-5 shadow-elevated">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-display text-lg font-semibold text-secondary">
                    Maya's 8th Birthday
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">Sat, Aug 15 · 2:00 PM</div>
                </div>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                  34 days out
                </span>
              </div>

              <div className="mt-4 flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-secondary/70" />
                <span className="font-medium text-secondary">12 yes</span>
                <span className="text-muted-foreground">· 3 maybe</span>
              </div>

              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Wallet className="h-3.5 w-3.5" /> Budget
                  </span>
                  <span className="font-semibold text-secondary tabular-nums">$342 / $600</span>
                </div>
                <Progress value={57} />
              </div>

              <div className="mt-4 space-y-2">
                <ChecklistRow done>Book the venue</ChecklistRow>
                <ChecklistRow>Send invites</ChecklistRow>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Story section */}
      <section className="bg-muted/30 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-semibold text-secondary sm:text-4xl">
              One party, first idea to final toast.
            </h2>
            <p className="mt-3 text-muted-foreground">
              Follow Maya's 8th birthday through Confetti, step by step.
            </p>
          </div>

          <div className="mt-16 space-y-20">
            <StoryRow
              index={0}
              title="Name it, date it, share it."
              body="Give your party a name and a date. Confetti spins up a shareable RSVP link and starts tracking who's in."
              art={<InviteMini />}
            />
            <StoryRow
              index={1}
              title="A checklist that knows what's next."
              body="Confetti seeds the tasks that matter and surfaces the right ones at the right time — no more staring at a blank list."
              art={<ChecklistMini />}
            />
            <StoryRow
              index={2}
              title="Champagne taste, tracked."
              body="Log expenses as you go. Category bars glow gently when they creep toward the edge — heads up, not a lecture."
              art={<BudgetMini />}
            />
            <StoryRow
              index={3}
              title="The morning-of, minute by minute."
              body="A calm timeline for the day itself, so you can be present instead of glued to a spreadsheet."
              art={<TimelineMini />}
            />
          </div>
        </div>
      </section>

      {/* Closing band */}
      <section className="relative overflow-hidden bg-confetti py-20 sm:py-24">
        <FloatingConfettiField />
        <div className="relative mx-auto max-w-2xl px-6 text-center">
          <h2 className="font-display text-3xl font-semibold text-secondary sm:text-4xl">
            Your next party starts with a name and a date.
          </h2>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" variant="festive" onClick={startPlanning}>
              Start planning <ArrowRight />
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/party/$id" params={{ id: "maya-8th" }}>
                Crash a sample party
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <BrandLockup />
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Confetti. Be the host people talk about.
          </p>
        </div>
        {affiliateDisclosureEnabled() && (
          <div className="border-t border-border">
            <p className="mx-auto max-w-6xl px-6 py-3 text-center text-[11px] text-muted-foreground">
              {AFFILIATE_DISCLOSURE}
            </p>
          </div>
        )}
      </footer>
    </div>
  );
}

/* -------------------------- little presentational bits -------------------------- */

function FloatingConfettiField() {
  // A few drifting confetti pieces around the hero / closing band.
  const pieces = [
    { top: "12%", left: "8%", color: "hsl(10 82% 62%)", rot: -12, size: 10, shape: "rect" },
    { top: "18%", left: "88%", color: "hsl(38 92% 58%)", rot: 22, size: 8, shape: "dot" },
    { top: "62%", left: "6%", color: "hsl(340 75% 62%)", rot: 8, size: 9, shape: "rect" },
    { top: "72%", left: "92%", color: "hsl(268 55% 42%)", rot: -18, size: 10, shape: "rect" },
    { top: "38%", left: "16%", color: "hsl(210 82% 60%)", rot: 4, size: 7, shape: "dot" },
    { top: "48%", left: "82%", color: "hsl(10 82% 62%)", rot: -6, size: 8, shape: "dot" },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute animate-piece-fly opacity-70"
          style={{
            top: p.top,
            left: p.left,
            width: p.shape === "rect" ? p.size : p.size,
            height: p.shape === "rect" ? p.size * 1.4 : p.size,
            background: p.color,
            borderRadius: p.shape === "dot" ? "9999px" : "2px",
            transform: `rotate(${p.rot}deg)`,
            animation: `piece-fly 5s ease-in-out ${i * 0.4}s infinite alternate`,
          }}
        />
      ))}
    </div>
  );
}

function Bubble({
  children,
  rot = 0,
  align = "left",
  strike = false,
}: {
  children: React.ReactNode;
  rot?: number;
  align?: "left" | "right";
  strike?: boolean;
}) {
  return (
    <div
      className={`max-w-[85%] rounded-2xl bg-muted px-4 py-2.5 text-sm text-muted-foreground shadow-sm ${
        align === "right" ? "self-end rounded-br-sm" : "self-start rounded-bl-sm"
      } ${strike ? "line-through opacity-60" : ""}`}
      style={{ transform: `rotate(${rot}deg)` }}
    >
      {children}
    </div>
  );
}

function ChecklistRow({ done, children }: { done?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-muted/50 px-3 py-2 text-sm">
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-md border ${
          done ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
        }`}
      >
        {done && <Check className="h-3.5 w-3.5" />}
      </span>
      <span
        className={
          done ? "text-muted-foreground line-through" : "text-secondary"
        }
      >
        {children}
      </span>
    </div>
  );
}

/* ------------- story row + minis ------------- */

function StoryRow({
  index,
  title,
  body,
  art,
}: {
  index: number;
  title: string;
  body: string;
  art: React.ReactNode;
}) {
  const flip = index % 2 === 1;
  return (
    <div
      className={`grid items-center gap-10 md:grid-cols-2 ${
        flip ? "md:[&>*:first-child]:order-2" : ""
      }`}
    >
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
          Step {index + 1}
        </div>
        <h3 className="font-display text-2xl font-semibold text-secondary sm:text-3xl">{title}</h3>
        <p className="mt-3 max-w-md text-muted-foreground">{body}</p>
      </div>
      <div className="mx-auto w-full max-w-sm">{art}</div>
    </div>
  );
}

function InviteMini() {
  return (
    <div className="rotate-[-1.5deg] overflow-hidden rounded-3xl border border-border bg-card shadow-card">
      <div className="bg-festive p-5 text-primary-foreground">
        <div className="text-[10px] uppercase tracking-wider opacity-80">You're invited</div>
        <div className="mt-1 font-display text-xl font-semibold">Maya's 8th Birthday</div>
        <div className="mt-2 flex items-center gap-2 text-xs opacity-90">
          <Calendar className="h-3.5 w-3.5" /> Sat, Aug 15
          <span className="opacity-60">·</span>
          <Clock className="h-3.5 w-3.5" /> 2:00 PM
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs opacity-90">
          <MapPin className="h-3.5 w-3.5" /> Our backyard
        </div>
      </div>
      <div className="flex items-center justify-between p-4">
        <div className="text-xs text-muted-foreground">confetti.app/rsvp/…</div>
        <button
          type="button"
          className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground"
        >
          RSVP
        </button>
      </div>
    </div>
  );
}

function ChecklistMini() {
  const rows: { tag: string; tagVariant: "muted" | "coral"; text: string; done?: boolean }[] = [
    { tag: "6 WKS", tagVariant: "muted", text: "Book the venue", done: true },
    { tag: "THIS WK", tagVariant: "coral", text: "Send digital invites" },
    { tag: "THIS WK", tagVariant: "coral", text: "Order cake from Sweet Layer" },
    { tag: "DAY OF", tagVariant: "muted", text: "Pick up balloons at 10am" },
  ];
  return (
    <div className="rotate-[1.5deg] rounded-3xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div className="font-display text-base font-semibold text-secondary">Checklist</div>
        <div className="text-xs font-semibold text-secondary tabular-nums">1 / 4</div>
      </div>
      <div className="mt-3">
        <Progress value={25} />
      </div>
      <div className="mt-4 space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2.5 rounded-xl bg-muted/50 px-3 py-2 text-sm">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                r.done
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background"
              }`}
            >
              {r.done && <Check className="h-3.5 w-3.5" />}
            </span>
            <span
              className={`min-w-[52px] rounded-full px-2 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wider ${
                r.tagVariant === "coral"
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {r.tag}
            </span>
            <span className={r.done ? "text-muted-foreground line-through" : "text-secondary"}>
              {r.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BudgetMini() {
  const cats = [
    { name: "Venue", spent: 150, cap: 200, tone: "ok" as const },
    { name: "Food & Cake", spent: 110, cap: 200, tone: "ok" as const },
    { name: "Decorations", spent: 82, cap: 100, tone: "warn" as const },
    { name: "Favors", spent: 0, cap: 100, tone: "ok" as const },
  ];
  return (
    <div className="rotate-[-1.5deg] rounded-3xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div className="font-display text-base font-semibold text-secondary">Budget</div>
        <div className="text-sm font-semibold text-secondary tabular-nums">$342 / $600</div>
      </div>
      <div className="mt-4 space-y-3">
        {cats.map((c) => {
          const pct = Math.min(100, Math.round((c.spent / c.cap) * 100));
          const warn = c.tone === "warn";
          return (
            <div key={c.name}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className={warn ? "font-medium text-warning" : "text-muted-foreground"}>
                  {c.name}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  ${c.spent} / ${c.cap}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${warn ? "bg-warning" : "bg-primary"}`}
                  style={{
                    width: `${pct}%`,
                    boxShadow: warn ? "0 0 12px hsl(var(--warning) / 0.7)" : undefined,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-xs text-warning-foreground">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
        <span className="text-muted-foreground">
          Decorations are creeping, heads up not a lecture.
        </span>
      </div>
    </div>
  );
}

function TimelineMini() {
  const rows = [
    { time: "10:00", label: "Pick up balloons", now: false, done: true },
    { time: "12:30", label: "Set up backyard", now: false, done: true },
    { time: "2:00", label: "Guests arrive", now: true, done: false },
    { time: "3:15", label: "Cake + candles", now: false, done: false },
    { time: "4:30", label: "Piñata", now: false, done: false },
  ];
  return (
    <div className="rotate-[1.5deg] rounded-3xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div className="font-display text-base font-semibold text-secondary">Day-of timeline</div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Saturday</div>
      </div>
      <div className="mt-4 space-y-1.5">
        {rows.map((r) => (
          <div
            key={r.time}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${
              r.now
                ? "bg-primary/10 ring-1 ring-primary/30"
                : "bg-muted/40"
            }`}
          >
            <span
              className={`w-14 shrink-0 tabular-nums text-xs font-semibold ${
                r.now ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {r.time}
            </span>
            <span
              className={
                r.now
                  ? "font-medium text-secondary"
                  : r.done
                    ? "text-muted-foreground line-through"
                    : "text-secondary"
              }
            >
              {r.label}
            </span>
            {r.now && (
              <span className="ml-auto flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
                <Sparkles className="h-3 w-3" /> Now
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
