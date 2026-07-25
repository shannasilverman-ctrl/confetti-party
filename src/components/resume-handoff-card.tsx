// "Pick up where you left off" card shown at the top of /talk when a
// signed-in user has a fresh, unclaimed (or self-claimed) local handoff.
//
// Continue is idempotent end-to-end: it marks the local handoff as
// claimed by the current user, calls the server importHandoffDraft
// (which uses a per-user unique idempotency key), and only clears local
// state after the server returns a canonical draft id. A refresh or
// double-click cannot create duplicates.

import { useCallback, useRef, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { clearHandoff, markClaimedBy, type TalkHandoffV1 } from "@/lib/talk-handoff";
import { importHandoffDraft } from "@/lib/handoff-import.functions";

export type ResumeHandoffCardProps = {
  handoff: TalkHandoffV1;
  userId: string;
  /** Called with the imported draft id once the server has confirmed it. */
  onImported: (draftId: string) => void;
  /** Called when the user explicitly discards the handoff. */
  onDiscard: () => void;
};

export function ResumeHandoffCard({
  handoff,
  userId,
  onImported,
  onDiscard,
}: ResumeHandoffCardProps) {
  const [busy, setBusy] = useState(false);
  // Guard: even if React batches two clicks, only one server call fires.
  const inFlight = useRef(false);

  const onContinue = useCallback(async () => {
    if (inFlight.current || busy) return;
    inFlight.current = true;
    setBusy(true);
    try {
      // Bind the local record to this user before any network call, so a
      // second signer on the same device cannot silently pick it up mid-flight.
      markClaimedBy(userId);
      const res = await importHandoffDraft({
        data: {
          idempotencyKey: handoff.idempotencyKey,
          summary: handoff.summary,
          messages: handoff.messages,
          patch: handoff.patch,
        },
      });
      // Only clear local state after the server has canonically saved.
      clearHandoff();
      onImported(res.id);
    } catch (err) {
      console.debug("[handoff] resume_failed", err instanceof Error ? err.name : typeof err);
      toast.error("Couldn't pick up your notes just now. Try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [busy, handoff, userId, onImported]);

  const onDiscardClick = useCallback(() => {
    clearHandoff();
    onDiscard();
  }, [onDiscard]);

  const preview =
    handoff.messages
      .filter((m) => m.role === "user")
      .slice(-1)
      .map((m) => m.text)[0] ?? handoff.summary;

  return (
    <Card
      className="p-4 sm:p-5 border-primary/30 bg-primary/5"
      role="region"
      aria-label="Pick up where you left off"
    >
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div className="flex-1">
          <h2 className="font-display text-lg font-semibold text-secondary">
            Pick up where you left off
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            We saved your last notes on this device. Continue to bring them into your account, or
            discard and start fresh.
          </p>
          {preview ? (
            <p className="mt-2 line-clamp-2 rounded-md bg-background/60 p-2 text-xs text-secondary">
              &ldquo;{preview}&rdquo;
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="festive"
              size="sm"
              disabled={busy}
              onClick={onContinue}
              aria-busy={busy}
            >
              {busy ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> Continuing…
                </>
              ) : (
                "Continue"
              )}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onDiscardClick}>
              Discard
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
