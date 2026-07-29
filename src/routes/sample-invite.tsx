import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Clock,
  MapPin,
  Sparkles,
  Users,
  PartyPopper,
  HeartHandshake,
  HandHeart,
  RotateCcw,
  Info,
  ChevronDown,
} from "lucide-react";
import { BrandLockup } from "@/components/brand";
import { LegalFooter } from "@/components/legal-footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { celebrate } from "@/components/confetti-burst";
import { CalendarActions } from "@/components/calendar-actions";
import { PersonalizedPhotoBooth } from "@/components/personalized-photo-booth";
import { formatDateOnly, daysUntilLocal } from "@/lib/date-only";
import { VOCAB } from "@/lib/vocab";
import {
  defaultSampleState,
  derivedCounts,
  loadSampleState,
  resetSampleState,
  saveSampleState,
  type SampleBringItem,
  type SampleRSVP,
  type SampleState,
} from "@/lib/sample-invite-state";

/**
 * The showroom sample invitation.
 *
 * Same presentation contract as /rsvp/$token — cinematic hero, RSVP form,
 * Bring Board, whos-coming counts — but wired to a purely local demo
 * adapter. No RPC. No user record. No production mutation.
 *
 * A persistent "Sample — try it" banner and a Reset button make the
 * mode unambiguous. All copy uses the centralized VOCAB.
 */

// Fictional but internally coherent sample party.
const SAMPLE = {
  name: "Ava & Liam",
  date: "2027-05-22",
  startTime: "5:30 PM",
  location: "Tenuta di Fiore, Tuscany",
  hostNote:
    "We can't wait to celebrate with you in Tuscany. Dinner is at the long table under the vines — bring a light layer for after sunset.",
} as const;

const SAMPLE_CALENDAR_PARTY = {
  name: SAMPLE.name,
  date: SAMPLE.date,
  start_time: SAMPLE.startTime,
  event_time_zone: "Europe/Rome",
  location: SAMPLE.location,
} as const;

const SAMPLE_THEME = {
  name: "Tuscan Table",
  palette: ["hsl(15 55% 50%)", "hsl(80 30% 45%)", "hsl(40 50% 88%)", "hsl(20 40% 30%)"],
} satisfies { name: string; palette: [string, string, string, string] };

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

