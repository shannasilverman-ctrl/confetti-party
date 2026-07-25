// Locks in Item 1 from the persistence second-pass review: a mixed conflict
// (semantic on one column + independently-mergeable safe update on another)
// must preserve BOTH the semantic choice AND the safe merge, regardless of
// whether the user picks "mine" or "theirs".

import { describe, it, expect } from "vitest";
import type { Party } from "@/lib/party-context";
import {
  type PartyClient,
  type PartyRow,
  partyToColumns,
  rowToParty,
} from "@/lib/party-persistence";
import { PartyStore, type StoreEvent } from "@/lib/party-store";

function mkParty(over: Partial<Party> = {}): Party {
  return {
    id: "p1",
    name: "Original",
    occasion: "birthday",
    date: "2027-05-05",
    guestEstimate: 10,
    budget: 100,
    theme: "T",
    tasks: [{ id: "t1", title: "Do thing", done: false, dueDays: 0 }],
    guests: [],
    budgetCategories: [],
    timeline: [],
    shoppingItems: [{ id: "s1", label: "Cups", qty: 12, category: "Drinks", status: "needed" }],
    pinnedInspiration: [],
    bringBoard: [],
    checkins: {},
    hostUpdates: [],
    updatedAt: "2027-01-01T00:00:00Z",
    ...over,
  };
}

class FakeDb {
  rows = new Map<string, PartyRow>();
  clock = 0;
  tick() {
    this.clock += 1;
    return `2027-01-01T00:00:${String(this.clock).padStart(2, "0")}Z`;
  }
  seed(row: PartyRow) {
    this.rows.set(row.id, { ...row, updated_at: row.updated_at ?? this.tick() });
  }
  patchServer(id: string, patch: Partial<PartyRow>) {
    const cur = this.rows.get(id)!;
    this.rows.set(id, { ...cur, ...patch, updated_at: this.tick() });
  }
  client(): PartyClient {
    return {
      insert: async () => ({ data: null, error: { kind: "network", retryable: true } }),
      updateWithConcurrency: async (id, patch, expected) => {
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

async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

describe("PartyStore — mixed conflict (semantic + safe merge)", () => {
  it("resolveConflict('mine') persists BOTH the local name AND the mergeable task change", async () => {
    const fake = new FakeDb();
    const seeded = partyToColumns(mkParty(), "u");
    fake.seed(seeded);
    const events: StoreEvent[] = [];
    const store = new PartyStore({
      client: fake.client(),
      isTombstoned: () => false,
      sleep: () => Promise.resolve(),
      isOnline: () => true,
      onEvent: (e) => events.push(e),
    });
    const party = rowToParty(fake.rows.get("p1")!);
    store.seedBaseline(party, "u");

    // Server: another host renames the party (semantic conflict on `name`).
    fake.patchServer("p1", { name: "Server Name" });

    // Local: rename AND add a task in the same session.
    const localEdit: Party = {
      ...party,
      name: "My Name",
      tasks: [...party.tasks, { id: "t2", title: "Extra", done: false, dueDays: 0 }],
    };
    store.enqueueUpdate(localEdit, "u");
    await flush();

    // Confirm conflict raised with safeMergedValues containing tasks.
    const conflict = store.getState("p1").conflict;
    expect(conflict).not.toBeNull();
    expect(conflict!.columns).toContain("name");
    expect("tasks" in conflict!.safeMergedValues).toBe(true);

    // User picks "mine".
    store.resolveConflict("p1", "mine");
    await flush();

    const finalRow = fake.rows.get("p1")!;
    expect(finalRow.name).toBe("My Name"); // semantic choice preserved
    // Auto-merged task change also persisted.
    const tasks = (finalRow.tasks ?? []) as Array<{ id: string }>;
    expect(tasks.some((t) => t.id === "t2")).toBe(true);
  });

  it("resolveConflict('theirs') keeps server name but STILL persists the safe task merge", async () => {
    const fake = new FakeDb();
    const seeded = partyToColumns(mkParty(), "u");
    fake.seed(seeded);
    const store = new PartyStore({
      client: fake.client(),
      isTombstoned: () => false,
      sleep: () => Promise.resolve(),
      isOnline: () => true,
      onEvent: () => {},
    });
    const party = rowToParty(fake.rows.get("p1")!);
    store.seedBaseline(party, "u");
    fake.patchServer("p1", { name: "Server Name" });

    const localEdit: Party = {
      ...party,
      name: "My Name",
      tasks: [...party.tasks, { id: "t2", title: "Extra", done: false, dueDays: 0 }],
    };
    store.enqueueUpdate(localEdit, "u");
    await flush();

    store.resolveConflict("p1", "theirs");
    await flush();

    const finalRow = fake.rows.get("p1")!;
    expect(finalRow.name).toBe("Server Name"); // server won semantic column
    const tasks = (finalRow.tasks ?? []) as Array<{ id: string }>;
    expect(tasks.some((t) => t.id === "t2")).toBe(true); // safe merge still persisted
  });
});
