import { useState, type ReactNode } from "react";
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

/**
 * Confirm-before-delete affordance for destructive row actions.
 *
 * Two modes:
 *  - `mode="confirm"` shows an AlertDialog (used when the row carries
 *    meaningful state: a claim, an RSVP, a submitted expense).
 *  - `mode="undo"` deletes immediately but emits a toast with Undo
 *    (used for safe local rows: empty tasks, unpurchased shopping items).
 *
 * `trigger` should already carry an accessible name (e.g. `aria-label="Remove Ava Rossi"`).
 */
export function ConfirmDelete({
  mode,
  itemLabel,
  onConfirm,
  onUndo,
  trigger,
  title,
  description,
}: {
  mode: "confirm" | "undo";
  itemLabel: string;
  onConfirm: () => void;
  onUndo?: () => void;
  trigger: ReactNode;
  title?: string;
  description?: string;
}) {
  const [open, setOpen] = useState(false);

  if (mode === "undo") {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          onConfirm();
          if (onUndo) {
            toast(`Removed ${itemLabel}`, {
              action: { label: "Undo", onClick: onUndo },
              duration: 5000,
            });
          } else {
            toast(`Removed ${itemLabel}`);
          }
        }}
        // Pass-through — the caller is expected to style its own trigger.
        className="contents"
      >
        {trigger}
      </button>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title ?? `Remove ${itemLabel}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {description ??
              "This can't be undone from here. Any linked RSVPs or claims will be lost."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onConfirm();
              setOpen(false);
            }}
            className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
