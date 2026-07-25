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
import heroImage from "@/assets/confetti-hero.jpg.asset.json";
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
      { title: "Confetti — Plan unforgettable gatherings" },
      {
        name: "description",
        content:
          "From the first idea to the final toast. Confetti is the calm co-host that gets guests, checklists, budget, day-of, and memories done — for any gathering.",
      },
      { property: "og:title", content: "Confetti — Plan unforgettable gatherings" },
      {
        property: "og:description",
        content: "The calm co-host for any gathering. From first idea to final toast.",
      },
      { property: "og:url", content: "https://confetti-party.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://confetti-party.lovable.app/" }],
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
      <SeasonalBanner />
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <BrandLockup />
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

      {/* Cinematic hero */}
      <section className="relative isolate overflow-hidden">
        {/* Image plate */}
        <div className="absolute inset-0 -z-10">
          <img
            src={heroImage.url}
            alt=""
            aria-hidden
            fetchPriority="high"
            className="h-full w-full object-cover"
          />
          {/* Plum veil for AA contrast on display type */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, hsl(268 55% 12% / 0.55) 0%, hsl(268 55% 12% / 0.35) 55%, hsl(36 44% 97% / 0.98) 100%)",
            }}
            aria-hidden
          />
        </div>

        <div className="relative mx-auto max-w-4xl px-6 pb-24 pt-16 text-center sm:pb-32 sm:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/90 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" /> Your calm co-host
          </span>
          <h1 className="mt-6 font-display text-[2.75rem] font-semibold leading-[1.02] tracking-tight text-white drop-shadow-[0_2px_20px_hsl(268_55%_10%/0.5)] sm:text-6xl md:text-7xl">
            Throw the party
            <br />
            everyone remembers.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base text-white/85 sm:text-lg">
            From the first idea to the final toast — guests, checklist, budget, day-of, and the
            memories after. Confetti gets you there, calmly.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" variant="festive" onClick={startPlanning}>
              Start planning <ArrowRight />
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/talk">Talk it out</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              <Link to="/party/$id" params={{ id: "maya-8th" }}>
                See a sample party
              </Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-white/70">Free. No sign-up needed to look around.</p>
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

      {/* Product story — six chapters, in the order a host actually lives them */}
      <section className="bg-muted/30 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-semibold text-secondary sm:text-4xl">
              One gathering, first idea to next-year notes.
            </h2>
            <p className="mt-3 text-muted-foreground">
              Every screen below is a real Confetti surface, in the order you'll meet them.
            </p>
          </div>

          <div className="mt-16 space-y-20">
            <StoryRow
              chapter="Chapter 01"
              title="Talk it out."
              body="Brain-dump the gathering — the vibe, the humans, the constraints. Confetti listens, asks the right questions, and turns the noise into a plan you can edit."
              cta={{ label: "Try Talk it out", to: "/talk" }}
              tone="cream"
              art={<TalkMini />}
            />
            <StoryRow
              chapter="Chapter 02"
              title="The Reveal."
              body="A single calm page: what you're hosting, when, for whom, with the risks flagged. No dashboards to decode, no ten tabs of setup."
              cta={{
                label: "See a sample reveal",
                to: "/party/$id/reveal",
                params: { id: "ava-liam-wedding" },
              }}
              tone="mint"
              flip
              art={<RevealMini />}
            />
            <StoryRow
              chapter="Chapter 03"
              title="Your next three things."
              body="Not a wall of tasks. Just the three moves that matter this week, in the right order, with the right timing bucket."
              cta={{ label: "Peek at Maya's list", to: "/party/$id", params: { id: "maya-8th" } }}
              tone="cream"
              art={<ChecklistMini />}
            />
            <StoryRow
              chapter="Chapter 04"
              title="Guest World, with a Bring Board."
              body="One link for every guest. They RSVP, claim what to bring, and see host updates. You watch it fill in — no more group-chat archaeology."
              cta={{ label: "Open a sample invite", to: "/party/$id", params: { id: "maya-8th" } }}
              tone="coral"
              flip
              art={<GuestWorldMini />}
            />
            <StoryRow
              chapter="Chapter 05"
              title="Day-of Mode."
              body="The morning-of, minute by minute. Next-three-actions, arrivals check-in, and a broadcast box for 'pizza's on the way' — designed for one thumb."
              cta={{
                label: "Open Day-of Mode",
                to: "/party/$id/day-of",
                params: { id: "maya-8th" },
              }}
              tone="cream"
              art={<TimelineMini />}
            />
            <StoryRow
              chapter="Chapter 06"
              title="Memories, so next time is easier."
              body="A five-minute retrospective after the toast: what worked, what ran out, what to change. It carries into the next gathering as suggestions — not a blank page."
              cta={{
                label: "Read Ava & Liam's retro",
                to: "/party/$id/reveal",
                params: { id: "ava-liam-wedding" },
              }}
              tone="gold"
              flip
              art={<MemoriesMini />}
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

