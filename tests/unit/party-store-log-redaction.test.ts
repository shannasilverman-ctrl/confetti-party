// Locks in Item 3 from the persistence second-pass review: the store's
// error logger and user-visible toasts must NEVER contain raw provider
// message text (tokens, emails, uuids). Only allowlisted structural
// fields may appear.

import { describe, it, expect, vi } from "vitest";
import type { Party } from "@/lib/party-context";
import {
  type PartyClient,
  type PartyRow,
  partyToColumns,
} from "@/lib/party-persistence";
import { PartyStore, type StoreEvent } from "@/lib/party-store";

const SECRET = "sb_secret_LEAKY_TOKEN_ABC123";
const EMAIL = "victim@example.com";
const UUID = "11111111-2222-3333-4444-555555555555";

function mkParty(): Party {
  return {
    id: "p1",
    name: "N",
    occasion: "birthday",
    date: "2027-01-01",
    guestEstimate: 1,
    budget: 1,
    theme: "T",
    tasks: [],
    guests: [],
    budgetCategories: [],
    timeline: [],
    shoppingItems: [],
    pinnedInspiration: [],
    bringBoard: [],
    checkins: {},
    hostUpdates: [],
  };
}

function fakeClient(): PartyClient {
  return {
    insert: async () => ({
      data: null,
      // The store never sees the raw provider text — only a classified kind.
      // But if any future refactor smuggles the message in, this test catches it.
      error: { kind: "permission", retryable: false },
    }),
    updateWithConcurrency: async () => ({
      data: null,
      error: { kind: "permission", retryable: false },
      conflict: false,
    }),
    fetch: async () => ({ data: null, error: null }),
  };
}

async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

function containsAnySecret(s: string): boolean {
  return s.includes(SECRET) || s.includes(EMAIL) || s.includes(UUID);
}

describe("PartyStore — log & toast redaction", () => {
  it("logError meta contains only allowlisted structural keys", async () => {
    const logs: Array<{ event: string; meta: Record<string, unknown> }> = [];
    const events: StoreEvent[] = [];
    const store = new PartyStore({
      client: fakeClient(),
      isTombstoned: () => false,
      sleep: () => Promise.resolve(),
      isOnline: () => true,
      onEvent: (e) => events.push(e),
      logError: (event, meta) => logs.push({ event, meta }),
    });
    store.enqueueInsert(mkParty(), "u");
    await flush();

    expect(logs.length).toBeGreaterThan(0);
    for (const { meta } of logs) {
      const keys = Object.keys(meta).sort();
      // Allowlist — refuse any unexpected key so the reviewer's leak
      // vector cannot be reintroduced by adding a "messagePreview" back.
      const allowed = ["attempts", "currentUserIdLen", "incomingUserIdLen", "kind", "op", "partyIdLen"];
      for (const k of keys) expect(allowed).toContain(k);
      const serialized = JSON.stringify(meta);
      expect(containsAnySecret(serialized)).toBe(false);
    }
  });

  it("no user-visible toast message contains raw provider tokens/emails/uuids", async () => {
    const events: StoreEvent[] = [];
    const store = new PartyStore({
      client: {
        insert: async () => ({
          data: null,
          error: { kind: "permission", retryable: false },
        }),
        updateWithConcurrency: async () => ({
          data: null,
          error: { kind: "permission", retryable: false },
          conflict: false,
        }),
        fetch: async () => ({ data: null, error: null }),
      },
      isTombstoned: () => false,
      sleep: () => Promise.resolve(),
      isOnline: () => true,
      onEvent: (e) => events.push(e),
    });
    // Attempt with a party id that itself looks like a UUID — proving the
    // toast strings don't interpolate the id.
    const p = { ...mkParty(), id: UUID, name: `Ava <${EMAIL}>` };
    store.enqueueInsert(p, "u");
    await flush();

    const toasts = events.filter((e) => e.type === "toast");
    expect(toasts.length).toBeGreaterThan(0);
    for (const t of toasts) {
      if (t.type !== "toast") continue;
      expect(containsAnySecret(t.message)).toBe(false);
    }
  });
});
