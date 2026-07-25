import { useState, type ReactElement } from "react";
import { Slot } from "@radix-ui/react-slot";
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
 * The trigger must be one focusable element. Radix Slot forwards behavior
 * onto that element so we never create invalid button-inside-button markup.
 *
 * Confirm mode keeps its dialog open when an async mutation fails. Undo mode
 * only offers Undo when the caller supplied a real restoring mutation.
 */
export type ConfirmResult = { ok: true } | { ok: false; error: string };

export function ConfirmDelete({
  mode,
  itemLabel,
  onConfirm,
  onUndo,
  trigger,
  title,
  description,
  impact,
}: {
  mode: "confirm" | "undo";
  itemLabel: string;
  onConfirm: () => void | ConfirmResult | Promise<void | ConfirmResult>;
  onUndo?: () => void | ConfirmResult | Promise<void | ConfirmResult>;
  trigger: ReactElement;
  title?: string;
  description?: string;
  impact?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runUndo() {
    if (!onUndo) return;
    try {
      const result = await onUndo();
      if (result && !result.ok) {
        toast.error(`Couldn't restore ${itemLabel}`, {
          description: result.error,
          action: { label: "Retry", onClick: () => void runUndo() },
        });
      }
    } catch (caught) {
      toast.error(`Couldn't restore ${itemLabel}`, {
        description: caught instanceof Error ? caught.message : "Please try again.",
        action: { label: "Retry", onClick: () => void runUndo() },
      });
    }
  }

  if (mode === "undo") {
    const handleClick = () => {
      void (async () => {
        try {
          const result = await onConfirm();
          if (result && !result.ok) {
            toast.error(`Couldn't remove ${itemLabel}`, { description: result.error });
            return;
          }
          if (onUndo) {
            toast(`Removed ${itemLabel}`, {
              action: { label: "Undo", onClick: () => void runUndo() },
              duration: 5000,
            });
          } else {
            toast(`Removed ${itemLabel}`);
          }
        } catch (caught) {
          toast.error(`Couldn't remove ${itemLabel}`, {
            description: caught instanceof Error ? caught.message : "Please try again.",
          });
        }
      })();
    };

    return <Slot onClick={handleClick}>{trigger}</Slot>;
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title ?? `Remove ${itemLabel}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {description ??
              "This can't be undone from here. Any linked RSVPs or claims will be lost."}
          </AlertDialogDescription>
          {impact ? (
            <p className="mt-2 text-sm font-medium text-foreground" role="note">
              {impact}
            </p>
          ) : null}
          {error ? (
            <p className="mt-2 text-sm text-destructive" role="alert" aria-live="polite">
              {error}
            </p>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11" disabled={pending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              setError(null);
              setPending(true);
              void (async () => {
                try {
                  const result = await onConfirm();
                  if (result && !result.ok) {
                    setError(result.error);
                    return;
                  }
                  setOpen(false);
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : "Please try again.");
                } finally {
                  setPending(false);
                }
              })();
            }}
            className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? "Removing…" : "Remove"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
