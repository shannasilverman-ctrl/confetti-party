import { describe, expect, it } from "vitest";
import { claimDemoPartiesToAccount, prepareDemoPartyForClaim } from "@/lib/demo-claim";
import type { Party } from "@/lib/party-context";
import {
  partyToColumns,
  type PartyClient,
  type PartyRow,
  type SaveError,
} from "@/lib/party-persistence";

const PARTY_ONE = "123e4567-e89b-42d3-a456-426614174001";
const PARTY_TWO = "123e4567-e89b-42d3-a456-426614174002";

function party(id = PARTY_ONE, over: Partial<Party> = {}): Party {
  return {
    id,
    name: "Backyard birthday",
    occasion: "birthday",
    date: "2030-08-10",
    guestEstimate: 18,
    budget: 600,
    theme: "Petals & Pastels",
    rsvpToken: "browser-must-not-authorize",
    updatedAt: "2026-01-01T00:00:00Z",
    heroImageUrl: "/brand/sample-only.jpg",
    tasks: [],
    guests: [],
    budgetCategories: [],
    timeline: [],
    shoppingItems: [],
    pinnedInspiration: [],
    ...over,
  };
}

class ClaimDb {
  rows = new Map<string, PartyRow>();
  inserts: string[] = [];
  failures = new Map<string, SaveError>();

  client(): PartyClient {
    return {
      fetch: async (id) => ({ data: this.rows.get(id) ?? null, error: null }),
      insert: async (row) => {
        this.inserts.push(row.id);
        const error = this.failures.get(row.id);
        if (error) return { data: null, error };
        const stored = {
          ...row,
          rsvp_token: `server-${row.id}`,
          updated_at: "2030-01-01T00:00:00Z",
        };
        this.rows.set(row.id, stored);
        return { data: stored, error: null };
      },
      updateWithConcurrency: async () => ({
        data: null,
        error: null,
        conflict: false,
      }),
    };
  }
}

describe("demo account claim", () => {
  it("strips browser authority and server metadata before insertion", () => {
    const prepared = prepareDemoPartyForClaim(party());
    expect(prepared).not.toHaveProperty("rsvpToken");
    expect(prepared).not.toHaveProperty("updatedAt");
    expect(prepared).not.toHaveProperty("heroImageUrl");

    const row = partyToColumns(prepared, "account-a");
    expect(row).not.toHaveProperty("rsvp_token");
    expect(row.user_id).toBe("account-a");
  });

  it("preserves ids/content while the server mints a fresh RSVP token", async () => {
    const db = new ClaimDb();
    const result = await claimDemoPartiesToAccount({
      parties: [party()],
      userId: "account-a",
      client: db.client(),
    });

    expect(result.failure).toBeNull();
    expect(result.claimed).toHaveLength(1);
    expect(result.claimed[0]).toMatchObject({
      id: PARTY_ONE,
      user_id: "account-a",
      name: "Backyard birthday",
      guest_estimate: 18,
      budget: 600,
      rsvp_token: `server-${PARTY_ONE}`,
    });
  });

  it("is idempotent when the owned row already exists", async () => {
    const db = new ClaimDb();
    db.rows.set(PARTY_ONE, {
      ...partyToColumns(prepareDemoPartyForClaim(party()), "account-a"),
      rsvp_token: "server-existing",
    });

    const result = await claimDemoPartiesToAccount({
      parties: [party()],
      userId: "account-a",
      client: db.client(),
    });

    expect(result.failure).toBeNull();
    expect(result.claimed[0]?.rsvp_token).toBe("server-existing");
    expect(db.inserts).toEqual([]);
  });

  it("fails closed when a same-id row belongs to another account", async () => {
    const db = new ClaimDb();
    db.rows.set(PARTY_ONE, partyToColumns(prepareDemoPartyForClaim(party()), "account-b"));

    const result = await claimDemoPartiesToAccount({
      parties: [party()],
      userId: "account-a",
      client: db.client(),
    });

    expect(result.claimed).toEqual([]);
    expect(result.failure).toEqual({ partyId: PARTY_ONE, kind: "collision" });
    expect(db.inserts).toEqual([]);
  });

  it("returns acknowledged rows before a partial failure so only safe copies can clear", async () => {
    const db = new ClaimDb();
    db.failures.set(PARTY_TWO, { kind: "network", message: "offline" });

    const result = await claimDemoPartiesToAccount({
      parties: [party(PARTY_ONE), party(PARTY_TWO, { name: "Second party" })],
      userId: "account-a",
      client: db.client(),
    });

    expect(result.claimed.map((row) => row.id)).toEqual([PARTY_ONE]);
    expect(result.failure).toEqual({ partyId: PARTY_TWO, kind: "network" });
    expect(db.rows.has(PARTY_ONE)).toBe(true);
    expect(db.rows.has(PARTY_TWO)).toBe(false);
  });

  it("rejects non-UUID browser ids instead of creating unstable mappings", async () => {
    const db = new ClaimDb();
    const result = await claimDemoPartiesToAccount({
      parties: [party("legacy-short-id")],
      userId: "account-a",
      client: db.client(),
    });

    expect(result.claimed).toEqual([]);
    expect(result.failure).toEqual({ partyId: "legacy-short-id", kind: "invalid" });
    expect(db.inserts).toEqual([]);
  });
});
