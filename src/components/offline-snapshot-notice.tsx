import { WifiOff } from "lucide-react";
import { useParties } from "@/lib/party-context";
import { cn } from "@/lib/utils";

export function OfflineSnapshotNotice({ className }: { className?: string }) {
  const { readState } = useParties();
  if (readState.source !== "cache" || readState.lastSyncedAt === null) return null;

  const lastSynced = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(readState.lastSyncedAt));

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-2xl border border-amber-600/25 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-950",
        className,
      )}
      role="status"
      data-testid="offline-snapshot-notice"
    >
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        <strong>Offline copy · Last synced {lastSynced}.</strong> Your changes stay on this device
        and retry when you reconnect. Invites and collaborator updates may be newer.
      </span>
    </div>
  );
}
