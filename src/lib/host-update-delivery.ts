import type { SaveState } from "@/lib/party-persistence";

export type PendingHostUpdate = {
  id: string;
  baselineUpdatedAt?: string;
};

export type HostUpdateDelivery = {
  state: "saving" | "offline" | "error" | "conflict" | "visible" | "not-visible";
  message: string;
  visibleCount: number;
  waitingCount: number;
};

export function hostUpdateDelivery({
  submitted,
  pending,
  hostUpdateIds,
  updatedAt,
  saveState,
  fromCache = false,
}: {
  submitted: readonly PendingHostUpdate[];
  pending: readonly PendingHostUpdate[];
  hostUpdateIds: readonly string[];
  updatedAt?: string;
  saveState: SaveState;
  fromCache?: boolean;
}): HostUpdateDelivery | null {
  if (submitted.length === 0 && pending.length === 0) return null;

  const currentIds = new Set(hostUpdateIds);
  const pendingById = new Map(pending.map((entry) => [entry.id, entry]));
  const trackedById = new Map<string, PendingHostUpdate>();
  for (const entry of [...submitted, ...pending]) {
    const existing = trackedById.get(entry.id);
    trackedById.set(entry.id, {
      id: entry.id,
      baselineUpdatedAt: entry.baselineUpdatedAt ?? existing?.baselineUpdatedAt,
    });
  }
  const tracked = [...trackedById.values()];
  const serverChanged = (entry: PendingHostUpdate) =>
    !!updatedAt && updatedAt !== entry.baselineUpdatedAt;
  const visibleCount = submitted.filter(
    (entry) => !pendingById.has(entry.id) && serverChanged(entry) && currentIds.has(entry.id),
  ).length;
  const missingCount =
    saveState === "saved"
      ? submitted.filter(
          (entry) =>
            !pendingById.has(entry.id) && serverChanged(entry) && !currentIds.has(entry.id),
        ).length
      : 0;
  const waitingCount = tracked.length - visibleCount - missingCount;
  const prefix = visibleCount > 0 ? `${visibleCount} visible. ` : "";
  const waitingLabel = waitingCount === 1 ? "1 update" : `${waitingCount} updates`;

  if (waitingCount === 0 && missingCount === 0) {
    return {
      state: "visible",
      message:
        visibleCount === 1
          ? "Visible on the guest page."
          : `${visibleCount} updates visible on the guest page.`,
      visibleCount,
      waitingCount,
    };
  }

  if (saveState === "saved" && missingCount > 0) {
    return {
      state: "not-visible",
      message: `${prefix}${missingCount === 1 ? "1 update is" : `${missingCount} updates are`} not visible to guests—the server kept another version.`,
      visibleCount,
      waitingCount,
    };
  }

  if (saveState === "error") {
    return {
      state: "error",
      message: `${prefix}${waitingLabel} not visible to guests yet. Retry the save below.`,
      visibleCount,
      waitingCount,
    };
  }

  if (saveState === "conflict") {
    return {
      state: "conflict",
      message: `${prefix}${waitingLabel} not visible to guests yet. Resolve the host-update conflict below.`,
      visibleCount,
      waitingCount,
    };
  }

  if (saveState === "offline" || fromCache) {
    return {
      state: "offline",
      message: `${prefix}${waitingLabel} saved on this device—not visible to guests yet.`,
      visibleCount,
      waitingCount,
    };
  }

  return {
    state: "saving",
    message:
      visibleCount > 0
        ? `${visibleCount} visible. Saving ${waitingLabel} to the guest page…`
        : waitingCount === 1
          ? "Saving to the guest page…"
          : `Saving ${waitingCount} updates to the guest page…`,
    visibleCount,
    waitingCount,
  };
}
