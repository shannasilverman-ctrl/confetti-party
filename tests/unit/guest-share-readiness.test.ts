import { describe, expect, it } from "vitest";
import { guestShareReadiness } from "@/lib/guest-share-readiness";

const READY_INPUT = {
  isDemo: false,
  hasRsvpToken: true,
  dateIsOpen: false,
  cloudVerified: true,
  saveState: "idle" as const,
  hasConflict: false,
  insertRejected: false,
};

describe("guest share readiness", () => {
  it.each(["idle", "saved"] as const)(
    "allows an acknowledged server party in %s state",
    (saveState) => {
      expect(guestShareReadiness({ ...READY_INPUT, saveState })).toMatchObject({
        kind: "ready",
        canShare: true,
        canPreview: false,
      });
    },
  );

  it.each(["saving", "offline", "error", "conflict"] as const)(
    "blocks guest artifacts while persistence is %s",
    (saveState) => {
      expect(guestShareReadiness({ ...READY_INPUT, saveState })).toMatchObject({
        kind: saveState,
        canShare: false,
        canPreview: false,
      });
    },
  );

  it("blocks a cached or otherwise unverified read even when the save state is idle", () => {
    expect(
      guestShareReadiness({ ...READY_INPUT, cloudVerified: false, saveState: "idle" }),
    ).toMatchObject({
      kind: "unverified",
      canShare: false,
    });
    expect(
      guestShareReadiness({ ...READY_INPUT, cloudVerified: false, saveState: "idle" }),
    ).toMatchObject({
      kind: "unverified",
      canShare: false,
    });
  });

  it("blocks explicit conflicts and rejected or tokenless local drafts", () => {
    expect(guestShareReadiness({ ...READY_INPUT, hasConflict: true })).toMatchObject({
      kind: "conflict",
      canShare: false,
    });
    expect(guestShareReadiness({ ...READY_INPUT, insertRejected: true })).toMatchObject({
      kind: "local-draft",
      canShare: false,
    });
    expect(guestShareReadiness({ ...READY_INPUT, hasRsvpToken: false })).toMatchObject({
      kind: "local-draft",
      canShare: false,
    });
  });

  it("keeps date-TBD blocked and demo behavior explicitly preview-only", () => {
    expect(guestShareReadiness({ ...READY_INPUT, dateIsOpen: true })).toMatchObject({
      kind: "needs-date",
      canShare: false,
      canPreview: false,
    });
    expect(guestShareReadiness({ ...READY_INPUT, isDemo: true })).toMatchObject({
      kind: "preview",
      canShare: false,
      canPreview: true,
    });
  });
});
