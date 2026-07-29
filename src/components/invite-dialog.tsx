import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import { Link } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import {
  CalendarDays,
  Camera,
  Clock,
  MapPin,
  Link2,
  Copy,
  Download,
  Share2,
  Sparkles,
  Mail,
  CalendarClock,
  LockKeyhole,
  Printer,
  AlertTriangle,
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
import { buildPartyBoothUrl } from "@/lib/photo-booth";
import { openPrintableSign } from "@/lib/printable-sign";
import { partyHeroImage } from "@/lib/party-visual";
import { DEMO_CLAIM_RETURN_TO } from "@/lib/demo-claim";
import { guestShareReadiness } from "@/lib/guest-share-readiness";
import { SaveStatus } from "@/components/save-status";

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
  const { getParty, isDemo, isPartyCloudVerified, saveStates, conflicts, insertRejected } =
    useParties();
  const party = getParty(partyId);
  const cardRef = useRef<HTMLDivElement>(null);
  const boothQrRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [clientOrigin, setClientOrigin] = useState("");

  useEffect(() => {
    setClientOrigin(window.location.origin);
  }, []);

  if (!party) return null;

  const theme = themeById(party.themeId);
  const heroImage = partyHeroImage(party);
  const isReal = !isDemo && !!party.rsvpToken;
  const dateTbd = planningDetailIsOpen(party, "date");
  const readiness = guestShareReadiness({
    isDemo,
    hasRsvpToken: !!party.rsvpToken,
    dateIsOpen: dateTbd,
    cloudVerified: isPartyCloudVerified(partyId),
    saveState: saveStates[partyId] ?? "idle",
    hasConflict: !!conflicts[partyId],
    insertRejected: !!insertRejected[partyId],
  });
  const sharingLocked = !isDemo && !readiness.canShare;
  const url = readiness.canShare
    ? `${clientOrigin}/rsvp/${party.rsvpToken}`
    : readiness.canPreview
      ? "Your private RSVP link"
      : "Available after the latest details save";
  const boothUrl = dateTbd
    ? null
    : readiness.canShare
      ? buildPartyBoothUrl(url)
      : readiness.canPreview && party.id === "ava-liam-wedding"
        ? buildPartyBoothUrl(`${clientOrigin}/sample-invite`)
        : null;

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
    if (!readiness.canShare) return;
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
    if (sharingLocked) return;
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
    if (sharingLocked) return;
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
    if (sharingLocked) return;
    if (!canShare) return;
    const text = buildInviteText(party, url);
    try {
      await navigator.share({ title: party.name, text, url: isReal ? url : undefined });
    } catch {
      // user dismissed
    }
  };

  const copyBoothLink = async () => {
    if (!boothUrl || sharingLocked) return;
    try {
      await navigator.clipboard.writeText(boothUrl);
      toast.success("Party Booth link copied", {
        description: "Guests land directly in the private booth.",
      });
      celebrate("micro");
    } catch {
      toast.error("Couldn't copy the booth link", { description: boothUrl });
    }
  };

  const shareBooth = async () => {
    if (!boothUrl || !canShare || sharingLocked) return;
    try {
      await navigator.share({
        title: `${party.name} Party Booth`,
        text: `Take a party photo for ${party.name}. Your photos stay on your phone.`,
        url: boothUrl,
      });
    } catch {
      // user dismissed
    }
  };

  const printBoothSign = () => {
    if (!boothUrl || sharingLocked) return;
    const qrSvg = boothQrRef.current?.querySelector("svg")?.outerHTML;
    if (
      !qrSvg ||
      !openPrintableSign({
        partyName: party.name,
        title: "Your private Party Booth",
        note: `Scan, take or choose a photo, add ${party.name}'s event frame, and save it to your phone. Confetti never uploads your photos.`,
        url: boothUrl,
        qrSvg,
      })
    ) {
      toast.error("Couldn't prepare the booth sign. Try again.");
    }
  };

  const heroStyle: React.CSSProperties = {
    backgroundImage: theme
      ? `linear-gradient(135deg, hsl(${theme.palette[0]} / 0.55), hsl(${theme.palette[1]} / 0.65)), url(${heroImage})`
      : `linear-gradient(135deg, hsl(270 49% 18% / 0.76), hsl(330 58% 42% / 0.45)), url(${heroImage})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
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

        {sharingLocked && (
          <div
            role="status"
            data-testid="guest-share-readiness"
            data-state={readiness.kind}
            className="rounded-2xl border border-warning/35 bg-warning/10 p-4 text-sm text-secondary"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground"
                aria-hidden
              />
              <div>
                <p className="font-semibold">{readiness.title}</p>
                <p className="mt-0.5 text-muted-foreground">{readiness.message}</p>
              </div>
            </div>
            <div className="mt-3">
              <SaveStatus partyId={partyId} />
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
              {party.themeId && party.theme.trim() && (
                <p className="text-sm/relaxed text-white/85">{party.theme}</p>
              )}

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

        {isDemo && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs text-secondary">
            You're viewing a demo party. Sign up free to get a real shareable RSVP link for your own
            invites.
          </div>
        )}

        <div className="grid grid-cols-2 gap-2" aria-label="Invitation sharing actions">
          <Button
            variant="outline"
            size="sm"
            onClick={copyLink}
            disabled={dateTbd || sharingLocked}
          >
            <Link2 /> Copy link
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={copyMessage}
            disabled={dateTbd || sharingLocked}
          >
            <Copy /> Copy message
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={download}
            disabled={dateTbd || sharingLocked || downloading}
          >
            <Download /> {downloading ? "Preparing…" : "Download image"}
          </Button>
          {canShare && (
            <Button
              variant="outline"
              size="sm"
              onClick={shareNative}
              disabled={dateTbd || sharingLocked}
            >
              <Share2 /> Share…
            </Button>
          )}
        </div>

        {boothUrl && (
          <section
            className="overflow-hidden rounded-3xl border border-primary/20 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.18),transparent_48%),linear-gradient(135deg,hsl(var(--card)),hsl(var(--muted)/0.5))] p-4 sm:p-5"
            aria-labelledby="host-party-booth-heading"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <Camera className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                  At-the-party magic
                </div>
                <h3
                  id="host-party-booth-heading"
                  className="mt-0.5 font-display text-xl font-semibold text-secondary"
                >
                  Put the booth where the party is
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Print the sign for the welcome table. One scan opens {party.name}'s booth—no
                  account, app, or photo upload.
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-white/80 bg-white/75 p-3 shadow-sm sm:flex-row sm:items-center">
              <div
                ref={boothQrRef}
                className="mx-auto shrink-0 rounded-2xl border border-border bg-white p-2.5"
              >
                <QRCodeSVG
                  value={boothUrl}
                  size={124}
                  includeMargin
                  title={`${party.name} Party Booth QR code`}
                />
              </div>
              <div className="min-w-0 flex-1">
                {!isReal && (
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    Sample booth sign
                  </div>
                )}
                <div className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                  <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <span>Every photo stays on the guest's device. Confetti stores nothing.</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" onClick={copyBoothLink}>
                    <Copy className="h-4 w-4" /> Copy booth link
                  </Button>
                  <Button size="sm" variant="secondary" onClick={printBoothSign}>
                    <Printer className="h-4 w-4" /> Printable sign
                  </Button>
                  {canShare && (
                    <Button size="sm" variant="outline" className="col-span-2" onClick={shareBooth}>
                      <Share2 className="h-4 w-4" /> Share booth
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {isDemo && (
            <Button asChild variant="festive">
              <Link to="/auth" search={{ mode: "signup", returnTo: DEMO_CLAIM_RETURN_TO }}>
                <Sparkles /> Sign up free
              </Link>
            </Button>
          )}
          {readiness.canShare && (
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
