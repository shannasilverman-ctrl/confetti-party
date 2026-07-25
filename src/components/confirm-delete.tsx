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

export type ConfirmResult = { ok: true } | { ok: false; error: string };

/**
 * Confirm-before-delete affordance for destructive row actions.
 *
 * `trigger` MUST be a single focusable element (e.g. a `<button>` with an
 * `aria-label`). Both modes forward click/keyboard to that element via a
 * Radix Slot — no wrapping button is added, so nested-interactive HTML is
 * impossible.
 *
 * `mode="confirm"` opens an AlertDialog and awaits `onConfirm`. If the
 * promise rejects or resolves `{ ok: false }`, the dialog stays open with
 * an inline error and the caller can retry.
 *
 * `mode="undo"` deletes immediately and shows a toast with an Undo action
 * only when `onUndo` is provided (never fake an undo). If `onUndo` returns
 * `{ ok: false }`, a Retry toast is emitted.
 */
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
  onConfirm: () => void | Promise<void | ConfirmResult>;
  onUndo?: () => void | Promise<void | ConfirmResult>;
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
    const result = await onUndo();
    if (result && "ok" in result && !result.ok) {
      toast.error(`Couldn't restore ${itemLabel}`, {
        description: result.error,
        action: { label: "Retry", onClick: () => void runUndo() },
      });
    }
  }

  if (mode === "undo") {
    const handleClick = () => {
      void (async () => {
        const result = await onConfirm();
        if (result && "ok" in result && !result.ok) {
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
      })();
    };
    // Slot forwards onClick + all other props onto the caller's element.
    return <Slot onClick={handleClick}>{trigger}</Slot>;
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          setOpen(next);
          if (!next) setError(null);
        }
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
                  if (result && "ok" in result && !result.ok) {
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
