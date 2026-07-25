import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useParties } from "@/lib/party-context";

type Props = {
  partyId: string;
  partyName: string;
  /** When true, navigate to /app after successful delete. */
  redirectOnDelete?: boolean;
  variant?: "ghost" | "outline" | "destructive";
  size?: "sm" | "icon" | "default";
  /** Optional label override; defaults to "Delete" (icon-only when size="icon"). */
  label?: string;
  className?: string;
};

export function DeletePartyButton({
  partyId,
  partyName,
  redirectOnDelete = false,
  variant = "ghost",
  size = "sm",
  label,
  className,
}: Props) {
  const { deleteParty } = useParties();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const isIcon = size === "icon";
  const displayLabel = label ?? "Delete";

  async function onConfirm() {
    setBusy(true);
    try {
      const { error } = await deleteParty(partyId);
      if (error) {
        toast.error(`Could not delete: ${error}`);
        return;
      }
      toast.success(`Deleted "${partyName}"`);
      setOpen(false);
      if (redirectOnDelete) void navigate({ to: "/app", replace: true });
    } catch {
      toast.error("Could not delete this party. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={className}
          aria-label={isIcon ? `Delete ${partyName}` : undefined}
          onClick={(e) => e.stopPropagation()}
        >
          <Trash2 className="h-4 w-4" />
          {!isIcon && <span className="ml-1.5">{displayLabel}</span>}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this party?</AlertDialogTitle>
          <AlertDialogDescription>
            "{partyName}" and all of its checklist, guests, shopping, and bring-board items will be
            permanently removed. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void onConfirm();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy ? "Deleting…" : "Delete party"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