export const Route = createFileRoute("/sample-invite")({
  component: SampleInvitePage,
  head: () => ({
    meta: [
      { title: `${VOCAB.guestInvite} — sample · Confetti` },
      {
        name: "description",
        content:
          "Try a Confetti guest invite end to end. RSVP, dietary needs, Bring Board — nothing is sent.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: `${VOCAB.guestInvite} — sample · Confetti` },
      {
        property: "og:description",
        content: "Sample guest invitation. Interactive, private, and safe to try.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function SampleInvitePage() {
  const [state, setState] = useState<SampleState>(() => defaultSampleState());
  const [hydrated, setHydrated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadNotice, setLoadNotice] = useState<string | null>(null);
  const [interactionKey, setInteractionKey] = useState(0);

  // Client-only load — never call localStorage during SSR.
  useEffect(() => {
    const { state: loaded, corruption } = loadSampleState();
    setState(loaded);
    if (corruption) {
      setLoadNotice(
        corruption === "oversize"
          ? "The saved sample was too large and was safely reset."
          : corruption === "parse"
            ? "The saved sample was unreadable and was safely reset."
            : "The saved sample didn't match what Confetti expected and was safely reset.",
      );
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const result = saveSampleState(state);
    setSaveError(
      result.ok
        ? null
        : result.reason === "quota"
          ? "This browser is out of space for the sample. Your changes stay for this visit."
          : result.reason === "oversized"
            ? "The sample became too large to save. Some recent changes won't persist."
            : result.reason === "invalid"
              ? "Something is off with the sample data. Reset it to start fresh."
              : "This browser can't save the sample, but you can keep exploring.",
    );
  }, [state, hydrated]);

  const counts = derivedCounts(state);
  const days = daysUntilLocal(SAMPLE.date);
  const done = state.rsvp !== null;

  function resetAll() {
    resetSampleState();
    setState(defaultSampleState());
    setSaveError(null);
    setLoadNotice(null);
    setInteractionKey((value) => value + 1);
  }

  function onSubmit(entry: NonNullable<SampleState["rsvp"]>) {
    setState((prev) => ({ ...prev, rsvp: entry }));
    if (entry.choice === "yes") celebrate("cannon");
  }

  function onChangeResponse() {
    setState((prev) => ({ ...prev, rsvp: null }));
  }

  function claim(itemId: string, guestName: string): { ok: true } | { ok: false; error: string } {
    const trimmed = guestName.trim();
    if (!trimmed) return { ok: false, error: "Please add your name first." };
    const target = state.bring.find((item) => item.id === itemId);
    if (!target) return { ok: false, error: "That item is no longer available." };
    if (target.status !== "open") {
      return { ok: false, error: "Someone else just claimed that item." };
    }
    setState((prev) => ({
      ...prev,
      bring: prev.bring.map((b) =>
        b.id === itemId && b.status === "open"
          ? { ...b, status: "claimed" as const, claimedByMe: true }
          : b,
      ),
    }));
    celebrate("micro");
    return { ok: true };
  }

  function release(itemId: string): { ok: true } | { ok: false; error: string } {
    const target = state.bring.find((item) => item.id === itemId);
    if (!target) return { ok: false, error: "That item is no longer here." };
    if (!target.claimedByMe) {
      return { ok: false, error: "You can only release your own claims." };
    }
    setState((prev) => ({
      ...prev,
      bring: prev.bring.map((b) =>
        b.id === itemId && b.status === "claimed" && b.claimedByMe
          ? { ...b, status: "open" as const, claimedByMe: false }
          : b,
      ),
    }));
    return { ok: true };
  }

  const heroStyle: React.CSSProperties = {
    backgroundImage:
      "linear-gradient(180deg, hsl(268 55% 12% / 0.55) 0%, hsl(268 55% 12% / 0.35) 55%, hsl(36 44% 97% / 0.15) 100%), url(/brand/ava-liam.jpg)",
    backgroundSize: "cover",
    backgroundPosition: "center",
  };

  return (
    <div className="min-h-screen bg-background">
      <SampleBanner onReset={resetAll} />

      <section className="relative overflow-hidden" style={heroStyle}>
        <div className="mx-auto max-w-lg px-6 pt-10 pb-12 text-center">
          <div className="[&_*]:!text-white flex justify-center">
            <BrandLockup />
          </div>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/25 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-white backdrop-blur">
            <Sparkles className="h-3 w-3" /> You're invited
          </div>
          <h1 className="mt-3 font-display text-3xl font-semibold text-white sm:text-4xl">
            {SAMPLE.name}
          </h1>
          <div className="mt-2 flex items-center justify-center gap-2 text-sm text-white/90">
            <CalendarDays className="h-4 w-4" />
            {formatDateOnly(SAMPLE.date, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </div>
          <div className="mt-1 flex items-center justify-center gap-2 text-sm text-white/90">
            <Clock className="h-4 w-4" />
            {SAMPLE.startTime}
          </div>
          <div className="mt-1 flex items-center justify-center gap-2 text-sm text-white/90">
            <MapPin className="h-4 w-4" />
            {SAMPLE.location}
          </div>
          <div className="mt-4 font-display text-5xl font-semibold text-white tabular-nums">
            {days >= 0 ? days : "—"}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-white/80">
            {days === 1 ? "day to go" : days >= 0 ? "days to go" : "already happened"}
          </div>
        </div>
      </section>

      <main
        className="relative z-10 mx-auto -mt-6 max-w-lg px-4 pb-4 sm:px-6"
        data-testid="sample-invite-content"
        data-hydrated={hydrated ? "true" : "false"}
        aria-busy={!hydrated}
      >
        {loadNotice && (
          <div
            className="mb-3 rounded-2xl border border-amber-500/30 bg-amber-50 p-3 text-sm text-amber-900"
            role="status"
            aria-live="polite"
          >
            {loadNotice}
          </div>
        )}
        {saveError && (
          <div
            className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            role="alert"
          >
            {saveError}
          </div>
        )}
        <div className="mb-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            A note from your host
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-relaxed text-secondary">
            {SAMPLE.hostNote}
          </p>
        </div>

        <div key={interactionKey}>
          {done ? (
            <SuccessCard entry={state.rsvp!} counts={counts} onChange={onChangeResponse} />
          ) : (
            <RsvpForm counts={counts} onSubmit={onSubmit} hydrated={hydrated} />
          )}

          <SampleBringBoard
            items={state.bring}
            defaultName={state.rsvp?.name ?? ""}
            onClaim={claim}
            onRelease={release}
          />
          <PersonalizedPhotoBooth eventName={SAMPLE.name} date={SAMPLE.date} theme={SAMPLE_THEME} />
        </div>

        <ConversionFooter />
      </main>
    </div>
  );
}

/* ---------------- Sample-mode notice ---------------- */

function SampleBanner({ onReset }: { onReset: () => void }) {
  return (
    <div
      className="relative border-b border-primary/25 bg-primary/10"
      role="region"
      aria-label="Sample invite notice"
      data-testid="sample-invite-notice"
    >
      <div className="mx-auto flex max-w-lg items-center gap-2 px-4 py-2 text-xs text-secondary sm:px-6">
        <Info className="h-3.5 w-3.5 text-primary" aria-hidden />
        <span className="font-medium">Sample — try it.</span>
        <span className="hidden text-muted-foreground sm:inline">
          Nothing is sent. RSVP and Bring Board are local to your browser.
        </span>
        <span className="text-muted-foreground sm:hidden">Nothing is sent.</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onReset}
          className="ml-auto min-h-11 min-w-11 gap-1 text-xs"
          aria-label="Reset the sample invite"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Reset
        </Button>
      </div>
    </div>
  );
}

/* ---------------- RSVP form ---------------- */

function RsvpForm({
  counts,
  onSubmit,
  hydrated,
}: {
  counts: { yes: number; maybe: number };
  onSubmit: (entry: NonNullable<SampleState["rsvp"]>) => void;
  hydrated: boolean;
}) {
  const [name, setName] = useState("");
  const [household, setHousehold] = useState("");
  const [choice, setChoice] = useState<SampleRSVP>("yes");
  const [adults, setAdults] = useState(1);
  const [kids, setKids] = useState(0);
  const [dietary, setDietary] = useState<string[]>([]);
  const [dietaryOther, setDietaryOther] = useState("");
  const [allergens, setAllergens] = useState<string[]>([]);
  const [allergensOther, setAllergensOther] = useState("");
  const [error, setError] = useState<string | null>(null);

  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>) => (v: string) =>
    setter((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please add your name.");
      return;
    }
    if (choice === "yes" && adults + kids < 1) {
      setError("For a yes, please include at least one attendee.");
      return;
    }
    setError(null);
    const dietaryOut = [
      ...dietary,
      ...(dietaryOther.trim() ? [dietaryOther.trim().slice(0, 60)] : []),
    ];
    const allergensOut = [
      ...allergens,
      ...(allergensOther.trim() ? [allergensOther.trim().slice(0, 60)] : []),
    ];
    onSubmit({
      name: trimmed,
      household: household.trim() ? household.trim().slice(0, 80) : undefined,
      choice,
      adults: choice === "yes" ? adults : 0,
      kids: choice === "yes" ? kids : 0,
      dietary: dietaryOut,
      allergens: allergensOut,
      at: new Date().toISOString(),
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-3xl border border-border bg-card p-6 shadow-card"
      data-testid="sample-rsvp-form"
      data-hydrated={hydrated ? "true" : "false"}
      aria-busy={!hydrated}
      inert={!hydrated}
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="h-4 w-4" />
        {counts.yes} yes · {counts.maybe} maybe
      </div>

      <div className="space-y-2">
        <Label htmlFor="sample-name">Your name</Label>
        <Input
          id="sample-name"
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
        <Label htmlFor="sample-household">Group name (optional)</Label>
        <Input
          id="sample-household"
          value={household}
          onChange={(e) => setHousehold(e.target.value)}
          placeholder="e.g. The Rivera family"
          maxLength={80}
          className="min-h-11"
        />
        <p className="text-[11px] text-muted-foreground">
          Helps the host see everyone in your group together.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-secondary">Can you make it?</legend>
        <RadioGroup
          aria-label="Can you make it?"
          value={choice}
          onValueChange={(v) => setChoice(v as SampleRSVP)}
          className="grid grid-cols-3 gap-2"
        >
          {(["yes", "maybe", "no"] as SampleRSVP[]).map((val) => (
            <label
              key={val}
              className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm capitalize transition ${
                choice === val
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

      {choice === "yes" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="sample-adults">Adults</Label>
            <Input
              id="sample-adults"
              type="number"
              min={0}
              max={20}
              value={adults}
              onChange={(e) => setAdults(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
              className="min-h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sample-kids">Kids</Label>
            <Input
              id="sample-kids"
              type="number"
              min={0}
              max={20}
              value={kids}
              onChange={(e) => setKids(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
              className="min-h-11"
            />
          </div>
        </div>
      )}

      {choice !== "no" && (
        <details className="group rounded-2xl border border-border bg-muted/20">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 text-secondary">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/8 text-primary">
              <HandHeart className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-sm font-semibold">Dietary needs or allergies?</span>
              <span className="block text-[11px] font-normal text-muted-foreground">
                Optional · shared only with the host
              </span>
            </span>
            <ChevronDown
              className="h-4 w-4 shrink-0 text-muted-foreground transition group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <div className="space-y-4 border-t border-border/70 p-4">
            <p className="text-[11px] text-muted-foreground">
              In a real invite, this is shared only with the host. Never public.
            </p>
            <ChipGroup
              legend="Dietary needs"
              options={DIETARY_OPTIONS}
              selected={dietary}
              onToggle={toggle(setDietary)}
            />
            <div className="space-y-1.5">
              <Label htmlFor="sample-dietary-other" className="text-xs">
                Other dietary needs
              </Label>
              <Input
                id="sample-dietary-other"
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
              <Label htmlFor="sample-allergens-other" className="text-xs">
                Other allergens
              </Label>
              <Input
                id="sample-allergens-other"
                value={allergensOther}
                onChange={(e) => setAllergensOther(e.target.value)}
                placeholder="e.g. mustard"
                maxLength={60}
                className="min-h-11"
              />
            </div>
          </div>
        </details>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" variant="festive" className="min-h-11 w-full">
        Send RSVP
      </Button>

      <div className="border-t border-border pt-4">
        <p className="mb-2 text-center text-[11px] uppercase tracking-wide text-muted-foreground">
          Save the date
        </p>
        <CalendarActions party={SAMPLE_CALENDAR_PARTY} />
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        This is a sample. Nothing leaves your browser.
      </p>
    </form>
  );
}

function ChipGroup({
  legend,
  options,
  selected,
  onToggle,
}: {
  legend: string;
  options: readonly string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-secondary">{legend}</legend>
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

/* ---------------- Success ---------------- */

function SuccessCard({
  entry,
  counts,
  onChange,
}: {
  entry: NonNullable<SampleState["rsvp"]>;
  counts: { yes: number; maybe: number };
  onChange: () => void;
}) {
  const copy: Record<SampleRSVP, { headline: string; body: string; icon: React.ReactNode }> = {
    yes: {
      headline: "You're on the list!",
      body: `Thanks ${entry.name} — save the date now so the celebration stays easy.`,
      icon: <PartyPopper className="h-7 w-7" />,
    },
    maybe: {
      headline: "We saved your maybe",
      body: "Thanks for the heads-up. Change your response anytime before the day.",
      icon: <HeartHandshake className="h-7 w-7" />,
    },
    no: {
      headline: "Thanks for letting the host know",
      body: "Wishing you were there. You can change your response if plans open up.",
      icon: <HandHeart className="h-7 w-7" />,
    },
  };
  const c = copy[entry.choice];
  return (
    <div
      className="space-y-5 rounded-3xl border border-border bg-card p-6 text-center shadow-card sm:p-8"
      data-testid="sample-success"
    >
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
        {c.icon}
      </div>
      <div>
        <h2 className="font-display text-2xl font-semibold text-secondary">{c.headline}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{c.body}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {entry.choice === "yes" && <Badge variant="success">{counts.yes} yes so far</Badge>}
        {entry.choice === "maybe" && <Badge variant="warning">Maybe saved</Badge>}
      </div>
      {entry.choice !== "no" && <CalendarActions party={SAMPLE_CALENDAR_PARTY} />}
      <div className="pt-1">
        <Button type="button" variant="outline" onClick={onChange} className="min-h-11">
          Change my response
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Bring Board ---------------- */

function SampleBringBoard({
  items,
  defaultName,
  onClaim,
  onRelease,
}: {
  items: SampleBringItem[];
  defaultName: string;
  onClaim: (id: string, name: string) => { ok: true } | { ok: false; error: string };
  onRelease: (id: string) => { ok: true } | { ok: false; error: string };
}) {
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setName((prev) => prev || defaultName);
  }, [defaultName]);

  const grouped = useMemo(() => {
    return items.reduce<Record<string, SampleBringItem[]>>((acc, it) => {
      (acc[it.category] ??= []).push(it);
      return acc;
    }, {});
  }, [items]);

  return (
    <section
      className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"
      aria-labelledby="sample-bring-heading"
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {VOCAB.bringBoard}
      </div>
      <h2
        id="sample-bring-heading"
        className="mt-0.5 font-display text-lg font-semibold text-secondary"
      >
        What still needs a hand
      </h2>

      <div className="mt-3 space-y-1.5">
        <Label htmlFor="sample-bring-name">Your name</Label>
        <Input
          id="sample-bring-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="So the host knows who claimed it"
          maxLength={80}
          className="min-h-11"
        />
      </div>

      {error && (
        <p className="mt-2 text-xs text-destructive" role="alert" aria-live="polite">
          {error}
        </p>
      )}

      <div className="mt-4 space-y-4">
        {Object.entries(grouped).map(([cat, list]) => (
          <div key={cat}>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {cat}
            </div>
            <ul className="space-y-1.5">
              {list.map((it) => {
                const taken = it.status !== "open";
                const mine = !!it.claimedByMe;
                return (
                  <li
                    key={it.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background/60 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium text-foreground">{it.label}</span>
                        <span className="text-xs text-muted-foreground">× {it.qty}</span>
                      </div>
                      {taken && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {mine ? "Claimed by you" : "Claimed"}
                        </div>
                      )}
                    </div>
                    {taken ? (
                      mine ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const result = onRelease(it.id);
                            setError(result.ok ? null : result.error);
                          }}
                          className="min-h-11"
                        >
                          Release
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Taken</span>
                      )
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          const result = onClaim(it.id, name);
                          setError(result.ok ? null : result.error);
                        }}
                        className="min-h-11"
                      >
                        I'll bring it
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Footer ---------------- */

function ConversionFooter() {
  return (
    <>
      <footer className="mx-auto mt-10 max-w-lg px-6 pb-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <BrandLockup />
          <p className="text-xs text-muted-foreground">
            Like what you see?{" "}
            <Link to="/" className="font-medium text-primary underline-offset-2 hover:underline">
              Start your own with Confetti — free.
            </Link>
          </p>
        </div>
      </footer>
      <LegalFooter className="mt-0" />
    </>
  );
}
