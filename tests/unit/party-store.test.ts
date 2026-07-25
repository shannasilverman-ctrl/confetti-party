// Deterministic integration tests for PartyStore data-integrity guarantees.
// Uses a fake PartyClient — no Supabase credentials required.

import { describe, it, expect, vi } from "vitest";
import type { Party } from "@/lib/party-context";
import {
  type PartyClient,
  type PartyRow,
  type SaveError,
  partyToColumns,
  rowToParty,
  diffColumns,
  mergeGuests,
  mergeBringBoard,
  mergeCheckins,
} from "@/lib/party-persistence";
import { PartyStore, type StoreEvent } from "@/lib/party-store";

function mkParty(over: Partial<Party> = {}): Party {
  return {
    id: "p1",
    name: "Test",
    occasion: "birthday",
    date: "2027-01-01",
    guestEstimate: 10,
    budget: 100,
    theme: "T",
    tasks: [],
    guests: [
      { id: "g1", name: "Alice", kind: "adult", rsvp: "invited" },
      { id: "g2", name: "Bob", kind: "adult", rsvp: "invited" },
    ],
    budgetCategories: [],
    timeline: [{ id: "t1", time: "1:00 PM", activity: "Kickoff" }],
    shoppingItems: [],
    pinnedInspiration: [],
    bringBoard: [
      { id: "b1", category: "Sides", label: "Chips", qty: 1, status: "open", source: "host" },
    ],
    checkins: {},
    hostUpdates: [],
    updatedAt: "2027-01-01T00:00:00Z",
    ...over,
  };
}

class FakeDb {
  rows = new Map<string, PartyRow>();
  clock = 0;
  errors: Array<SaveError | null> = [];
  seed(row: PartyRow) {
    this.rows.set(row.id, { ...row, updated_at: row.updated_at ?? this.tick() });
  }
  tick() {
    this.clock += 1;
    return `2027-01-01T00:00:${String(this.clock).padStart(2, "0")}Z`;
  }
  /** Simulate a guest RPC touching a single column with updated_at bump. */
  patchServer(id: string, patch: Partial<PartyRow>) {
    const cur = this.rows.get(id)!;
    this.rows.set(id, { ...cur, ...patch, updated_at: this.tick() });
  }
  client(): PartyClient {
    return {
      insert: async (row) => {
        const err = this.errors.shift();
        if (err) return { data: null, error: err };
        const stored = { ...row, updated_at: this.tick(), created_at: this.tick() };
        this.rows.set(row.id, stored);
        return { data: stored, error: null };
      },
      updateWithConcurrency: async (id, patch, expected) => {
        const err = this.errors.shift();
        if (err) return { data: null, error: err, conflict: false };
        const cur = this.rows.get(id);
        if (!cur) return { data: null, error: null, conflict: true };
        if ((cur.updated_at ?? "") !== expected) {
          return { data: null, error: null, conflict: true };
        }
        const next = { ...cur, ...patch, updated_at: this.tick() };
        this.rows.set(id, next);
        return { data: next, error: null, conflict: false };
      },
      fetch: async (id) => ({ data: this.rows.get(id) ?? null, error: null }),
    };
  }
}

function mkStore(fake: FakeDb, tombstones = new Set<string>()) {
  const events: StoreEvent[] = [];
  const store = new PartyStore({
    client: fake.client(),
    isTombstoned: (id) => tombstones.has(id),
    sleep: () => Promise.resolve(),
    isOnline: () => true,
    onEvent: (e) => events.push(e),
  });
  return { store, events, tombstones };
}

