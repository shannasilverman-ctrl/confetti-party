import { useState } from "react";
import { toast } from "sonner";
import { Link2, Copy, Sparkles, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Link } from "@tanstack/react-router";
import { useParties, daysUntil, planningDetailIsOpen, type Party } from "@/lib/party-context";
import { themeById } from "@/lib/themes";
import { formatDateOnly } from "@/lib/date-only";

export function RsvpShareButton({
  partyId,
  variant = "outline",
  size = "sm",
  className,
  label = "Copy RSVP link",
}: {
  partyId: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  label?: string;
}) {
  const { getParty, isDemo } = useParties();
  const party = getParty(partyId);
  const [demoOpen, setDemoOpen] = useState(false);
  const [dateNeededOpen, setDateNeededOpen] = useState(false);
  if (!party) return null;

  const onClick = async () => {
    if (planningDetailIsOpen(party, "date")) {
      setDateNeededOpen(true);
      return;
    }
    if (isDemo || !party.rsvpToken) {
      setDemoOpen(true);
      return;
    }
    const url = `${window.location.origin}/rsvp/${party.rsvpToken}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("RSVP link copied", { description: url });
    } catch {
      toast.error("Couldn't copy — long-press to select the link.", {
        description: url,
      });
    }
  };

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={onClick}>
        <Link2 /> {label}
      </Button>
      <DemoRsvpDialog open={demoOpen} onOpenChange={setDemoOpen} party={party} />
      <DateNeededDialog
        open={dateNeededOpen}
        onOpenChange={setDateNeededOpen}
        partyName={party.name}
      />
    </>
  );
}

function DateNeededDialog({
  open,
  onOpenChange,
  partyName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  partyName: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-warning/20 text-warning-foreground">
            <CalendarClock className="h-5 w-5" aria-hidden />
          </div>
          <DialogTitle className="font-display text-2xl">Pick the date before sharing</DialogTitle>
          <DialogDescription>
            {partyName} is safely marked “Date to decide.” Add the real date in Edit details before
            sending guests an RSVP link.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-border bg-muted/50 p-3 text-sm text-secondary">
          Your planning work is saved. Confetti won&apos;t put a guessed date on an invitation.
        </div>
        <DialogFooter>
          <Button variant="festive" onClick={() => onOpenChange(false)}>
            Keep planning
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DemoRsvpDialog({
  open,
  onOpenChange,
  party,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  party: Party;
}) {
  const theme = themeById(party.themeId);
  const days = daysUntil(party.date);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Preview: public RSVP page</DialogTitle>
          <DialogDescription>
            This is what guests would see. Sign up free to get a real shareable link for your
            parties.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          {theme?.heroImage && (
            <img src={theme.heroImage} alt="" className="h-32 w-full object-cover" aria-hidden />
          )}
          <div className="p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              You're invited
            </div>
            <h3 className="mt-1 font-display text-xl font-semibold text-secondary">{party.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDateOnly(party.date, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
              {days >= 0 ? ` · ${days} day${days === 1 ? "" : "s"} to go` : ""}
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-muted/60 p-2 text-xs text-muted-foreground">
              <Copy className="h-3 w-3" />
              <span className="truncate">Your private RSVP link</span>
            </div>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button asChild variant="festive">
            <Link to="/auth" search={{ mode: "signup" }}>
              <Sparkles /> Sign up free
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
