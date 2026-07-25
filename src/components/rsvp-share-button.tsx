import { useState } from "react";
import { toast } from "sonner";
import { Link2, Copy, Sparkles } from "lucide-react";
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
import { useParties, daysUntil, type Party } from "@/lib/party-context";
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
  if (!party) return null;

  const onClick = async () => {
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
    </>
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
