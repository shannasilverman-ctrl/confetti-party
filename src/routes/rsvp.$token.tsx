import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Clock,
  MapPin,
  Sparkles,
  Users,
  PartyPopper,
  RefreshCw,
  HeartHandshake,
  HandHeart,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { themeById } from "@/lib/themes";
import { BrandLockup } from "@/components/brand";
import { LegalFooter } from "@/components/legal-footer";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { celebrate } from "@/components/confetti-burst";
import { getRsvpLoaderData, type PartyView } from "@/lib/rsvp.functions";
import { refetchRsvpParty } from "@/lib/rsvp-refetch";
import { daysUntilLocal, formatDateOnly } from "@/lib/date-only";
import { PublicBringBoard } from "@/components/public-bring-board";
import { PhotoDropCard } from "@/components/photo-drop-card";
import { PersonalizedPhotoBooth } from "@/components/personalized-photo-booth";
import { HostUpdatesFeed } from "@/components/host-updates-feed";
import { CalendarActions } from "@/components/calendar-actions";

type RSVPChoice = "yes" | "maybe" | "no";

const DIETARY_OPTIONS = [
  "Vegetarian",
  "Vegan",
  "Gluten-free",
  "Dairy-free",
  "Kosher",
  "Halal",
  "Pescatarian",
] as const;

const ALLERGEN_OPTIONS = [
  "Peanuts",
  "Tree nuts",
  "Dairy",
  "Eggs",
  "Soy",
  "Wheat",
  "Shellfish",
  "Fish",
  "Sesame",
] as const;

