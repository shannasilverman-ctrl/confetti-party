import { describe, expect, it } from "vitest";
import type { Party } from "@/lib/party-context";
import {
  canUsePartyReadCacheForError,
  loadTransientPartyReadSnapshot,
  MemoryPartyReadCache,
  parsePartyReadSnapshot,
  PARTY_READ_CACHE_MAX_BYTES,
  PARTY_READ_CACHE_MAX_PARTIES,
  PARTY_READ_CACHE_TTL_MS,
  safePartyReadSnapshot,
  type PartyReadSnapshot,
} from "@/lib/party-read-cache";

function party(id = "party-1"): Party {
  return {
    id,
    name: "Offline-ready party",
    occasion: "birthday",
    date: "2027-08-15",
    guestEstimate: 12,
    budget: 300,
    theme: "Bright",
    rsvpToken: "bearer-secret",
    tasks: [{ id: "task-1", title: "Pick up cake", bucket: "Day of", done: false }],
    guests: [{ id: "guest-1", name: "Ari", kind: "adult", rsvp: "yes" }],
    budgetCategories: [
      {
        id: "food",
        name: "Food",
        planned: 125,
        expenses: [{ id: "expense-1", label: "Cake", amount: 45 }],
      },
    ],
    timeline: [{ id: "arrival", time: "2:00 PM", activity: "Guests arrive" }],
    shoppingItems: [
      {
        id: "candles",
        name: "Candles",
        category: "Decorations",
        qty: 1,
        estPrice: 8,
        status: "needed",
      },
    ],
    pinnedInspiration: [],
    bringBoard: [
      {
        id: "ice",
        category: "Ice / Serveware",
        label: "Ice",
        qty: 2,
        status: "open",
        source: "host",
      },
    ],
    hostUpdates: [{ id: "update-1", text: "Parking is behind the house.", at: "2027-08-14" }],
    checkins: { "guest-1": "2027-08-15T18:00:00.000Z" },
  };
}

function snapshot(overrides: Partial<PartyReadSnapshot> = {}): PartyReadSnapshot {
  return {
    v: 1,
    userId: "user-a",
    syncedAt: 10_000,
    parties: [party()],
    roles: { "party-1": "owner" },
    ...overrides,
  };
}

