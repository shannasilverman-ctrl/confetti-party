import { describe, it, expect, beforeEach } from "vitest";
import {
  HANDOFF_STORAGE_KEY,
  HANDOFF_TTL_MS,
  clearHandoff,
  markClaimedBy,
  readHandoff,
  saveHandoff,
} from "@/lib/talk-handoff";

function memStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    _map: map,
  };
}

const validPatch = { identity: { workingTitle: "Test" } };

describe("talk-handoff", () => {
  let s: ReturnType<typeof memStorage>;
  beforeEach(() => {
    s = memStorage();
  });

  it("saves and reads back a fresh handoff", () => {
    const saved = saveHandoff(
      {
        messages: [
          { role: "user", text: "hi" },
          { role: "assistant", text: "hello" },
        ],
        patch: validPatch,
        summary: "brief",
      },
      s,
    );
    expect(saved).not.toBeNull();
    const read = readHandoff(null, s);
    expect(read?.messages.length).toBe(2);
    expect(read?.summary).toBe("brief");
    expect(read?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(read?.claimedBy).toBeNull();
  });

  it("reuses previousKey across saves", () => {
    const a = saveHandoff({ messages: [{ role: "user", text: "a" }], patch: {} }, s)!;
    const b = saveHandoff(
      { messages: [{ role: "user", text: "b" }], patch: {}, previousKey: a.idempotencyKey },
      s,
    )!;
    expect(b.idempotencyKey).toBe(a.idempotencyKey);
  });

  it("returns null on corrupt JSON", () => {
    s.setItem(HANDOFF_STORAGE_KEY, "{not json");
    expect(readHandoff(null, s)).toBeNull();
  });

  it("returns null on schema mismatch (wrong version)", () => {
    s.setItem(HANDOFF_STORAGE_KEY, JSON.stringify({ version: 2, messages: [] }));
    expect(readHandoff(null, s)).toBeNull();
  });

  it("returns null on oversized payload", () => {
    // Directly write >32KB blob; readHandoff must reject before JSON.parse.
    s.setItem(HANDOFF_STORAGE_KEY, "x".repeat(40_000));
    expect(readHandoff(null, s)).toBeNull();
  });

  it("returns null on expired TTL", () => {
    const rec = saveHandoff({ messages: [{ role: "user", text: "old" }], patch: {} }, s)!;
    // Rewrite with a createdAt in the far past.
    s.setItem(
      HANDOFF_STORAGE_KEY,
      JSON.stringify({ ...rec, createdAt: Date.now() - HANDOFF_TTL_MS - 1000 }),
    );
    expect(readHandoff(null, s)).toBeNull();
  });

  it("clearHandoff removes the entry", () => {
    saveHandoff({ messages: [{ role: "user", text: "x" }], patch: {} }, s);
    clearHandoff(s);
    expect(readHandoff(null, s)).toBeNull();
  });

  it("markClaimedBy binds to the given user (idempotent)", () => {
    const userA = "11111111-1111-4111-8111-111111111111";
    saveHandoff({ messages: [{ role: "user", text: "hi" }], patch: {} }, s);
    const claimed = markClaimedBy(userA, s);
    expect(claimed?.claimedBy).toBe(userA);
    const again = markClaimedBy(userA, s);
    expect(again?.claimedBy).toBe(userA);
  });

  it("readHandoff hides records claimed by a different user", () => {
    const userA = "11111111-1111-4111-8111-111111111111";
    const userB = "22222222-2222-4222-8222-222222222222";
    saveHandoff({ messages: [{ role: "user", text: "hi" }], patch: {} }, s);
    markClaimedBy(userA, s);
    expect(readHandoff(userB, s)).toBeNull();
    // But unauthenticated / same-user reads still work
    expect(readHandoff(userA, s)?.claimedBy).toBe(userA);
    expect(readHandoff(null, s)?.claimedBy).toBe(userA);
  });

  it("caps message count and byte size", () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      role: "user" as const,
      text: `msg-${i}`,
    }));
    const saved = saveHandoff({ messages: many, patch: {} }, s)!;
    expect(saved.messages.length).toBeLessThanOrEqual(60);
  });

  it("truncates very long individual messages", () => {
    const huge = "z".repeat(50_000);
    const saved = saveHandoff({ messages: [{ role: "user", text: huge }], patch: {} }, s);
    expect(saved).not.toBeNull();
    expect(saved!.messages[0].text.length).toBeLessThanOrEqual(2 * 1024);
  });

  it("saveHandoff refuses when the total payload would exceed the cap", () => {
    // 60 messages × 2KB each = ~120KB — well over the 32KB total cap.
    // The 2KB per-message cap is applied before the total-payload check,
    // so each entry stays 2KB, then the outer serialized size check refuses.
    const many = Array.from({ length: 60 }, () => ({
      role: "user" as const,
      text: "y".repeat(2000),
    }));
    expect(saveHandoff({ messages: many, patch: {} }, s)).toBeNull();
  });
});
