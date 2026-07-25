import { describe, it, expect } from "vitest";
import {
  DEMO_STORAGE_KEY,
  loadDemoState,
  saveDemoState,
  selectImportCandidateIds,
} from "@/lib/demo-storage";
import type { Party } from "@/lib/party-context";

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
  };
}

function makeParty(id: string, name = "Party"): Party {
  return {
    id,
    name,
    occasion: "birthday",
    date: "2026-01-01",
    guestEstimate: 10,
    budget: 100,
    theme: "",
    tasks: [],
    guests: [],
    budgetCategories: [],
    timeline: [],
    shoppingItems: [],
    pinnedInspiration: [],
  } as Party;
}

describe("demo-storage origin tracking", () => {
  it("infers curated origin for known seed ids and user for others", () => {
    const s = memStorage();
    const seeds = [makeParty("seed-a"), makeParty("seed-b")];
    const userParty = makeParty("user-1");
    saveDemoState([...seeds, userParty], seeds, s, {
      "seed-a": { origin: "curated", edited: false },
      "seed-b": { origin: "curated", edited: false },
      "user-1": { origin: "user", edited: false },
    });
    const result = loadDemoState(seeds, s);
    expect(result.origins["seed-a"].origin).toBe("curated");
    expect(result.origins["user-1"].origin).toBe("user");
  });

  it("selectImportCandidateIds excludes curated seeds and includes user + edited", () => {
    const seeds = [makeParty("seed-a"), makeParty("seed-b")];
    const parties = [...seeds, makeParty("user-1")];
    const seedIds = new Set(seeds.map((p) => p.id));
    const origins = {
      "seed-a": { origin: "curated" as const, edited: false },
      "seed-b": { origin: "curated" as const, edited: true },
      "user-1": { origin: "user" as const, edited: false },
    };
    const ids = selectImportCandidateIds(parties, origins, seedIds);
    expect(ids).toEqual(["seed-b", "user-1"]);
    expect(ids).not.toContain("seed-a");
  });

  it("hostile stored origin cannot promote a curated seed to user", () => {
    const s = memStorage();
    const seeds = [makeParty("seed-a")];
    // Directly write a store where seed-a is claimed to be user-origin.
    s.setItem(
      DEMO_STORAGE_KEY,
      JSON.stringify({
        v: 2,
        samples: {},
        custom: [],
        origins: { "seed-a": { origin: "user", edited: false } },
      }),
    );
    const result = loadDemoState(seeds, s);
    // Load forces seed ids back to curated origin.
    expect(result.origins["seed-a"].origin).toBe("curated");
  });

  it("v2 payload written before origins existed still loads and infers", () => {
    const s = memStorage();
    const seeds = [makeParty("seed-a")];
    s.setItem(
      DEMO_STORAGE_KEY,
      JSON.stringify({
        v: 2,
        samples: {},
        custom: [makeParty("legacy-user")],
      }),
    );
    const result = loadDemoState(seeds, s);
    expect(result.origins["seed-a"].origin).toBe("curated");
    expect(result.origins["legacy-user"].origin).toBe("user");
  });
});
