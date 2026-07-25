import { useRef, useState } from "react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  Clock,
  MapPin,
  Link2,
  Copy,
  Download,
  Share2,
  Sparkles,
  Mail,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { planningDetailIsOpen, useParties, type Party } from "@/lib/party-context";
import { celebrate } from "@/components/confetti-burst";
import { themeById } from "@/lib/themes";
import { formatDateOnly } from "@/lib/date-only";

function formatDate(dateISO: string) {
  return formatDateOnly(dateISO, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function buildInviteText(party: Party, url: string) {
  const parts: string[] = [];
  parts.push(`You're invited to ${party.name}!`);
  const when = party.startTime
    ? `${formatDate(party.date)} at ${party.startTime}`
    : formatDate(party.date);
  parts.push(when);
  if (party.location) parts.push(party.location);
  parts.push(`RSVP: ${url}`);
  return parts.join("\n");
}

export function InviteDialog({
  open,
  onOpenChange,
  partyId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  partyId: string;
}) {
  const { getParty, isDemo } = useParties();
  const party = getParty(partyId);
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  if (!party) return null;

  const theme = themeById(party.themeId);
  const isReal = !isDemo && !!party.rsvpToken;
  const dateTbd = planningDetailIsOpen(party, "date");
  const url = isReal
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/rsvp/${party.rsvpToken}`
    : "Your private RSVP link";

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copyLink = async () => {
    if (dateTbd) {
      toast.info("Add the real date before sharing this invitation.");
      return;
    }
    if (!isReal) {
      toast.info("Sign up free to get a real shareable link.");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("RSVP link copied");
      celebrate("micro");
    } catch {
      toast.error("Couldn't copy link", { description: url });
    }
  };

  const copyMessage = async () => {
    if (dateTbd) {
      toast.info("Add the real date before copying an invite message.");
      return;
    }
    const text = buildInviteText(party, url);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Invite message copied", {
        description: isReal ? "Paste into a text message." : "Preview — sign up for a real link.",
      });
      celebrate("micro");
    } catch {
      toast.error("Couldn't copy message");
    }
  };

  const download = async () => {
    if (dateTbd) {
      toast.info("Add the real date before downloading an invitation.");
      return;
    }
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });
      const link = document.createElement("a");
      link.download = `${party.name.replace(/\s+/g, "-").toLowerCase()}-invite.png`;
      link.href = dataUrl;
      link.click();
      toast.success("Invite image saved");
      celebrate("micro");
    } catch (e) {
      console.error("[invite] download failed", e);
      toast.error("Couldn't create image — try again.");
    } finally {
      setDownloading(false);
    }
  };

  const shareNative = async () => {
    if (dateTbd) {
      toast.info("Add the real date before sharing this invitation.");
      return;
    }
    if (!canShare) return;
    const text = buildInviteText(party, url);
    try {
      await navigator.share({ title: party.name, text, url: isReal ? url : undefined });
    } catch {
      // user dismissed
    }
  };

  const heroStyle: React.CSSProperties = theme
    ? {
        backgroundImage: `linear-gradient(135deg, hsl(${theme.palette[0]} / 0.55), hsl(${theme.palette[1]} / 0.65)), url(${theme.heroImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {
        backgroundImage: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))",
      };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-secondary">Party invite</DialogTitle>
          <DialogDescription>
            {dateTbd
              ? "Preview your card now. Add the real date before sharing it with guests."
              : "Share the card and RSVP link with your guests."}
          </DialogDescription>
        </DialogHeader>

        {dateTbd && (
          <div
            role="status"
            data-testid="invite-date-required"
            className="flex items-start gap-3 rounded-2xl border border-warning/35 bg-warning/10 p-4 text-sm text-secondary"
          >
            <CalendarClock
              className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground"
              aria-hidden
            />
            <div>
              <p className="font-semibold">Date to decide</p>
              <p className="mt-0.5 text-muted-foreground">
                Your plan is safe to keep editing. Sharing stays locked so guests never see a
                placeholder date.
              </p>
            </div>
          </div>
        )}

        {/* Invite card */}
        <div
          ref={cardRef}
          className="relative overflow-hidden rounded-3xl text-white shadow-elevated"
          style={heroStyle}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/60" />
          <div className="relative flex min-h-[440px] flex-col p-7">
            <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/25 px-3 py-1 text-[11px] font-medium uppercase tracking-wide backdrop-blur">
              <Sparkles className="h-3 w-3" /> You're invited
            </div>

            <div className="mt-auto space-y-3">
              <h2 className="font-display text-4xl font-semibold leading-tight drop-shadow sm:text-5xl">
                {party.name}
              </h2>
              <p className="text-sm/relaxed text-white/85">{party.theme}</p>

              <div className="space-y-1.5 pt-2 text-sm">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  <span className="tabular-nums">
                    {dateTbd ? "Date to decide" : formatDate(party.date)}
                  </span>
                </div>
                {party.startTime && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span className="tabular-nums">{party.startTime}</span>
                  </div>
                )}
                {party.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span>{party.location}</span>
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-xl bg-white/20 px-3 py-2 text-xs backdrop-blur">
                <div className="text-[10px] uppercase tracking-wide text-white/80">RSVP at</div>
                <div className="mt-0.5 truncate font-medium">{url}</div>
              </div>
            </div>
          </div>
        </div>

        {!isReal && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs text-secondary">
            You're viewing a demo party. Sign up free to get a real shareable RSVP link for your own
            invites.
          </div>
        )}

        <div className="grid grid-cols-2 gap-2" aria-label="Invitation sharing actions">
          <Button variant="outline" size="sm" onClick={copyLink} disabled={dateTbd}>
            <Link2 /> Copy link
          </Button>
          <Button variant="outline" size="sm" onClick={copyMessage} disabled={dateTbd}>
            <Copy /> Copy message
          </Button>
          <Button variant="outline" size="sm" onClick={download} disabled={dateTbd || downloading}>
            <Download /> {downloading ? "Preparing…" : "Download image"}
          </Button>
          {canShare && (
            <Button variant="outline" size="sm" onClick={shareNative} disabled={dateTbd}>
              <Share2 /> Share…
            </Button>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {!isReal && (
            <Button asChild variant="festive">
              <Link to="/auth" search={{ mode: "signup" }}>
                <Sparkles /> Sign up free
              </Link>
            </Button>
          )}
          {isReal && !dateTbd && (
            <a
              href={`mailto:?subject=${encodeURIComponent(`You're invited to ${party.name}`)}&body=${encodeURIComponent(buildInviteText(party, url))}`}
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <Mail className="h-4 w-4" /> Email invite
            </a>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
