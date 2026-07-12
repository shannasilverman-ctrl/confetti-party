import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { ConfettiBurst, fireConfetti } from "@/components/confetti-burst";
import { CheckCircle2, Calendar, Wallet, Sparkles, ArrowRight } from "lucide-react";

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

const benefits = [
  {
    icon: Sparkles,
    title: "Plan it all in one place",
    body: "Every guest, task, dollar, and day-of moment lives together — no more scattered notes and lost group texts.",
  },
  {
    icon: CheckCircle2,
    title: "Never miss a task",
    body: "Smart starter checklists know what to do six weeks out, the week of, and the morning of. You just check things off.",
  },
  {
    icon: Wallet,
    title: "Stay on budget",
    body: "Set a number, log expenses as you go, and see exactly what's left. Categories that go over glow gently in warning.",
  },
];

function Landing() {
  const [heroBurst, setHeroBurst] = useState(0);
  useEffect(() => {
    // fire the intro burst after the letters have popped in
    const t = setTimeout(() => setHeroBurst(1), 650);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <BrandLockup animated />
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/app">Sign in</Link>
          </Button>
          <Button asChild size="sm" variant="festive">
            <Link to="/app">Open app</Link>
          </Button>
        </nav>
      </header>

      {/* Hero */}
      <section className="bg-confetti">
        <div className="mx-auto max-w-6xl px-6 pb-24 pt-14 sm:pt-20">
          <div className="relative mx-auto max-w-3xl text-center">
            {/* one-shot confetti burst behind the hero on first load */}
            <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2">
              <ConfettiBurst active={heroBurst > 0} count={28} spread={220} />
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-secondary/15 bg-card/70 px-4 py-1.5 text-xs font-medium text-secondary shadow-card backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              For everyday hosts
            </span>
            <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.05] tracking-tight text-secondary sm:text-7xl">
              Party planning made easy,
              <br />
              <span className="text-gradient-festive">from first idea to final toast.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
              Confetti keeps your checklist, guest list, budget, and day-of timeline in one warm
              little app. So hosting feels like a party, not a project.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" variant="festive">
                <Link to="/party/$id" params={{ id: "maya-8th" }}>
                  See a sample party <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/app" search={{ new: true }}>Start planning yours</Link>
              </Button>
            </div>
          </div>

          {/* Preview card */}
          <div className="relative mx-auto mt-16 max-w-4xl">
            <div className="absolute -inset-6 rounded-[2rem] bg-festive opacity-20 blur-2xl" />
            <div className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-elevated">
              <div className="flex items-center gap-1.5 border-b border-border bg-muted/60 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-primary/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-accent/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-secondary/40" />
                <span className="ml-3 text-xs text-muted-foreground">
                  confetti.app / maya's 8th birthday
                </span>
              </div>
              <div className="grid gap-4 p-6 sm:grid-cols-3">
                {[
                  { k: "Countdown", v: "34 days", tag: "Aug 15" },
                  { k: "RSVPs", v: "12 yes", tag: "3 maybe · 3 pending" },
                  { k: "Budget", v: "$342 / $600", tag: "57% used" },
                ].map((m) => (
                  <div key={m.k} className="rounded-2xl bg-muted/50 p-4">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      {m.k}
                    </div>
                    <div className="mt-1 font-display text-2xl font-semibold text-secondary">
                      {m.v}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{m.tag}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-6 md:grid-cols-3">
          {benefits.map((b) => (
            <div
              key={b.title}
              className="group rounded-2xl border border-border bg-card p-7 shadow-card transition hover:-translate-y-1 hover:shadow-elevated"
            >
              <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-sunrise text-primary-foreground">
                <b.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-xl font-semibold text-secondary">{b.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{b.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="relative overflow-hidden rounded-3xl bg-festive px-8 py-16 text-center text-primary-foreground shadow-elevated">
          <Calendar className="mx-auto mb-4 h-8 w-8 opacity-80" />
          <h2 className="font-display text-3xl font-semibold sm:text-4xl">
            Peek inside a real party plan
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm opacity-90 sm:text-base">
            We've seeded Maya's 8th birthday, unicorn rainbow theme, so you can click around
            without signing up.
          </p>
          <Button asChild size="lg" variant="onFestive" className="mt-7">
            <Link to="/party/$id" params={{ id: "maya-8th" }}>
              See the sample party <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <BrandLockup />
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Confetti. Made for people who host.
          </p>
        </div>
      </footer>
    </div>
  );
}