function SeasonalBanner() {
  const moment = getActiveSeasonalMoment();
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!moment) return;
    try {
      if (sessionStorage.getItem(`seasonal-dismissed:${moment.id}`) === "1") {
        setDismissed(true);
      }
    } catch {
      /* no-op */
    }
  }, [moment]);
  if (!moment || dismissed) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(`seasonal-dismissed:${moment.id}`, "1");
    } catch {
      /* no-op */
    }
  };
  return (
    <div className="border-b border-border bg-primary/5">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-2.5">
        <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
          {moment.label}
        </span>
        <span className="text-sm text-secondary">{moment.headline}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button asChild size="sm" variant="festive">
            <a href={moment.ctaHref}>{moment.cta}</a>
          </Button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={dismiss}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
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
      <span className={done ? "text-muted-foreground line-through" : "text-secondary"}>
        {children}
      </span>
    </div>
  );
}

/* ------------- story row + minis ------------- */

type StoryCta = { label: string; to: string; params?: Record<string, string> };
type StoryTone = "cream" | "mint" | "coral" | "gold";

const TONE_STYLES: Record<StoryTone, { chip: string; artFrame: string }> = {
  cream: {
    chip: "bg-primary/10 text-primary",
    artFrame: "bg-gradient-to-br from-muted/40 to-background",
  },
  mint: {
    chip: "bg-success/15 text-success",
    artFrame: "bg-gradient-to-br from-[hsl(150_45%_92%)] to-background",
  },
  coral: {
    chip: "bg-primary/15 text-primary",
    artFrame: "bg-gradient-to-br from-[hsl(10_82%_94%)] to-background",
  },
  gold: {
    chip: "bg-accent/25 text-secondary",
    artFrame: "bg-gradient-to-br from-[hsl(38_92%_92%)] to-background",
  },
};