describe("party read cache", () => {
  it("redacts bearer and claim secrets while preserving the exact user's usable data", async () => {
    const cache = new MemoryPartyReadCache(() => 11_000);
    const sensitiveParty = party() as Party & Record<string, unknown>;
    sensitiveParty.rsvp_token = "legacy-bearer-secret";
    sensitiveParty.bringBoard = [
      {
        ...sensitiveParty.bringBoard![0],
        claimSecret: "guest-claim-secret",
        claim_secret: "legacy-guest-claim-secret",
      } as NonNullable<Party["bringBoard"]>[number] & Record<string, unknown>,
    ];
    cache.put(snapshot({ parties: [sensitiveParty] }));

    const loaded = await cache.load("user-a");
    expect(loaded?.parties[0].rsvpToken).toBeUndefined();
    expect(
      (loaded?.parties[0] as (Party & Record<string, unknown>) | undefined)?.rsvp_token,
    ).toBeUndefined();
    expect(loaded?.parties[0].bringBoard?.[0]).not.toHaveProperty("claimSecret");
    expect(loaded?.parties[0].bringBoard?.[0]).not.toHaveProperty("claim_secret");
    expect(loaded?.parties[0].tasks[0].title).toBe("Pick up cake");
    expect(loaded?.roles).toEqual({ "party-1": "owner" });
    expect(await cache.load("user-b")).toBeNull();
  });

  it("never stores incomplete role maps or silently truncates an account", () => {
    expect(safePartyReadSnapshot(snapshot({ roles: {} }))).toBeNull();
    const parties = Array.from({ length: PARTY_READ_CACHE_MAX_PARTIES + 1 }, (_, index) =>
      party(`party-${index}`),
    );
    const roles = Object.fromEntries(parties.map((item) => [item.id, "owner" as const]));
    expect(safePartyReadSnapshot(snapshot({ parties, roles }))).toBeNull();
  });

  it("never persists cohost parties beyond the current verified session", () => {
    expect(
      safePartyReadSnapshot(
        snapshot({
          parties: [party("owned"), party("shared")],
          roles: { owned: "owner", shared: "cohost" },
        }),
      ),
    ).toMatchObject({
      parties: [{ id: "owned" }],
      roles: { owned: "owner" },
    });
    expect(
      parsePartyReadSnapshot(
        snapshot({
          parties: [party("shared")],
          roles: { shared: "cohost" },
        }),
        "user-a",
        11_000,
      ),
    ).toBeNull();
  });

  it("fails closed for wrong-user, stale, future, corrupt, duplicate, and oversized records", () => {
    const now = PARTY_READ_CACHE_TTL_MS + 20_000;
    expect(parsePartyReadSnapshot(snapshot(), "user-b", now)).toBeNull();
    expect(parsePartyReadSnapshot(snapshot({ syncedAt: 1 }), "user-a", now)).toBeNull();
    expect(parsePartyReadSnapshot(snapshot({ syncedAt: now + 60_001 }), "user-a", now)).toBeNull();
    expect(
      parsePartyReadSnapshot(
        snapshot({
          syncedAt: now,
          parties: [{ ...party(), tasks: [{ broken: true }] } as unknown as Party],
        }),
        "user-a",
        now,
      ),
    ).toBeNull();
    expect(
      parsePartyReadSnapshot(
        snapshot({
          syncedAt: now,
          parties: [party(), party()],
        }),
        "user-a",
        now,
      ),
    ).toBeNull();
    expect(
      parsePartyReadSnapshot(
        snapshot({
          syncedAt: now,
          parties: [{ ...party(), hostNote: "x".repeat(PARTY_READ_CACHE_MAX_BYTES) }],
        }),
        "user-a",
        now,
      ),
    ).toBeNull();
  });

  it("accepts only the three durable birthday life stages", () => {
    const now = 11_000;
    expect(
      parsePartyReadSnapshot(
        snapshot({
          parties: [
            {
              ...party(),
              planningProfile: { version: 1, honoreeLifeStage: "adult" },
            },
          ],
        }),
        "user-a",
        now,
      )?.parties[0]?.planningProfile,
    ).toMatchObject({ honoreeLifeStage: "adult" });
    expect(
      parsePartyReadSnapshot(
        snapshot({
          parties: [
            {
              ...party(),
              planningProfile: {
                version: 1,
                honoreeLifeStage: "senior",
              } as unknown as NonNullable<Party["planningProfile"]>,
            },
          ],
        }),
        "user-a",
        now,
      ),
    ).toBeNull();
  });

  it("uses cached reads only for transient connectivity failures", () => {
    expect(canUsePartyReadCacheForError({ status: 503 }, true)).toBe(true);
    expect(canUsePartyReadCacheForError({ message: "Failed to fetch" }, true)).toBe(true);
    expect(canUsePartyReadCacheForError({ status: 403, code: "42501" }, true)).toBe(false);
    expect(canUsePartyReadCacheForError({ message: "row-level security policy" }, true)).toBe(
      false,
    );
    expect(canUsePartyReadCacheForError(new Error("anything"), false)).toBe(true);
  });

  it("hydrates a cold reload only for the matching user after a transient failure", async () => {
    const cache = new MemoryPartyReadCache(() => 11_000);
    cache.put(snapshot());

    await expect(
      loadTransientPartyReadSnapshot(cache, "user-a", { message: "Failed to fetch" }, true),
    ).resolves.toMatchObject({ userId: "user-a" });
    await expect(
      loadTransientPartyReadSnapshot(cache, "user-b", { message: "Failed to fetch" }, true),
    ).resolves.toBeNull();
    await expect(
      loadTransientPartyReadSnapshot(cache, "user-a", { status: 403, code: "42501" }, true),
    ).resolves.toBeNull();
  });
});