async function flush() {
  // Drain microtasks a few times so queued kicks resolve.
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

describe("diffColumns", () => {
  it("returns only changed columns", () => {
    const base = partyToColumns(mkParty(), "u");
    const next = partyToColumns(mkParty({ name: "New" }), "u");
    const { patch, changed } = diffColumns(base, next);
    expect(changed).toEqual(["name"]);
    expect(patch).toEqual({ name: "New" });
  });

  it("returns empty when identical", () => {
    const base = partyToColumns(mkParty(), "u");
    const next = partyToColumns(mkParty(), "u");
    expect(diffColumns(base, next).changed).toEqual([]);
  });
});

describe("mergeGuests", () => {
  it("keeps guest RSVP change and host edit on other guest", () => {
    const baseline = [
      { id: "g1", name: "Alice", kind: "adult" as const, rsvp: "invited" as const },
      { id: "g2", name: "Bob", kind: "adult" as const, rsvp: "invited" as const },
    ];
    const local = [
      { id: "g1", name: "Alice", kind: "adult" as const, rsvp: "invited" as const },
      { id: "g2", name: "Robert", kind: "adult" as const, rsvp: "invited" as const },
    ];
    const server = [
      { id: "g1", name: "Alice", kind: "adult" as const, rsvp: "yes" as const },
      { id: "g2", name: "Bob", kind: "adult" as const, rsvp: "invited" as const },
    ];
    const merged = mergeGuests(baseline, local, server).items;
    expect(merged.find((g) => g.id === "g1")?.rsvp).toBe("yes");
    expect(merged.find((g) => g.id === "g2")?.name).toBe("Robert");
  });
});

describe("mergeBringBoard", () => {
  it("keeps guest claim while host edits an unrelated field", () => {
    const baseline = [
      {
        id: "b1",
        category: "Sides" as const,
        label: "Chips",
        qty: 1,
        status: "open" as const,
        source: "host" as const,
      },
      {
        id: "b2",
        category: "Drinks" as const,
        label: "Soda",
        qty: 6,
        status: "open" as const,
        source: "host" as const,
      },
    ];
    // Local: host bumped qty on b2. Server: guest claimed b1.
    const local = [baseline[0], { ...baseline[1], qty: 12 }];
    const server = [
      {
        ...baseline[0],
        status: "claimed" as const,
        assigneeName: "Sam",
        claimedAt: "2027-01-01T01:00:00Z",
      },
      baseline[1],
    ];
    const merged = mergeBringBoard(baseline, local, server).items;
    expect(merged.find((i) => i.id === "b1")?.status).toBe("claimed");
    expect(merged.find((i) => i.id === "b1")?.assigneeName).toBe("Sam");
    expect(merged.find((i) => i.id === "b2")?.qty).toBe(12);
  });
});

describe("mergeCheckins", () => {
  it("unions keys and prefers max timestamp", () => {
    const merged = mergeCheckins(
      {},
      { g1: "2027-01-01T01:00:00Z" },
      { g2: "2027-01-01T00:30:00Z" },
    );
    expect(merged).toEqual({
      g1: "2027-01-01T01:00:00Z",
      g2: "2027-01-01T00:30:00Z",
    });
  });
});

describe("PartyStore — data integrity", () => {
  it("(a) guest RSVP change survives host timeline edit", async () => {
    const fake = new FakeDb();
    const seeded = partyToColumns(mkParty(), "u");
    fake.seed(seeded);
    const { store, events } = mkStore(fake);
    const party = rowToParty(fake.rows.get("p1")!);
    store.seedBaseline(party, "u");

    // Guest RPC path: server-side RSVP change bumps updated_at.
    const flippedGuests = [{ ...party.guests[0], rsvp: "yes" as const }, party.guests[1]];
    fake.patchServer("p1", { guests: flippedGuests as unknown as PartyRow["guests"] });

    // Host edits timeline concurrently.
    const edited: Party = {
      ...party,
      timeline: [...party.timeline, { id: "t2", time: "2:00 PM", activity: "Cake" }],
    };
    store.enqueueUpdate(edited, "u");
    await flush();

    const finalRow = fake.rows.get("p1")!;
    const finalGuests = finalRow.guests as typeof party.guests;
    expect(finalGuests.find((g) => g.id === "g1")?.rsvp).toBe("yes");
    expect((finalRow.timeline as { id: string }[]).length).toBe(2);
    // The store surfaced a merged party via server-row.
    expect(events.some((e) => e.type === "server-row")).toBe(true);
  });

  it("(b) guest claim survives host task edit", async () => {
    const fake = new FakeDb();
    fake.seed(partyToColumns(mkParty(), "u"));
    const { store } = mkStore(fake);
    const party = rowToParty(fake.rows.get("p1")!);
    store.seedBaseline(party, "u");

    // Guest claims b1 on server.
    fake.patchServer("p1", {
      bring_board: [
        {
          ...(party.bringBoard ?? [])[0],
          status: "claimed",
          assigneeName: "Sam",
          claimedAt: "2027-01-01T01:00:00Z",
        },
      ] as unknown as PartyRow["bring_board"],
    });

    // Host adds a task.
    store.enqueueUpdate(
      { ...party, tasks: [{ id: "task1", title: "Prep", bucket: "Day of", done: false }] },
      "u",
    );
    await flush();

    const finalRow = fake.rows.get("p1")!;
    const board = finalRow.bring_board as { id: string; status: string; assigneeName?: string }[];
    expect(board[0].status).toBe("claimed");
    expect(board[0].assigneeName).toBe("Sam");
    expect((finalRow.tasks as unknown[]).length).toBe(1);
  });

  it("(c) two host tabs editing different columns both survive", async () => {
    const fake = new FakeDb();
    fake.seed(partyToColumns(mkParty(), "u"));
    const { store: storeA } = mkStore(fake);
    const { store: storeB } = mkStore(fake);
    const party = rowToParty(fake.rows.get("p1")!);
    storeA.seedBaseline(party, "u");
    storeB.seedBaseline(party, "u");

    storeA.enqueueUpdate({ ...party, name: "From A" }, "u");
    await flush();
    // Tab B still has stale baseline; edits budget.
    storeB.enqueueUpdate({ ...party, budget: 999 }, "u");
    await flush();

    const finalRow = fake.rows.get("p1")!;
    expect(finalRow.name).toBe("From A");
    expect(finalRow.budget).toBe(999);
  });

  it("(d) same-column collision preserves fresh server data and exposes retry", async () => {
    const fake = new FakeDb();
    fake.seed(partyToColumns(mkParty(), "u"));
    const { store, events } = mkStore(fake);
    const party = rowToParty(fake.rows.get("p1")!);
    store.seedBaseline(party, "u");

    // Server side: name changed elsewhere.
    fake.patchServer("p1", { name: "Server Name" });

    // Local host tab also tries to change name.
    store.enqueueUpdate({ ...party, name: "Local Name" }, "u");
    await flush();

    const finalRow = fake.rows.get("p1")!;
    // Server data preserved on the row (not overwritten silently).
    expect(finalRow.name).toBe("Server Name");
    // Store surfaced a conflict state with the local value retained for retry.
    const conflictEvent = events.find((e) => e.type === "state" && e.state === "conflict");
    expect(conflictEvent).toBeDefined();
    const st = store.getState("p1");
    expect(st.state).toBe("conflict");
    expect(st.conflict?.columns).toContain("name");
    expect(st.conflict?.localValues.name).toBe("Local Name");
    expect(st.conflict?.serverValues.name).toBe("Server Name");
  });

  it("(e) save fail → retry success", async () => {
    const fake = new FakeDb();
    fake.seed(partyToColumns(mkParty(), "u"));
    fake.errors.push({ message: "boom", kind: "network" });
    const { store, events } = mkStore(fake);
    const party = rowToParty(fake.rows.get("p1")!);
    store.seedBaseline(party, "u");
    store.enqueueUpdate({ ...party, name: "Retry Me" }, "u");
    await flush();
    // First attempt failed; retry succeeds on next kick.
    await flush();
    expect(fake.rows.get("p1")!.name).toBe("Retry Me");
    expect(events.some((e) => e.type === "state" && e.state === "saved")).toBe(true);
  });

  it("(e) offline → online recovery flushes queued edits", async () => {
    const fake = new FakeDb();
    fake.seed(partyToColumns(mkParty(), "u"));
    let online = false;
    const events: StoreEvent[] = [];
    const store = new PartyStore({
      client: fake.client(),
      isTombstoned: () => false,
      sleep: () => Promise.resolve(),
      isOnline: () => online,
      onEvent: (e) => events.push(e),
    });
    const party = rowToParty(fake.rows.get("p1")!);
    store.seedBaseline(party, "u");
    fake.errors.push({ message: "net", kind: "network" });
    store.enqueueUpdate({ ...party, name: "Queued" }, "u");
    await flush();
    // Went offline.
    expect(events.some((e) => e.type === "state" && e.state === "offline")).toBe(true);
    online = true;
    store.flushAll();
    await flush();
    expect(fake.rows.get("p1")!.name).toBe("Queued");
  });

  it("(e) delete during save never resurrects", async () => {
    const fake = new FakeDb();
    fake.seed(partyToColumns(mkParty(), "u"));
    const { store, tombstones } = mkStore(fake);
    const party = rowToParty(fake.rows.get("p1")!);
    store.seedBaseline(party, "u");
    tombstones.add("p1");
    store.enqueueUpdate({ ...party, name: "Ghost" }, "u");
    await flush();
    // Tombstone was checked before running: row is untouched.
    expect(fake.rows.get("p1")!.name).toBe("Test");
  });

  it("only sends changed columns on update", async () => {
    const fake = new FakeDb();
    fake.seed(partyToColumns(mkParty(), "u"));
    const spy = vi.fn<PartyClient["updateWithConcurrency"]>(async (id, patch, expected) => {
      const cur = fake.rows.get(id);
      if (!cur || (cur.updated_at ?? "") !== expected)
        return { data: null, error: null, conflict: true };
      const next = { ...cur, ...patch, updated_at: fake.tick() };
      fake.rows.set(id, next);
      return { data: next, error: null, conflict: false };
    });
    const client: PartyClient = {
      insert: fake.client().insert,
      updateWithConcurrency: spy,
      fetch: fake.client().fetch,
    };
    const store = new PartyStore({
      client,
      isTombstoned: () => false,
      sleep: () => Promise.resolve(),
      isOnline: () => true,
      onEvent: () => {},
    });
    const party = rowToParty(fake.rows.get("p1")!);
    store.seedBaseline(party, "u");
    store.enqueueUpdate({ ...party, budget: 500 }, "u");
    await flush();
    expect(spy).toHaveBeenCalledTimes(1);
    const [, patch] = spy.mock.calls[0];
    expect(Object.keys(patch)).toEqual(["budget"]);
  });
});

describe("PartyStore — conflict resolution", () => {
  it("resolveConflict('mine') overlays local values onto fresh baseline and saves", async () => {
    const fake = new FakeDb();
    fake.seed(partyToColumns(mkParty(), "u"));
    const { store, events } = mkStore(fake);
    const party = rowToParty(fake.rows.get("p1")!);
    store.seedBaseline(party, "u");
    fake.patchServer("p1", { name: "Server Name" });
    store.enqueueUpdate({ ...party, name: "Local Name" }, "u");
    await flush();
    expect(store.getState("p1").state).toBe("conflict");
    // Row currently reflects server, not local.
    expect(fake.rows.get("p1")!.name).toBe("Server Name");

    store.resolveConflict("p1", "mine");
    await flush();
    // Local value now persisted.
    expect(fake.rows.get("p1")!.name).toBe("Local Name");
    expect(store.getState("p1").state).toBe("saved");
    expect(store.getState("p1").conflict).toBeNull();
    // A server-row event was emitted with the local value merged in.
    const lastServerRow = events
      .filter((e) => e.type === "server-row")
      .at(-1) as Extract<StoreEvent, { type: "server-row" }> | undefined;
    expect(lastServerRow?.party.name).toBe("Local Name");
  });

  it("resolveConflict('theirs') discards local values and settles", async () => {
    const fake = new FakeDb();
    fake.seed(partyToColumns(mkParty(), "u"));
    const { store } = mkStore(fake);
    const party = rowToParty(fake.rows.get("p1")!);
    store.seedBaseline(party, "u");
    fake.patchServer("p1", { name: "Server Name" });
    store.enqueueUpdate({ ...party, name: "Local Name" }, "u");
    await flush();
    expect(store.getState("p1").state).toBe("conflict");
    store.resolveConflict("p1", "theirs");
    // Server row stays canonical; no additional write.
    expect(fake.rows.get("p1")!.name).toBe("Server Name");
    expect(store.getState("p1").state).toBe("saved");
    expect(store.getState("p1").conflict).toBeNull();
  });

  it("generic retry() does NOT resolve a semantic conflict", async () => {
    const fake = new FakeDb();
    fake.seed(partyToColumns(mkParty(), "u"));
    const { store } = mkStore(fake);
    const party = rowToParty(fake.rows.get("p1")!);
    store.seedBaseline(party, "u");
    fake.patchServer("p1", { name: "Server Name" });
    store.enqueueUpdate({ ...party, name: "Local Name" }, "u");
    await flush();
    expect(store.getState("p1").state).toBe("conflict");
    store.retry("p1");
    await flush();
    expect(store.getState("p1").state).toBe("conflict");
    expect(fake.rows.get("p1")!.name).toBe("Server Name");
  });

  it("remove guest vs server RSVP change surfaces as semantic conflict", async () => {
    const fake = new FakeDb();
    fake.seed(partyToColumns(mkParty(), "u"));
    const { store } = mkStore(fake);
    const party = rowToParty(fake.rows.get("p1")!);
    store.seedBaseline(party, "u");
    // Server: guest g1 flips RSVP to yes.
    fake.patchServer("p1", {
      guests: [
        { ...party.guests[0], rsvp: "yes" },
        party.guests[1],
      ] as unknown as PartyRow["guests"],
    });
    // Host: removes g1 locally.
    store.enqueueUpdate({ ...party, guests: [party.guests[1]] }, "u");
    await flush();
    // Server claim survives; host removal is held as a conflict.
    const row = fake.rows.get("p1")!;
    const finalGuests = row.guests as typeof party.guests;
    expect(finalGuests.find((g) => g.id === "g1")?.rsvp).toBe("yes");
    expect(store.getState("p1").state).toBe("conflict");
    expect(store.getState("p1").conflict?.columns).toContain("guests");
  });

  it("remove bring item vs server claim surfaces as semantic conflict", async () => {
    const fake = new FakeDb();
    fake.seed(partyToColumns(mkParty(), "u"));
    const { store } = mkStore(fake);
    const party = rowToParty(fake.rows.get("p1")!);
    store.seedBaseline(party, "u");
    // Server: guest claims b1.
    fake.patchServer("p1", {
      bring_board: [
        {
          ...(party.bringBoard ?? [])[0],
          status: "claimed",
          assigneeName: "Sam",
          claimedAt: "2027-01-01T01:00:00Z",
        },
      ] as unknown as PartyRow["bring_board"],
    });
    // Host removes the item locally.
    store.enqueueUpdate({ ...party, bringBoard: [] }, "u");
    await flush();
    const row = fake.rows.get("p1")!;
    const board = row.bring_board as { id: string; status: string; assigneeName?: string }[];
    // Claim survives — host removal did not erase it.
    expect(board.length).toBe(1);
    expect(board[0].status).toBe("claimed");
    expect(store.getState("p1").state).toBe("conflict");
    expect(store.getState("p1").conflict?.columns).toContain("bring_board");
  });

  it("insert permission failure marks the row insertRejected for recovery", async () => {
    const fake = new FakeDb();
    fake.errors.push({ message: "row-level security violated", kind: "permission" });
    const { store, events } = mkStore(fake);
    const party = mkParty({ id: "p-new" });
    store.enqueueInsert(party, "u");
    await flush();
    const s = store.getState("p-new");
    expect(s.state).toBe("error");
    expect(s.insertRejected).toBe(true);
    // Toast copy is generic — no raw provider error interpolation.
    const toastEvt = events.find((e) => e.type === "toast") as
      | Extract<StoreEvent, { type: "toast" }>
      | undefined;
    expect(toastEvt?.message).not.toMatch(/row-level security/i);
  });

  it("error toast copy is generic and does not leak provider messages", async () => {
    const fake = new FakeDb();
    fake.seed(partyToColumns(mkParty(), "u"));
    // Push enough errors to exhaust retries.
    for (let i = 0; i < 5; i++)
      fake.errors.push({ message: "duplicate key value violates unique constraint xyz", kind: "unknown" });
    const { store, events } = mkStore(fake);
    const party = rowToParty(fake.rows.get("p1")!);
    store.seedBaseline(party, "u");
    store.enqueueUpdate({ ...party, name: "Nope" }, "u");
    await flush();
    const toastEvts = events.filter((e) => e.type === "toast") as Extract<
      StoreEvent,
      { type: "toast" }
    >[];
    for (const t of toastEvts) {
      expect(t.message).not.toMatch(/duplicate key/i);
      expect(t.message).not.toMatch(/xyz/);
    }
  });
});