function StoryRow({
  chapter,
  title,
  body,
  cta,
  art,
  tone = "cream",
  flip = false,
}: {
  chapter: string;
  title: string;
  body: string;
  cta?: StoryCta;
  art: React.ReactNode;
  tone?: StoryTone;
  flip?: boolean;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <div
      className={`grid items-center gap-10 md:grid-cols-2 ${
        flip ? "md:[&>*:first-child]:order-2" : ""
      }`}
    >
      <div>
        <div
          className={`mb-3 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${styles.chip}`}
        >
          {chapter}
        </div>
        <h3 className="font-display text-2xl font-semibold text-secondary sm:text-3xl">{title}</h3>
        <p className="mt-3 max-w-md text-muted-foreground">{body}</p>
        {cta && (
          <div className="mt-5">
            <Button asChild variant="outline" size="sm" className="min-h-11">
              {cta.params ? (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                <Link to={cta.to as any} params={cta.params as any}>
                  {cta.label} <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                <Link to={cta.to as any}>
                  {cta.label} <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </Button>
          </div>
        )}
      </div>
      <div className={`mx-auto w-full max-w-sm rounded-3xl p-4 sm:p-6 ${styles.artFrame}`}>
        {art}
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
          <div
            key={i}
            className="flex items-center gap-2.5 rounded-xl bg-muted/50 px-3 py-2 text-sm"
          >
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
              r.now ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/40"
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

/* ---------- New chapter minis for the six-chapter product story ---------- */

function TalkMini() {
  const turns: { who: "user" | "confetti"; text: string }[] = [
    { who: "user", text: "hosting friendsgiving, 12 people, maybe some vegetarians" },
    {
      who: "confetti",
      text: "Got it — I'll flag two vegetarian mains. Any allergies to plan around?",
    },
    { who: "user", text: "one nut allergy. no time for a full sit-down." },
    {
      who: "confetti",
      text: "Buffet-style then. I'll build the checklist backwards from Thursday 4pm.",
    },
  ];
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>Talk it out</span>
        <span className="flex items-center gap-1 text-primary">
          <Sparkles className="h-3 w-3" /> live
        </span>
      </div>
      <div className="space-y-2.5">
        {turns.map((t, i) => (
          <div
            key={i}
            className={
              t.who === "confetti"
                ? "max-w-[88%] rounded-2xl bg-muted px-3 py-2 text-sm text-secondary"
                : "ml-auto max-w-[88%] rounded-2xl bg-primary/10 px-3 py-2 text-sm text-secondary"
            }
          >
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t.who === "confetti" ? "Confetti" : "You"}
            </div>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function RevealMini() {
  return (
    <div className="rotate-[1deg] rounded-3xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Sparkles className="h-3 w-3 text-primary" /> Your reveal
      </div>
      <div className="mt-1 font-display text-lg font-semibold text-secondary">
        Friendsgiving 2026
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-full bg-secondary/10 px-2 py-0.5 font-medium text-secondary">
          Dinner party
        </span>
        <span className="rounded-full bg-accent/25 px-2 py-0.5 font-medium text-secondary">
          Warm rustic
        </span>
      </div>
      <div className="mt-4 space-y-2 text-sm">
        <div className="flex items-center gap-2 text-secondary">
          <Calendar className="h-3.5 w-3.5" /> Thursday, Nov 26 · 4:00 PM
        </div>
        <div className="flex items-center gap-2 text-secondary">
          <MapPin className="h-3.5 w-3.5" /> Our place
        </div>
        <div className="flex items-center gap-2 text-secondary">
          <Users className="h-3.5 w-3.5" /> 9 yes · 3 maybe · 12 target
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-warning/40 bg-warning/10 p-3">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-warning-foreground">
          <AlertTriangle className="h-3 w-3" /> Risk flagged
        </div>
        <p className="text-xs text-secondary">
          3 bring-board items still unclaimed with under a week to go.
        </p>
      </div>
    </div>
  );
}

function GuestWorldMini() {
  const rsvp = [
    { name: "Ava", state: "yes" as const },
    { name: "Marco", state: "yes" as const },
    { name: "Priya", state: "yes" as const },
    { name: "Jordan", state: "maybe" as const },
  ];
  const bring = [
    { item: "Roasted brussels", by: "Ava", claimed: true },
    { item: "Pie (any kind)", by: "Marco", claimed: true },
    { item: "Extra folding chair", by: null, claimed: false },
  ];
  return (
    <div className="rotate-[-1deg] space-y-3 rounded-3xl border border-border bg-card p-5 shadow-card">
      <div>
        <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Guest World</span>
          <span className="text-primary">confetti.app/rsvp/…</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {rsvp.map((r) => (
            <span
              key={r.name}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                r.state === "yes"
                  ? "bg-success/15 text-success"
                  : "bg-warning/15 text-warning-foreground"
              }`}
            >
              {r.name} · {r.state}
            </span>
          ))}
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            +4 no reply
          </span>
        </div>
      </div>
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Bring Board
        </div>
        <ul className="space-y-1.5">
          {bring.map((b, i) => (
            <li
              key={i}
              className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2 text-sm"
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                  b.claimed
                    ? "border-success bg-success/15 text-success"
                    : "border-border bg-background text-muted-foreground"
                }`}
                aria-hidden
              >
                {b.claimed ? <Check className="h-3 w-3" /> : "·"}
              </span>
              <span className={b.claimed ? "text-secondary" : "font-medium text-secondary"}>
                {b.item}
              </span>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {b.by ? b.by : "unclaimed"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MemoriesMini() {
  const bullets = [
    { label: "What worked", body: "The buffet flow — nobody got stuck in a line." },
    { label: "Ran out of", body: "Sparkling water. Double it next time." },
    { label: "Change next time", body: "Start dessert 20 minutes earlier — kids faded." },
  ];
  return (
    <div className="rotate-[1deg] rounded-3xl border border-border bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Sparkles className="h-3 w-3 text-accent" /> Retrospective
      </div>
      <div className="font-display text-lg font-semibold text-secondary">Friendsgiving 2025</div>
      <ul className="mt-3 space-y-2">
        {bullets.map((b, i) => (
          <li key={i} className="rounded-xl bg-muted/40 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {b.label}
            </div>
            <div className="mt-0.5 text-sm text-secondary">{b.body}</div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Rolls forward as suggestions when you plan the next one.
      </p>
    </div>
  );
}
