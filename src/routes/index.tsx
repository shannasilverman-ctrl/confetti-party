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
import { daysUntilUtc, formatDateOnly, nextWeekdayDateOnlyUtc } from "@/lib/date-only";
import { VOCAB } from "@/lib/vocab";
import { EventHeroCarousel } from "@/components/event-hero-carousel";
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
  Camera,
  Download,
  LockKeyhole,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
  loader: () => {
    const sampleCardDate = nextWeekdayDateOnlyUtc(6, 21);
    const sampleDays = daysUntilUtc(sampleCardDate);
    return {
      sampleCardDateLabel: formatDateOnly(
        sampleCardDate,
        {
          weekday: "short",
          month: "short",
          day: "numeric",
        },
        "en-US",
      ),
      sampleCountdown:
        sampleDays > 0 ? `${sampleDays} days out` : sampleDays === 0 ? "Today" : "Soon",
    };
  },
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
      { property: "og:url", content: "https://www.confettiapp.ai/" },
    ],
    links: [{ rel: "canonical", href: "https://www.confettiapp.ai/" }],
  }),
});

function Landing() {
  const navigate = useNavigate();
  // A rolling illustrative Saturday keeps the mock date and countdown
  // truthful instead of quietly going stale after a launch milestone. The
  // loader snapshots it once so SSR and hydration cannot cross a day boundary.
  const { sampleCardDateLabel, sampleCountdown } = Route.useLoaderData();
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
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      void navigate({ to: "/app", search: { new: true } });
      return;
    }
    // Let the burst breathe for a beat before navigating.
    setTimeout(() => navigate({ to: "/app", search: { new: true } }), 220);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SeasonalBanner />
      <div className="relative">
        {/* Nav sits inside the party scene so the opening moment feels like Confetti. */}
        <header className="absolute inset-x-3 top-3 z-20 mx-auto flex max-w-6xl items-center justify-between rounded-full border border-white/25 bg-black/20 px-3 py-2 shadow-elevated backdrop-blur-xl sm:inset-x-6 sm:top-5 sm:px-5">
          <div className="[&_*]:!text-white">
            <BrandLockup />
          </div>
          <nav className="flex items-center gap-2 sm:gap-4">
            <Link
              to="/sample-invite"
              className="hidden min-h-11 items-center text-sm font-semibold text-white/85 hover:text-white md:inline-flex"
            >
              See a sample invite
            </Link>
            <div className="hidden [&_a]:!min-h-11 [&_a]:items-center [&_*]:!text-white sm:block">
              <AuthNav variant="landing" />
            </div>
            <Button variant="festive" size="sm" className="min-h-11" onClick={startPlanning}>
              Start planning
            </Button>
          </nav>
        </header>

        <main>
          <EventHeroCarousel onStartPlanning={startPlanning} />

          {/* Chaos → Calm */}
          <section className="px-4 py-12 sm:px-6 sm:py-20">
            <div className="mx-auto max-w-6xl rounded-[2.5rem] border border-white/80 bg-white/55 px-5 py-10 shadow-card backdrop-blur sm:px-10 sm:py-14">
              <div className="mx-auto mb-10 max-w-2xl text-center">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                  The relief is the product
                </span>
                <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.035em] text-secondary sm:text-4xl">
                  From fourteen “maybes” to one clear plan.
                </h2>
                <p className="mt-3 text-muted-foreground">
                  Confetti notices what is missing, keeps everyone moving, and only shows you what
                  matters next.
                </p>
              </div>
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
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {sampleCardDateLabel} · 2:00 PM
                        </div>
                      </div>
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                        {sampleCountdown}
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
                        <span className="font-semibold text-secondary tabular-nums">
                          $342 / $600
                        </span>
                      </div>
                      <Progress value={57} aria-label="Budget used" />
                    </div>

                    <div className="mt-4 space-y-2">
                      <ChecklistRow done>Book the venue</ChecklistRow>
                      <ChecklistRow>Send invites</ChecklistRow>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* The real product, shown as one authored journey rather than a feature checklist. */}
          <section className="relative overflow-hidden bg-brand-wash py-20 sm:py-28">
            <FloatingConfettiField />
            <div className="mx-auto max-w-6xl px-6">
              <div className="relative mx-auto max-w-3xl text-center">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                  One gathering · one living plan
                </span>
                <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.035em] text-secondary sm:text-5xl">
                  Everything a great host is quietly keeping in their head.
                </h2>
                <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
                  Start with a voice note. End with guests fed, details handled, and a photo that
                  feels made for the night.
                </p>
              </div>

              <div className="relative mt-14 grid gap-6 lg:grid-cols-2">
                <StoryRow
                  chapter="01 · Start however it comes out"
                  title="Talk it out."
                  body="Brain-dump the gathering — the vibe, the humans, the constraints. Confetti listens, asks the right questions, and turns the noise into a plan you can edit."
                  cta={{ label: "Try Talk it out", to: "/talk" }}
                  tone="cream"
                  art={<TalkMini />}
                />
                <StoryRow
                  chapter="02 · See the whole gathering"
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
                  chapter="03 · Know what matters now"
                  title="Your next three things."
                  body="Not a wall of tasks. Just the three moves that matter this week, in the right order, with the right timing bucket."
                  cta={{
                    label: "Peek at Maya's list",
                    to: "/party/$id",
                    params: { id: "maya-8th" },
                  }}
                  tone="cream"
                  art={<ChecklistMini />}
                />
                <StoryRow
                  chapter="04 · Let guests help"
                  title={`${VOCAB.guestInvite}, with a ${VOCAB.bringBoard}.`}
                  body="One link for every guest. They RSVP, claim what to bring, and see host updates. You watch it fill in — no more group-chat archaeology."
                  cta={{ label: "Open a sample invite", to: "/sample-invite" }}
                  tone="coral"
                  flip
                  art={<GuestWorldMini />}
                />
                <StoryRow
                  chapter="05 · Stay present"
                  title="Day-of Mode."
                  body="The morning-of, minute by minute. Next-three-actions, arrivals check-in, and a guest-page update for 'pizza's on the way' — designed for one thumb."
                  cta={{
                    label: "Open Day-of Mode",
                    to: "/party/$id/day-of",
                    params: { id: "maya-8th" },
                  }}
                  tone="cream"
                  art={<TimelineMini />}
                />
                <StoryRow
                  chapter="06 · Make the next one easier"
                  title="Memories, so next time is easier."
                  body="A five-minute private retrospective after the toast: what worked, what ran out, what to change. Plan the next one and Confetti turns the improvements into real checklist tasks."
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

              <PartyBoothStory />
            </div>
          </section>

          {/* Closing band */}
          <section className="relative overflow-hidden bg-confetti py-20 sm:py-24">
            <FloatingConfettiField />
            <div className="relative mx-auto max-w-2xl px-6 text-center">
              <h2 className="font-display text-3xl font-semibold text-secondary sm:text-4xl">
                Your next party can start half-formed.
              </h2>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button size="lg" variant="festive" onClick={startPlanning}>
                  Plan my party <ArrowRight />
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/sample-invite">Open a sample invite</Link>
                </Button>
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <BrandLockup />
          <nav aria-label="Legal" className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link to="/privacy" className="hover:text-secondary">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-secondary">
              Terms
            </Link>
            <span>© {new Date().getFullYear()} Confetti</span>
          </nav>
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
      } ${strike ? "line-through" : ""}`}
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
    <article
      className={`grid overflow-hidden rounded-[2rem] border border-white/80 bg-white/70 shadow-card backdrop-blur ${
        flip ? "lg:[&>*:first-child]:order-2" : ""
      }`}
    >
      <div className="p-6 sm:p-8">
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
      <div className={`flex min-h-[20rem] items-center p-5 sm:p-7 ${styles.artFrame}`}>
        <div className="mx-auto w-full max-w-sm">{art}</div>
      </div>
    </article>
  );
}

function PartyBoothStory() {
  return (
    <article className="relative mt-6 overflow-hidden rounded-[2.25rem] border border-white/80 bg-secondary text-secondary-foreground shadow-lift">
      <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
        <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80">
            <Camera className="h-3.5 w-3.5" aria-hidden /> 07 · The signature moment
          </span>
          <h3 className="mt-5 max-w-md font-display text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">
            A photo booth made for this party.
          </h3>
          <p className="mt-4 max-w-md leading-relaxed text-white/75">
            Guests scan the host’s QR, take or choose a photo, add the event’s personalized frame,
            and save it straight to their phone.
          </p>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/80">
            <span className="inline-flex items-center gap-1.5">
              <LockKeyhole className="h-4 w-4" aria-hidden /> No upload
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Download className="h-4 w-4" aria-hidden /> Saves privately
            </span>
          </div>
          <Button
            asChild
            variant="outline"
            className="mt-7 w-fit border-white/30 bg-white text-secondary hover:bg-white/90"
          >
            <a href="/sample-invite#party-booth">
              Try the Party Booth <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
        </div>

        <div className="relative min-h-[28rem] overflow-hidden bg-[linear-gradient(135deg,hsl(347_56%_58%),hsl(270_49%_35%))] p-6 sm:p-10">
          <div className="absolute inset-0 opacity-30 [background-image:var(--pattern-confetti)] [background-size:220px_220px]" />
          <div className="relative mx-auto max-w-sm rotate-[1.5deg] overflow-hidden rounded-[2rem] border border-white/25 bg-card text-card-foreground shadow-lift">
            <div
              className="relative aspect-[4/3] bg-cover bg-center"
              style={{
                backgroundImage:
                  "linear-gradient(180deg,transparent 30%,hsl(265 28% 14% / 0.72)),url(/brand/confetti-hero.jpg)",
              }}
            >
              <div className="absolute inset-4 rounded-2xl border-2 border-white/90">
                <div className="absolute right-4 top-4 flex gap-2" aria-hidden>
                  <span className="h-1.5 w-7 rotate-[34deg] rounded-full bg-white" />
                  <span className="h-1.5 w-4 -rotate-[34deg] rounded-full bg-white" />
                </div>
                <div className="absolute bottom-4 left-4 font-display text-2xl font-semibold leading-none text-white">
                  Shanna’s birthday
                  <span className="mt-1 block font-body text-xs font-medium uppercase tracking-[0.15em] text-white/80">
                    Miami · 2026
                  </span>
                </div>
              </div>
            </div>
            <div className="p-5">
              <div className="font-display text-xl font-semibold text-secondary">
                Your party, framed.
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                One tap to take a photo. One tap to keep it.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-primary/10 text-sm font-semibold text-primary">
                  <Camera className="h-5 w-5" aria-hidden /> Take a photo
                </div>
                <div className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-muted text-sm font-semibold text-secondary">
                  <Download className="h-5 w-5" aria-hidden /> Choose one
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
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
        <Progress value={25} aria-label="Checklist progress" />
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
          <span>{VOCAB.guestInvite}</span>
          <span className="text-primary">RSVP · Bring · Photos</span>
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
        A private copy stays attached when you duplicate the plan.
      </p>
    </div>
  );
}
