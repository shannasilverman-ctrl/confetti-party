import { describe, expect, it } from "vitest";
import type { Party } from "@/lib/party-context";
import { partyToColumns } from "@/lib/party-persistence";
import {
  MemoryPartyOutbox,
  PARTY_OUTBOX_MAX_ENTRIES,
  PARTY_OUTBOX_MAX_BYTES,
  PARTY_OUTBOX_TTL_MS,
  redactPendingPartyWrite,
  type PendingPartyWrite,
} from "@/lib/party-outbox";

function party(): Party {
  return {
    id: "p1",
    name: "Recovery party",
    occasion: "birthday",
    date: "2027-08-15",
    guestEstimate: 12,
    budget: 300,
    theme: "Bright",
    rsvpToken: "secret-token",
    tasks: [],
    guests: [],
    budgetCategories: [],
    timeline: [],
    shoppingItems: [],
    pinnedInspiration: [],
  };
}

function record(overrides: Partial<PendingPartyWrite> = {}): PendingPartyWrite {
  const latest = party();
  const baseline = {
    ...partyToColumns(latest, "user-a"),
    updated_at: "2027-01-01T00:00:00Z",
    rsvp_token: "secret-token",
  };
  return {
    v: 1,
    userId: "user-a",
    partyId: "p1",
    savedAt: 1_000,
    latest,
    baseline,
    insertBase: null,
    ...overrides,
  };
}

describe("party pending-write outbox", () => {
  it("omits RSVP bearer secrets from every browser-stored snapshot", () => {
    const safe = redactPendingPartyWrite(
      record({
        insertBase: {
          ...partyToColumns(party(), "user-a"),
          rsvp_token: "insert-secret",
        },
      }),
    );
    expect(safe.latest.rsvpToken).toBeUndefined();
    expect(safe.baseline?.rsvp_token).toBeUndefined();
    expect(safe.insertBase?.rsvp_token).toBeUndefined();
  });

  it("loads only the exact user's valid, unexpired records", async () => {
    const outbox = new MemoryPartyOutbox(() => 2_000);
    outbox.put(record());
    outbox.put(
      record({
        userId: "user-b",
        baseline: {
          ...partyToColumns(party(), "user-b"),
          updated_at: "2027-01-01T00:00:00Z",
        },
      }),
    );

    expect(await outbox.load("user-a")).toHaveLength(1);
    expect(await outbox.load("user-b")).toHaveLength(1);
    expect((await outbox.load("user-a"))[0].userId).toBe("user-a");
  });

  it("purges expired records instead of replaying stale edits", async () => {
    const outbox = new MemoryPartyOutbox(() => PARTY_OUTBOX_TTL_MS + 10_000);
    outbox.put(record({ savedAt: 1 }));
    expect(await outbox.load("user-a")).toEqual([]);
  });

  it("refuses a single oversized party snapshot", async () => {
    const outbox = new MemoryPartyOutbox(() => 2_000);
    outbox.put(
      record({
        latest: {
          ...party(),
          hostNote: "x".repeat(PARTY_OUTBOX_MAX_BYTES),
        },
      }),
    );
    expect(await outbox.load("user-a")).toEqual([]);
  });

  it("removes an acknowledged record idempotently", async () => {
    const outbox = new MemoryPartyOutbox(() => 2_000);
    outbox.put(record());
    outbox.remove("user-a", "p1");
    outbox.remove("user-a", "p1");
    expect(await outbox.load("user-a")).toEqual([]);
  });

  it("keeps only the newest bounded set for one account", async () => {
    const outbox = new MemoryPartyOutbox(() => 10_000);
    for (let index = 0; index < PARTY_OUTBOX_MAX_ENTRIES + 3; index++) {
      const latest = { ...party(), id: `p-${index}`, name: `Party ${index}` };
      outbox.put(
        record({
          partyId: latest.id,
          latest,
          savedAt: index + 1,
          baseline: {
            ...partyToColumns(latest, "user-a"),
            updated_at: "2027-01-01T00:00:00Z",
          },
        }),
      );
    }

    const loaded = await outbox.load("user-a");
    expect(loaded).toHaveLength(PARTY_OUTBOX_MAX_ENTRIES);
    expect(loaded.some((item) => item.partyId === "p-0")).toBe(false);
    expect(loaded.some((item) => item.partyId === `p-${PARTY_OUTBOX_MAX_ENTRIES + 2}`)).toBe(true);
  });
});