function formatDateLong(date: string) {
  return formatDateOnly(date, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function absoluteHeroImage(themeId: string | null | undefined, origin: string): string | null {
  const theme = themeById(themeId ?? undefined);
  if (!theme?.heroImage) return null;
  if (/^https?:\/\//i.test(theme.heroImage)) return theme.heroImage;
  if (!origin) return null;
  return `${origin}${theme.heroImage.startsWith("/") ? "" : "/"}${theme.heroImage}`;
}

export const Route = createFileRoute("/rsvp/$token")({
  loader: ({ params }) => getRsvpLoaderData({ data: { token: params.token } }),
  head: ({ loaderData }) => {
    const party = loaderData?.party ?? null;
    const origin = loaderData?.origin ?? "";
    if (!party) {
      return {
        meta: [
          { title: "You're invited · Confetti" },
          { name: "description", content: "RSVP to a Confetti party." },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const dateStr = formatDateLong(party.date);
    const title = `You're invited to ${party.name} · Confetti`;
    const description = party.location
      ? `${dateStr} at ${party.location} — tap to RSVP.`
      : `${dateStr} — tap to RSVP.`;
    const ogImage = absoluteHeroImage(party.theme_id, origin);
    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: description },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ];
    if (ogImage) {
      meta.push({ property: "og:image", content: ogImage });
      meta.push({ name: "twitter:image", content: ogImage });
    }
    return { meta };
  },
  component: PublicRsvpPage,
  errorComponent: () => <UnavailableInvite />,
  notFoundComponent: () => <InvalidInvite />,
});

function InviteShell({
  title,
  body,
  showRetry,
}: {
  title: string;
  body: string;
  showRetry: boolean;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <BrandLockup />
      <h1 className="mt-8 font-display text-2xl font-semibold text-secondary">{title}</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{body}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {showRetry && (
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => {
              if (typeof window !== "undefined") window.location.reload();
            }}
          >
            Try again
          </Button>
        )}
        <Button asChild variant="ghost" className="min-h-11">
          <Link to="/">Go home</Link>
        </Button>
      </div>
      <ConversionFooter />
    </main>
  );
}

function InvalidInvite() {
  return (
    <InviteShell
      title="This invite link doesn't look right"
      body="Double-check the link with your host, or ask them to resend it."
      showRetry={false}
    />
  );
}

function UnavailableInvite() {
  return (
    <InviteShell
      title="This invite is temporarily unavailable"
      body="We couldn't reach the invite service just now. Please try again in a moment."
      showRetry={true}
    />
  );
}

function PublicRsvpPage() {
  const { token } = Route.useParams();
  const { party, status } = Route.useLoaderData();
  if (status === "temporarily_unavailable") return <UnavailableInvite />;
  if (!party) return <InvalidInvite />;
  return <RsvpForm token={token} party={party} />;
}

/* ---------- Sub-components ---------- */

function WhosComing({ yes, maybe }: { yes: number; maybe: number }) {
  if (yes === 0 && maybe === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground">
        Be the first to RSVP
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Who's coming
      </span>
      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
        {yes} going
      </span>
      {maybe > 0 && (
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          {maybe} maybe
        </span>
      )}
    </div>
  );
}

function ConversionFooter() {
  return (
    <>
      <footer className="mx-auto mt-10 max-w-lg px-6 pb-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <BrandLockup />
          <p className="text-xs text-muted-foreground">
            Planning something of your own?{" "}
            <Link to="/" className="font-medium text-primary underline-offset-2 hover:underline">
              Start with Confetti — free.
            </Link>
          </p>
        </div>
      </footer>
      <LegalFooter className="mt-0" />
    </>
  );
}

/* ---------- Chip picker ---------- */

function ChipGroup({
  legend,
  options,
  selected,
  onToggle,
  hint,
}: {
  legend: string;
  options: readonly string[];
  selected: string[];
  onToggle: (v: string) => void;
  hint?: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-secondary">{legend}</legend>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const on = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(opt)}
              className={`min-h-11 rounded-full border px-3 py-1.5 text-sm transition ${
                on
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-secondary hover:bg-muted/60"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/* ---------- Main form ---------- */

function RsvpForm({ token, party: initialParty }: { token: string; party: PartyView }) {
  const [party, setParty] = useState<PartyView>(initialParty);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(() => Date.now());
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const theme = themeById(party.theme_id ?? undefined);
  const days = daysUntilLocal(party.date);

  // Form state — preserved across submit failures and change-response cycles.
  const [name, setName] = useState("");
  const [household, setHousehold] = useState("");
  const [rsvp, setRsvp] = useState<RSVPChoice>("yes");
  const [adults, setAdults] = useState(1);
  const [kids, setKids] = useState(0);
  const [dietary, setDietary] = useState<string[]>([]);
  const [dietaryOther, setDietaryOther] = useState("");
  const [allergens, setAllergens] = useState<string[]>([]);
  const [allergensOther, setAllergensOther] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [submittedChoice, setSubmittedChoice] = useState<RSVPChoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submitInFlight = useRef(false);

  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (v: string) =>
    setter((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  const heroStyle = useMemo<React.CSSProperties>(
    () =>
      theme
        ? {
            backgroundImage: `linear-gradient(to bottom, hsl(${theme.palette[0]} / 0.4), hsl(${theme.palette[1]} / 0.55)), url(${theme.heroImage})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }
        : {
            backgroundImage:
              "var(--gradient-festive, linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent))))",
          },
    [theme],
  );

  // Sequence guard: only the newest refresh may write into `party`. A slow
  // response from an earlier fetch must never overwrite a newer canonical
  // snapshot the user has already seen.
  const refreshSeqRef = useRef(0);
  useEffect(() => {
    // Reset the sequence when the token changes so a slow prior fetch
    // cannot land on a new invite's state.
    refreshSeqRef.current = 0;
  }, [token]);
  const refresh = useCallback(async () => {
    const seq = ++refreshSeqRef.current;
    setRefreshing(true);
    const res = await refetchRsvpParty(token);
    if (seq !== refreshSeqRef.current) return; // stale — a newer refresh started
    setRefreshing(false);
    if (!res.ok) {
      setRefreshError(res.error);
      return;
    }
    setRefreshError(null);
    if (res.party) {
      setParty(res.party);
      setLastUpdatedAt(Date.now());
    }
  }, [token]);

  // Focus/visibility refresh — no realtime dependency, quiet cadence.
  const lastAutoRef = useRef(0);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const maybeRefresh = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastAutoRef.current < 20_000) return;
      lastAutoRef.current = now;
      void refresh();
    };
    document.addEventListener("visibilitychange", maybeRefresh);
    window.addEventListener("focus", maybeRefresh);
    return () => {
      document.removeEventListener("visibilitychange", maybeRefresh);
      window.removeEventListener("focus", maybeRefresh);
    };
  }, [refresh]);

  const totalAttendees = adults + kids;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitInFlight.current) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please add your name.");
      return;
    }
    if (rsvp === "yes" && totalAttendees < 1) {
      setError("For a yes, please include at least one attendee.");
      return;
    }
    setError(null);
    submitInFlight.current = true;
    setSubmitting(true);

    const dietaryOut = [
      ...dietary,
      ...(dietaryOther.trim() ? [dietaryOther.trim().slice(0, 60)] : []),
    ];
    const allergensOut = [
      ...allergens,
      ...(allergensOther.trim() ? [allergensOther.trim().slice(0, 60)] : []),
    ];

    try {
      const res = await supabase.rpc("submit_rsvp", {
        token,
        guest_name: trimmedName,
        rsvp,
        adults: rsvp === "yes" ? adults : 0,
        kids: rsvp === "yes" ? kids : 0,
        household_label: household.trim() ? household.trim().slice(0, 80) : undefined,
        dietary: dietaryOut.length ? (dietaryOut as unknown as Json) : undefined,
        allergens: allergensOut.length ? (allergensOut as unknown as Json) : undefined,
      });
      if (res.error) {
        setError("We couldn't send your RSVP. Your answers are still here — please try again.");
        return;
      }
      setSubmittedChoice(rsvp);
      setDone(true);
      if (rsvp === "yes") celebrate("cannon");
      // Await canonical state so rapid follow-up actions cannot race a stale
      // count or Bring Board snapshot.
      await refresh();
    } catch {
      setError("We couldn't send your RSVP. Your answers are still here — please try again.");
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
    }
  };

  const relLabel = (() => {
    const s = Math.max(0, Math.floor((Date.now() - lastUpdatedAt) / 1000));
    if (s < 5) return "just now";
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} min ago`;
    return `${Math.floor(m / 60)}h ago`;
  })();

  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden" style={heroStyle}>
        <div className="mx-auto max-w-lg px-6 pt-10 pb-12 text-center">
          <div className="[&_*]:!text-white flex justify-center">
            <BrandLockup />
          </div>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/25 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-white backdrop-blur">
            <Sparkles className="h-3 w-3" /> You're invited
          </div>
          <h1 className="mt-3 font-display text-3xl font-semibold text-white sm:text-4xl">
            {party.name}
          </h1>
          <div className="mt-2 flex items-center justify-center gap-2 text-sm text-white/90">
            <CalendarDays className="h-4 w-4" />
            {formatDateLong(party.date)}
          </div>
          {party.start_time && (
            <div className="mt-1 flex items-center justify-center gap-2 text-sm text-white/90">
              <Clock className="h-4 w-4" />
              {party.start_time}
            </div>
          )}
          {party.location && (
            <div className="mt-1 flex items-center justify-center gap-2 text-sm text-white/90">
              <MapPin className="h-4 w-4" />
              {party.location}
            </div>
          )}
          <div className="mt-4 font-display text-5xl font-semibold text-white tabular-nums">
            {days >= 0 ? days : "—"}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-white/80">
            {days === 1 ? "day to go" : days >= 0 ? "days to go" : "already happened"}
          </div>
        </div>
      </section>

      <main className="mx-auto -mt-6 max-w-lg px-4 pb-4 sm:px-6">
        {party.host_note && party.host_note.trim() && (
          <div className="mb-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              A note from your host
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-relaxed text-secondary">
              {party.host_note}
            </p>
          </div>
        )}
        <HostUpdatesFeed updates={party.host_updates ?? []} />

        {done ? (
          <SuccessCard
            party={party}
            choice={submittedChoice ?? "yes"}
            name={name.trim()}
            theme={theme}
            onChange={() => {
              setDone(false);
              setSubmittedChoice(null);
            }}
            onRefresh={refresh}
            refreshing={refreshing}
            relLabel={relLabel}
          />
        ) : (
          <form
            onSubmit={submit}
            className="space-y-5 rounded-3xl border border-border bg-card p-6 shadow-card"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                {party.yes_count} yes · {party.maybe_count} maybe
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground" aria-live="polite">
                  Updated {relLabel}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void refresh()}
                  disabled={refreshing}
                  className="min-h-11 min-w-11"
                  aria-label="Refresh counts"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
                    aria-hidden
                  />
                </Button>
              </div>
            </div>
            {refreshError && (
              <p className="text-[12px] text-destructive" role="alert">
                {refreshError}
              </p>
            )}

            <WhosComing yes={party.yes_count} maybe={party.maybe_count} />

            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="First and last"
                maxLength={80}
                autoComplete="name"
                className="min-h-11"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="household">Group name (optional)</Label>
              <Input
                id="household"
                value={household}
                onChange={(e) => setHousehold(e.target.value)}
                placeholder="e.g. The Rivera family"
                maxLength={80}
                className="min-h-11"
              />
              <p className="text-[11px] text-muted-foreground">
                Helps the host see you as one group.
              </p>
            </div>

            {/* Native fieldset/legend gives the radio group a real accessible
                name for screen readers and passes axe's radiogroup-name rule. */}
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-secondary">Can you make it?</legend>
              <RadioGroup
                aria-label="Can you make it?"
                value={rsvp}
                onValueChange={(v) => {
                  const next = v as RSVPChoice;
                  if (next === "yes" && rsvp !== "yes") celebrate("micro");
                  setRsvp(next);
                }}
                className="grid grid-cols-3 gap-2"
              >
                {(["yes", "maybe", "no"] as RSVPChoice[]).map((val) => (
                  <label
                    key={val}
                    className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm capitalize transition ${
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
            </fieldset>

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
                    onChange={(e) =>
                      setAdults(Math.max(0, Math.min(20, Number(e.target.value) || 0)))
                    }
                    className="min-h-11"
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
                    onChange={(e) =>
                      setKids(Math.max(0, Math.min(20, Number(e.target.value) || 0)))
                    }
                    className="min-h-11"
                  />
                </div>
              </div>
            )}

            {rsvp !== "no" && (
              <div className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-secondary">
                  <HandHeart className="h-4 w-4" aria-hidden />
                  <span className="text-sm font-semibold">Anything to know?</span>
                </div>
                <p className="-mt-2 text-[11px] text-muted-foreground">
                  Shared only with the host to help them plan food. Never public.
                </p>
                <ChipGroup
                  legend="Dietary needs"
                  options={DIETARY_OPTIONS}
                  selected={dietary}
                  onToggle={toggle(setDietary)}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="dietary-other" className="text-xs">
                    Other dietary needs
                  </Label>
                  <Input
                    id="dietary-other"
                    value={dietaryOther}
                    onChange={(e) => setDietaryOther(e.target.value)}
                    placeholder="e.g. low sodium"
                    maxLength={60}
                    className="min-h-11"
                  />
                </div>
                <ChipGroup
                  legend="Allergens to avoid"
                  options={ALLERGEN_OPTIONS}
                  selected={allergens}
                  onToggle={toggle(setAllergens)}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="allergens-other" className="text-xs">
                    Other allergens
                  </Label>
                  <Input
                    id="allergens-other"
                    value={allergensOther}
                    onChange={(e) => setAllergensOther(e.target.value)}
                    placeholder="e.g. mustard"
                    maxLength={60}
                    className="min-h-11"
                  />
                </div>
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button
              type="submit"
              variant="festive"
              className="min-h-11 w-full"
              disabled={submitting}
            >
              {submitting ? "Sending…" : "Send RSVP"}
            </Button>

            <div className="border-t border-border pt-4">
              <p className="mb-2 text-center text-[11px] uppercase tracking-wide text-muted-foreground">
                Save the date
              </p>
              <div className="flex justify-center">
                <CalendarActions party={party} />
              </div>
            </div>

            <p className="text-center text-[11px] text-muted-foreground">
              If your host added you by name, sending again with the same name updates your
              response. Otherwise it adds a new entry — the host can merge duplicates.
            </p>
          </form>
        )}
        <PublicBringBoard
          token={token}
          items={party.bring_board ?? []}
          defaultName={name}
          onChanged={refresh}
          onRequestRefresh={refresh}
          refreshing={refreshing}
          lastUpdatedAt={lastUpdatedAt}
        />
        <PersonalizedPhotoBooth eventName={party.name} date={party.date} theme={theme} />
        <PhotoDropCard drop={party.photo_drop ?? null} />
      </main>

      <ConversionFooter />
    </div>
  );
}

/* ---------- Success card ---------- */

function SuccessCard({
  party,
  choice,
  name,
  theme,
  onChange,
  onRefresh,
  refreshing,
  relLabel,
}: {
  party: PartyView;
  choice: RSVPChoice;
  name: string;
  theme: ReturnType<typeof themeById>;
  onChange: () => void;
  onRefresh: () => void | Promise<void>;
  refreshing: boolean;
  relLabel: string;
}) {
  const copy: Record<
    RSVPChoice,
    { headline: string; body: string; icon: React.ReactNode; badge: React.ReactNode | null }
  > = {
    yes: {
      headline: "You're on the list!",
      body: `Thanks ${name || "and see you soon"} — add it to your calendar so you don't forget.`,
      icon: <PartyPopper className="h-7 w-7" />,
      badge: <Badge variant="success">{party.yes_count} yes so far</Badge>,
    },
    maybe: {
      headline: "We saved your maybe",
      body: "Thanks for the heads-up. Change your response anytime before the day.",
      icon: <HeartHandshake className="h-7 w-7" />,
      badge: null,
    },
    no: {
      headline: "Thanks for letting the host know",
      body: "Wishing you were there. You can change your response if plans open up.",
      icon: <HandHeart className="h-7 w-7" />,
      badge: null,
    },
  };
  const c = copy[choice];
  return (
    <div className="space-y-5 rounded-3xl border border-border bg-card p-6 text-center shadow-card sm:p-8">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
        {c.icon}
      </div>
      <div>
        <h2 className="font-display text-2xl font-semibold text-secondary">{c.headline}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{c.body}</p>
      </div>
      {(c.badge || theme) && (
        <div className="flex flex-wrap justify-center gap-2">
          {c.badge}
          {theme && <Badge variant="accent">{theme.name}</Badge>}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <span className="text-[11px] text-muted-foreground" aria-live="polite">
          Updated {relLabel}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => void onRefresh()}
          disabled={refreshing}
          aria-label="Refresh counts"
          className="min-h-11 min-w-11"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
        </Button>
      </div>
      <div className="rounded-2xl bg-muted/40 p-3">
        <WhosComing yes={party.yes_count} maybe={party.maybe_count} />
      </div>
      {choice !== "no" && (
        <div className="flex justify-center">
          <CalendarActions party={party} />
        </div>
      )}
      <div className="pt-1">
        <Button type="button" variant="outline" onClick={onChange} className="min-h-11">
          Change my response
        </Button>
      </div>
    </div>
  );
}
