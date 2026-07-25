// Compact save/conflict/recovery status pill, rendered in authenticated
// workspace headers only. Never rendered in demo mode (would be noise).
// Exposes Retry, Use mine / Keep theirs, and Delete local draft actions.
// All action controls are ≥44px tall for mobile.
//
// The status region is aria-live=polite; transient "Saved" settles quietly.

import { useEffect, useState } from "react";
import { useParties } from "@/lib/party-context";
import type { HostColumn } from "@/lib/party-persistence";
import { Button } from "@/components/ui/button";
import { Loader2, CloudOff, AlertTriangle, Check, Wifi } from "lucide-react";

export function SaveStatus({ partyId }: { partyId: string }) {
  const {
    isDemo,
    saveStates,
    conflicts,
    insertRejected,
    retrySave,
    resolveConflict,
    discardLocalDraft,
  } = useParties();

  // Never render in signed-out / demo mode.
  const state = saveStates[partyId] ?? "idle";
  const conflict = conflicts[partyId];
  const rejected = !!insertRejected[partyId];
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (state !== "saved") return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 1600);
    return () => clearTimeout(t);
  }, [state]);

  if (isDemo) return null;
  if (state === "idle" && !conflict && !rejected) return null;
  if (state === "saved" && !showSaved && !conflict && !rejected) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="save-status"
      data-state={state}
      className="flex flex-wrap items-center gap-2"
    >
      {state === "saving" && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Saving…
        </span>
      )}
      {state === "saved" && showSaved && !conflict && !rejected && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700">
          <Check className="h-3.5 w-3.5" aria-hidden /> Saved
        </span>
      )}
      {state === "offline" && (
        <>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-800">
            <CloudOff className="h-3.5 w-3.5" aria-hidden /> Offline — we'll retry
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            onClick={() => retrySave(partyId)}
            data-testid="save-status-retry"
          >
            <Wifi className="h-4 w-4" /> Retry now
          </Button>
        </>
      )}
      {state === "error" && !rejected && (
        <>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Couldn't save
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11"
            onClick={() => retrySave(partyId)}
            data-testid="save-status-retry"
          >
            Retry
          </Button>
        </>
      )}
      {rejected && (
        <div className="w-full rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-secondary">Not saved to the cloud</p>
              <p className="mt-1 text-xs text-muted-foreground">
                This party is kept on this device only. Retry to save, or delete the local draft.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="min-h-11"
                  onClick={() => retrySave(partyId)}
                  data-testid="save-status-retry-insert"
                >
                  Retry save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => discardLocalDraft(partyId)}
                  data-testid="save-status-discard"
                >
                  Delete local draft
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {conflict && (
        <div className="w-full rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-secondary">This party changed elsewhere</p>
              <p className="mt-1 text-xs text-muted-foreground">
                A concurrent edit touched: {conflict.columns.map(labelFor).join(", ")}. Choose which
                version to keep.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="min-h-11"
                  onClick={() => resolveConflict(partyId, "mine")}
                  data-testid="save-status-use-mine"
                >
                  Use mine
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => resolveConflict(partyId, "theirs")}
                  data-testid="save-status-keep-theirs"
                >
                  Keep theirs
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function labelFor(col: HostColumn): string {
  switch (col) {
    case "guests":
      return "guests";
    case "bring_board":
      return "bring board";
    case "host_updates":
      return "host updates";
    case "checkins":
      return "check-ins";
    case "budget_categories":
      return "budget";
    case "shopping_items":
      return "shopping";
    case "start_time":
      return "start time";
    case "theme_id":
      return "theme";
    case "guest_estimate":
      return "guest count";
    case "photo_drop":
      return "photo drop";
    case "holiday_pack_id":
      return "holiday pack";
    case "pinned_inspiration":
      return "pinned ideas";
    default:
      return col.replace(/_/g, " ");
  }
}
