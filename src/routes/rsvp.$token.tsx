import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  Clock,
  MapPin,
  Sparkles,
  Users,
  PartyPopper,
  CalendarPlus,
  Navigation,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { themeById } from "@/lib/themes";
import { daysUntil } from "@/lib/party-context";
import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { celebrate } from "@/components/confetti-burst";
import { getRsvpLoaderData, type PartyView } from "@/lib/rsvp.functions";
import { PublicBringBoard } from "@/components/public-bring-board";
import { PhotoDropCard } from "@/components/photo-drop-card";
import { HostUpdatesFeed } from "@/components/host-updates-feed";

type RSVPChoice = "yes" | "maybe" | "no";

function formatDateLong(date: string) {
  return new Date(date + "T00:00:00").toLocaleDateString(undefined, {
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
  errorComponent: () => <InvalidInvite />,
  notFoundComponent: () => <InvalidInvite />,
});

function InvalidInvite() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <BrandLockup />
      <h1 className="mt-8 font-display text-2xl font-semibold text-secondary">
        This invite link doesn't look right
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Double-check the link with your host, or ask them to resend it.
      </p>
      <ConversionFooter />
    </div>
  );
}

function PublicRsvpPage() {
  const { token } = Route.useParams();
  const { party } = Route.useLoaderData();
  if (!party) return <InvalidInvite />;
  return <RsvpForm token={token} party={party} />;
}

/* ---------- Calendar helpers ---------- */

function parseTimeTo24h(t: string | null): { h: number; m: number } | null {
  if (!t) return null;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3]?.toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function toLocalStamp(d: Date) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

function toAllDayStamp(date: string) {
  return date.replace(/-/g, "");
}

function buildCalendarPayload(party: PartyView) {
  const time = parseTimeTo24h(party.start_time);
  if (time) {
    const start = new Date(party.date + "T00:00:00");
    start.setHours(time.h, time.m, 0, 0);
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
    return {
      allDay: false as const,
      start,
      end,
      googleDates: `${toLocalStamp(start)}/${toLocalStamp(end)}`,
      icsStart: toLocalStamp(start),
      icsEnd: toLocalStamp(end),
      icsAllDay: false,
    };
  }
  const startStamp = toAllDayStamp(party.date);
  const endDate = new Date(party.date + "T00:00:00");
  endDate.setDate(endDate.getDate() + 1);
  const endStamp = `${endDate.getFullYear()}${pad(endDate.getMonth() + 1)}${pad(endDate.getDate())}`;
  return {
    allDay: true as const,
    googleDates: `${startStamp}/${endStamp}`,
    icsStart: startStamp,
    icsEnd: endStamp,
    icsAllDay: true,
  };
}

function googleCalUrl(party: PartyView) {
  const p = buildCalendarPayload(party);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: party.name,
    dates: p.googleDates,
    details: "See you there — sent via Confetti.",
  });
  if (party.location) params.set("location", party.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function buildIcs(party: PartyView): string {
  const p = buildCalendarPayload(party);
  const uid = `${(party.name || "party").replace(/\W+/g, "-")}-${Date.now()}@confetti-party.lovable.app`;
  const now = toLocalStamp(new Date());
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Confetti//RSVP//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    p.icsAllDay
      ? `DTSTART;VALUE=DATE:${p.icsStart}`
      : `DTSTART:${p.icsStart}`,
    p.icsAllDay
      ? `DTEND;VALUE=DATE:${p.icsEnd}`
      : `DTEND:${p.icsEnd}`,
    `SUMMARY:${esc(party.name)}`,
    party.location ? `LOCATION:${esc(party.location)}` : "",
    "DESCRIPTION:See you there — sent via Confetti.",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.join("\r\n");
}

function downloadIcs(party: PartyView) {
  const ics = buildIcs(party);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${party.name.replace(/[^\w\-]+/g, "_") || "party"}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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


function CalendarAndDirections({ party }: { party: PartyView }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline" size="sm">
        <a href={googleCalUrl(party)} target="_blank" rel="noopener noreferrer">
          <CalendarPlus /> Google Calendar
        </a>
      </Button>
      <Button variant="outline" size="sm" onClick={() => downloadIcs(party)}>
        <CalendarPlus /> Apple / .ics
      </Button>
      {party.location && (
        <Button asChild variant="outline" size="sm">
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(party.location)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Navigation /> Directions
          </a>
        </Button>
      )}
    </div>
  );
}

function ConversionFooter() {
  return (
    <footer className="mx-auto mt-10 max-w-lg px-6 pb-10 text-center">
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
  );
}

/* ---------- Main form ---------- */

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
        : {
            backgroundImage:
              "var(--gradient-festive, linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent))))",
          },
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
    celebrate("cannon");
  };

  const displayYes = party.yes_count + (done && rsvp === "yes" ? 1 : 0);


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
          <div className="space-y-5 rounded-3xl border border-border bg-card p-6 text-center shadow-card sm:p-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
              <PartyPopper className="h-7 w-7" />
            </div>
            <div>
              <h2 className="font-display text-2xl font-semibold text-secondary">
                You're on the list!
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Thanks {name.trim()} — we'll see you there. Add it to your calendar so you don't forget.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Badge variant="success">{displayYes} yes so far</Badge>
              {theme && <Badge variant="accent">{theme.name}</Badge>}
            </div>
            <div className="rounded-2xl bg-muted/40 p-3">
              <WhosComing yes={displayYes} maybe={party.maybe_count} />
            </div>
            <div className="flex justify-center">
              <CalendarAndDirections party={party} />
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

            <WhosComing yes={party.yes_count} maybe={party.maybe_count} />

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
                    onChange={(e) =>
                      setAdults(Math.max(0, Math.min(20, Number(e.target.value) || 0)))
                    }
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

            <div className="border-t border-border pt-4">
              <p className="mb-2 text-center text-[11px] uppercase tracking-wide text-muted-foreground">
                Save the date
              </p>
              <div className="flex justify-center">
                <CalendarAndDirections party={party} />
              </div>
            </div>

            <p className="text-center text-[11px] text-muted-foreground">
              Sending again with the same name updates your response.
            </p>
          </form>
        )}
        <PublicBringBoard token={token} items={party.bring_board ?? []} defaultName={name} />
        <PhotoDropCard drop={party.photo_drop ?? null} />
      </main>

      <ConversionFooter />
    </div>
  );
}
