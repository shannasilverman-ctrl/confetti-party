import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Party } from "@/lib/party-context";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function maskAccountEmail(email?: string): string {
  if (!email) return "this account";
  const [local, domain] = email.split("@");
  if (!local || !domain) return "this account";
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}…@${domain}`;
}

export function DemoClaimDialog({
  open,
  onOpenChange,
  parties,
  accountEmail,
  onClaim,
  onFinish,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parties: Party[];
  accountEmail?: string;
  onClaim: (ids: string[]) => Promise<{
    claimedIds: string[];
    error: string | null;
    cleanupPending: boolean;
  }>;
  onFinish: (partyId?: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected((current) => {
      const available = new Set(parties.map((party) => party.id));
      const retained = current.filter((id) => available.has(id));
      return retained.length > 0 ? retained : parties.map((party) => party.id);
    });
  }, [open, parties]);

  async function claim() {
    if (selected.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const result = await onClaim(selected);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.claimedIds.length === 0) {
        toast.error("No browser parties were moved. Your local copies are still safe.");
        return;
      }
      if (result.cleanupPending) {
        toast.message(
          "Your cloud copy is safe. Confetti couldn't clear the browser copy, so retrying is safe.",
        );
      } else {
        toast.success(
          result.claimedIds.length === 1
            ? "Your party is now saved to your account."
            : `${result.claimedIds.length} parties are now saved to your account.`,
        );
      }
      onFinish(result.claimedIds[0]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        onOpenChange(next);
        if (!next) onFinish();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-secondary">
            Bring your plan with you
          </DialogTitle>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Choose which parties saved in this browser to move into{" "}
            <span className="font-medium text-secondary">{maskAccountEmail(accountEmail)}</span>.
            Nothing moves until you confirm.
          </p>
        </DialogHeader>

        <fieldset className="grid gap-2 py-3">
          <legend className="sr-only">Browser parties to move</legend>
          {parties.map((party) => {
            const checked = selected.includes(party.id);
            return (
              <label
                key={party.id}
                className="flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border border-border bg-card p-3"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) =>
                    setSelected((current) =>
                      next
                        ? [...new Set([...current, party.id])]
                        : current.filter((id) => id !== party.id),
                    )
                  }
                  aria-label={`Move ${party.name}`}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block font-medium text-secondary">{party.name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Saved only on this device
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-3 text-xs leading-relaxed text-secondary">
          Confetti waits for the cloud copy before removing anything from this browser. Sample
          parties are never moved.
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" disabled={submitting} onClick={() => onFinish()}>
            Not now
          </Button>
          <Button variant="festive" disabled={selected.length === 0 || submitting} onClick={claim}>
            {submitting
              ? "Moving safely…"
              : `Move ${selected.length || ""} ${selected.length === 1 ? "party" : "parties"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
