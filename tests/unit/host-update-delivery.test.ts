import { describe, expect, it } from "vitest";
import { hostUpdateDelivery, type PendingHostUpdate } from "@/lib/host-update-delivery";

const first: PendingHostUpdate = { id: "update-1", baselineUpdatedAt: "2027-01-01T12:00:00Z" };
const second: PendingHostUpdate = { id: "update-2", baselineUpdatedAt: "2027-01-01T12:00:00Z" };
const acknowledgedAt = "2027-01-01T12:00:01Z";

describe("host update delivery truth", () => {
  it("does not claim an optimistic update is visible while idle or saving", () => {
    for (const saveState of ["idle", "saving"] as const) {
      expect(
        hostUpdateDelivery({
          submitted: [first],
          pending: [first],
          hostUpdateIds: [first.id],
          updatedAt: first.baselineUpdatedAt,
          saveState,
        }),
      ).toMatchObject({
        state: "saving",
        message: "Saving to the guest page…",
        visibleCount: 0,
      });
    }
  });

  it("calls cached and offline updates device-only until acknowledged", () => {
    expect(
      hostUpdateDelivery({
        submitted: [],
        pending: [first],
        hostUpdateIds: [first.id],
        updatedAt: first.baselineUpdatedAt,
        saveState: "saving",
        fromCache: true,
      }),
    ).toMatchObject({
      state: "offline",
      message: "1 update saved on this device—not visible to guests yet.",
    });
    expect(
      hostUpdateDelivery({
        submitted: [],
        pending: [first],
        hostUpdateIds: [first.id],
        updatedAt: first.baselineUpdatedAt,
        saveState: "offline",
      }),
    ).toMatchObject({ state: "offline" });
  });

  it.each([
    ["error", "Retry the save below."],
    ["conflict", "Resolve the host-update conflict below."],
  ] as const)("never claims delivery for %s and points to recovery", (saveState, copy) => {
    const result = hostUpdateDelivery({
      submitted: [],
      pending: [first],
      hostUpdateIds: [first.id],
      updatedAt: first.baselineUpdatedAt,
      saveState,
      fromCache: true,
    });
    expect(result?.state).toBe(saveState);
    expect(result?.message).toContain("not visible to guests yet");
    expect(result?.message).toContain(copy);
  });

  it("requires both a changed server timestamp and the submitted id", () => {
    expect(
      hostUpdateDelivery({
        submitted: [first],
        pending: [],
        hostUpdateIds: [first.id],
        updatedAt: acknowledgedAt,
        saveState: "saved",
      }),
    ).toMatchObject({
      state: "visible",
      message: "Visible on the guest page.",
      visibleCount: 1,
    });

    expect(
      hostUpdateDelivery({
        submitted: [first],
        pending: [],
        hostUpdateIds: [],
        updatedAt: acknowledgedAt,
        saveState: "saved",
      }),
    ).toMatchObject({
      state: "not-visible",
      visibleCount: 0,
    });
  });

  it("keeps an acknowledged update visible during later unrelated saves", () => {
    for (const saveState of ["saving", "offline", "error", "conflict"] as const) {
      expect(
        hostUpdateDelivery({
          submitted: [first],
          pending: [],
          hostUpdateIds: [first.id],
          updatedAt: acknowledgedAt,
          saveState,
          fromCache: true,
        }),
      ).toMatchObject({
        state: "visible",
        message: "Visible on the guest page.",
        visibleCount: 1,
        waitingCount: 0,
      });
    }
  });

  it("accounts for rapid updates independently through reconnect", () => {
    expect(
      hostUpdateDelivery({
        submitted: [first, second],
        pending: [second],
        hostUpdateIds: [first.id],
        updatedAt: acknowledgedAt,
        saveState: "saving",
      }),
    ).toMatchObject({
      state: "saving",
      message: "1 visible. Saving 1 update to the guest page…",
      visibleCount: 1,
      waitingCount: 1,
    });

    expect(
      hostUpdateDelivery({
        submitted: [first, second],
        pending: [],
        hostUpdateIds: [first.id, second.id],
        updatedAt: acknowledgedAt,
        saveState: "saved",
      }),
    ).toMatchObject({
      state: "visible",
      message: "2 updates visible on the guest page.",
      visibleCount: 2,
    });
  });
});
