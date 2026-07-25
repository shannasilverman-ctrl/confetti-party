// Aggregate save-status banner for /app. Shows a compact roll-up of any
// parties in a non-idle persistence state. Never renders in demo mode.

import { Link } from "@tanstack/react-router";
import { useParties } from "@/lib/party-context";
import { AlertTriangle, CloudOff, Loader2 } from "lucide-react";

export function AppSaveStatus() {
  const { isDemo, parties, saveStates, conflicts, insertRejected } = useParties();
  if (isDemo) return null;
  const attention = parties.filter((p) => {
    const s = saveStates[p.id];
    return s === "error" || s === "offline" || conflicts[p.id] || insertRejected[p.id];
  });
  const saving = parties.filter((p) => saveStates[p.id] === "saving");
  if (attention.length === 0 && saving.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="app-save-status"
      className="border-b border-border bg-muted/40"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2 text-xs text-muted-foreground sm:px-6">
        {saving.length > 0 && attention.length === 0 && (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Saving your changes…
          </span>
        )}
        {attention.map((p) => {
          const isConflict = !!conflicts[p.id];
          const isRejected = !!insertRejected[p.id];
          const isOffline = saveStates[p.id] === "offline";
          const Icon = isOffline ? CloudOff : AlertTriangle;
          const label = isConflict
            ? "needs your choice"
            : isRejected
              ? "not saved to the cloud"
              : isOffline
                ? "offline — will retry"
                : "couldn't save";
          return (
            <Link
              key={p.id}
              to="/party/$id"
              params={{ id: p.id }}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-card px-3 py-1.5 font-medium text-secondary hover:bg-card/80"
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              <span className="max-w-[16ch] truncate">{p.name}</span>
              <span className="text-muted-foreground">· {label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
