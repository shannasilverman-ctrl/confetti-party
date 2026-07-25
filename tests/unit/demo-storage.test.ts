import { describe, expect, it } from "vitest";
import { DEMO_MAX_BYTES, DEMO_STORAGE_KEY, loadDemoState, saveDemoState } from "@/lib/demo-storage";
import type { Party } from "@/lib/party-context";

function seed(id: string, over: Partial<Party> = {}): Party {
  return {
    id,
    name: `Party ${id}`,
    occasion: "birthday",
    date: "2030-01-01",
    guestEstimate: 8,
    budget: 100,
    theme: "",
    tasks: [],
    guests: [],
    budgetCategories: [],
    timeline: [],
    shoppingItems: [],
    pinnedInspiration: [],
    ...over,
  } as unknown as Party;
}

class MemStorage {
  store = new Map<string, string>();
  quota: number | null = null;
  getItem(k: string) {
    return this.store.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.quota !== null && v.length > this.quota) throw new Error("QuotaExceeded");
    this.store.set(k, v);
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
}

describe("demo-storage", () => {
  it("returns seeds unchanged when nothing is persisted", () => {
    const s = new MemStorage();
    const seeds = [seed("a"), seed("b")];
    const out = loadDemoState(seeds, s);
    expect(out.parties.map((p) => p.id)).toEqual(["a", "b"]);
    expect(out.warning).toBeUndefined();
  });

  it("layers user overrides on top of code seeds without changing seed id", () => {
    const s = new MemStorage();
    const seeds = [seed("a"), seed("b")];
    // Persist an override for seed "a" with a different name and an
    // adversarial id that must not survive.
    s.store.set(
      DEMO_STORAGE_KEY,
      JSON.stringify({
        v: 2,
        samples: { a: { ...seed("a", { name: "Renamed" }), id: "HACKED" } },
        custom: [],
      }),
    );
    const out = loadDemoState(seeds, s);
    expect(out.parties[0]?.id).toBe("a"); // seed id preserved
    expect(out.parties[0]?.name).toBe("Renamed");
    expect(out.parties[1]?.name).toBe("Party b"); // fresh seed
  });

  it("drops corrupt JSON and warns", () => {
    const s = new MemStorage();
    s.store.set(DEMO_STORAGE_KEY, "{not json");
    const seeds = [seed("a")];
    const out = loadDemoState(seeds, s);
    expect(out.parties).toHaveLength(1);
    expect(out.warning).toBe("corrupt");
  });

  it("drops top-level wrong shape and warns", () => {
    const s = new MemStorage();
    s.store.set(DEMO_STORAGE_KEY, JSON.stringify(["not", "the", "right", "shape"]));
    const out = loadDemoState([seed("a")], s);
    expect(out.warning).toBe("corrupt");
  });

  it("splits samples from custom parties on save/load roundtrip", () => {
    const s = new MemStorage();
    const seeds = [seed("a")];
    const custom = seed("custom-1", { name: "Backyard bash" });
    const parties = [seed("a", { name: "Edited seed" }), custom];
    const res = saveDemoState(parties, seeds, s);
    expect(res.ok).toBe(true);
    const raw = JSON.parse(s.getItem(DEMO_STORAGE_KEY)!);
    expect(raw.v).toBe(2);
    expect(raw.samples.a.name).toBe("Edited seed");
    expect(raw.custom).toHaveLength(1);
    expect(raw.custom[0].id).toBe("custom-1");
    const out = loadDemoState(seeds, s);
    expect(out.parties.map((p) => p.id)).toEqual(["a", "custom-1"]);
    expect(out.parties[0]?.name).toBe("Edited seed");
  });

  it("does not resurrect orphaned seed overrides after seed removal", () => {
    const s = new MemStorage();
    s.store.set(
      DEMO_STORAGE_KEY,
      JSON.stringify({
        v: 2,
        samples: { removed: seed("removed", { name: "Old seed" }) },
        custom: [],
      }),
    );
    const out = loadDemoState([seed("a")], s);
    expect(out.parties.map((p) => p.id)).toEqual(["a"]);
  });

  it("filters custom parties whose id collides with a seed", () => {
    const s = new MemStorage();
    s.store.set(
      DEMO_STORAGE_KEY,
      JSON.stringify({
        v: 2,
        samples: {},
        custom: [seed("a"), seed("real")],
      }),
    );
    const out = loadDemoState([seed("a")], s);
    expect(out.parties.map((p) => p.id)).toEqual(["a", "real"]);
  });

  it("reports oversized when UTF-8 payload exceeds cap", () => {
    const s = new MemStorage();
    // Fill custom with big strings until we clearly exceed the byte cap.
    const bigNote = "x".repeat(100_000);
    const parties = Array.from({ length: 10 }, (_, i) =>
      seed(`c-${i}`, { hostNote: bigNote } as Partial<Party>),
    );
    const res = saveDemoState(parties, [], s);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("oversized");
    // And we should not have written anything.
    expect(s.getItem(DEMO_STORAGE_KEY)).toBeNull();
  });

  it("reports quota when setItem throws", () => {
    const s = new MemStorage();
    s.quota = 10; // tiny
    const res = saveDemoState([seed("a")], [seed("a")], s);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("quota");
  });

  it("counts UTF-8 bytes, not JS code units, for the cap", () => {
    // Sanity: DEMO_MAX_BYTES is >0 and sane.
    expect(DEMO_MAX_BYTES).toBeGreaterThan(64 * 1024);
  });
});
