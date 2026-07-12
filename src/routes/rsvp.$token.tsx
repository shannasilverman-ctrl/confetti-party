import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Sparkles, Users, PartyPopper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { themeById } from "@/lib/themes";
import { daysUntil } from "@/lib/party-context";
import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { fireConfetti } from "@/components/confetti-burst";

type PartyView = {
  name: string;
  date: string;
  occasion: string;
  theme_id: string | null;
  theme: string | null;
  guest_first_names: string[];
  yes_count: number;
  maybe_count: number;
  total_count: number;
};

type RSVPChoice = "yes" | "maybe" | "no";

export const Route = createFileRoute("/rsvp/$token")({
  component: PublicRsvpPage,
  head: () => ({
    meta: [
      { title: "You're invited · Confetti" },
      { name: "description", content: "RSVP to a Confetti party." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function PublicRsvpPage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<"loading" | "ready" | "invalid">("loading");
  const [party, setParty] = useState<PartyView | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .rpc("get_rsvp_party", { token })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setState("invalid");
          return;
        }
        setParty(data as unknown as PartyView);
        setState("ready");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading invite…</div>
      </div>
    );
  }

  if (state === "invalid" || !party) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
        <BrandLockup />
        <h1 className="mt-8 font-display text-2xl font-semibold text-secondary">
          This invite link doesn't look right
        </h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Double-check the link with your host, or ask them to resend it.
        </p>
      </div>
    );
  }

  return <RsvpForm token={token} party={party} />;
}

function RsvpForm({ token, party }: { token: string; party: PartyView }) {
  const theme = themeById(party.theme_id ?? undefined);
  const days = daysUntil(party.date);
  const [name, setName] = useState("");
  const [rsvp, setRsvp] = useState<RSVPChoice>("yes");
  const [adults, setAdults] = useState(1);
  const [kids, setKids] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const heroStyle = useMemo<React.CSSProperties>(
    () =>
      theme
        ? {
            backgroundImage: `linear-gradient(to bottom, hsl(${theme.palette[0]} / 0.4), hsl(${theme.palette[1]} / 0.55)), url(${theme.heroImage})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }
        : { backgroundImage: "var(--gradient-festive, linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent))))" },
    [theme],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please add your name.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const { error } = await supabase.rpc("submit_rsvp", {
      token,
      guest_name: name.trim(),
      rsvp,
      adults: rsvp === "yes" ? adults : 0,
      kids: rsvp === "yes" ? kids : 0,
    });
    setSubmitting(false);
    if (error) {
      setError("Something went wrong. Please try again.");
      return;
    }
    setDone(true);
    fireConfetti({ count: 32, spread: 180 });
  };

  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden" style={heroStyle}>
        <div className="mx-auto max-w-lg px-6 pt-10 pb-12 text-center">
          <BrandLockup className="mx-auto justify-center [&_*]:!text-white" />
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/25 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-white backdrop-blur">
            <Sparkles className="h-3 w-3" /> You're invited
          </div>
          <h1 className="mt-3 font-display text-3xl font-semibold text-white sm:text-4xl">
            {party.name}
          </h1>
          <div className="mt-2 flex items-center justify-center gap-2 text-sm text-white/90">
            <CalendarDays className="h-4 w-4" />
            {new Date(party.date).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </div>
          <div className="mt-4 font-display text-5xl font-semibold text-white tabular-nums">
            {days >= 0 ? days : "—"}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-white/80">
            {days === 1 ? "day to go" : days >= 0 ? "days to go" : "already happened"}
          </div>
        </div>
      </section>

      <main className="mx-auto -mt-6 max-w-lg px-4 pb-16 sm:px-6">
        {done ? (
          <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-card">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
              <PartyPopper className="h-7 w-7" />
            </div>
            <h2 className="mt-4 font-display text-2xl font-semibold text-secondary">
              You're on the list!
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Thanks {name.trim()} — the host has been updated.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Badge variant="success">{party.yes_count + (rsvp === "yes" ? 1 : 0)} yes so far</Badge>
              {theme && <Badge variant="accent">{theme.name}</Badge>}
            </div>
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="space-y-5 rounded-3xl border border-border bg-card p-6 shadow-card"
          >
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {party.yes_count} yes · {party.maybe_count} maybe
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="First and last"
                maxLength={80}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Can you make it?</Label>
              <RadioGroup
                value={rsvp}
                onValueChange={(v) => setRsvp(v as RSVPChoice)}
                className="grid grid-cols-3 gap-2"
              >
                {(["yes", "maybe", "no"] as RSVPChoice[]).map((val) => (
                  <label
                    key={val}
                    className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm capitalize transition ${
                      rsvp === val
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background hover:bg-muted/60"
                    }`}
                  >
                    <RadioGroupItem value={val} className="sr-only" />
                    {val}
                  </label>
                ))}
              </RadioGroup>
            </div>

            {rsvp === "yes" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="adults">Adults</Label>
                  <Input
                    id="adults"
                    type="number"
                    min={0}
                    max={20}
                    value={adults}
                    onChange={(e) => setAdults(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kids">Kids</Label>
                  <Input
                    id="kids"
                    type="number"
                    min={0}
                    max={20}
                    value={kids}
                    onChange={(e) => setKids(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
                  />
                </div>
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button type="submit" variant="festive" className="w-full" disabled={submitting}>
              {submitting ? "Sending…" : "Send RSVP"}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              Sending again with the same name updates your response.
            </p>
          </form>
        )}
      </main>
    </div>
  );
}
