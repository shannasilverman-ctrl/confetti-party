import { describe, expect, it, vi } from "vitest";
import {
  SAMPLE_STATE_STORAGE_KEY,
  defaultSampleState,
  derivedCounts,
  loadSampleState,
  saveSampleState,
} from "@/lib/sample-invite-state";

function memoryStorage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => {
      value = next;
    }),
    removeItem: vi.fn(() => {
      value = null;
    }),
  };
}

describe("sample invite persistence", () => {
  it("round-trips only the strict versioned shape", () => {
    const storage = memoryStorage();
    const state = defaultSampleState();
    expect(saveSampleState(state, storage)).toEqual({ ok: true });
    expect(storage.setItem).toHaveBeenCalledWith(SAMPLE_STATE_STORAGE_KEY, expect.any(String));
    expect(loadSampleState(storage)).toEqual({ state });
  });

  it.each([
    ["{", "parse"],
    [
      JSON.stringify({ v: 1, bring: [], baseline: { yes: 1, maybe: 1 }, rsvp: null, extra: true }),
      "invalid",
    ],
    [
      JSON.stringify({
        v: 1,
        bring: [{ id: "__proto__", category: "x", label: "x", qty: 1, status: "open" }],
        baseline: { yes: 1, maybe: 1 },
        rsvp: null,
      }),
      "invalid",
    ],
    [
      JSON.stringify({
        v: 1,
        bring: [{ id: "x", category: "x", label: "x", qty: 0, status: "claimed" }],
        baseline: { yes: 1, maybe: 1 },
        rsvp: null,
      }),
      "invalid",
    ],
  ])("reports corruption tag and resets on invalid state", (raw, corruption) => {
    const storage = memoryStorage(raw);
    const result = loadSampleState(storage);
    expect(result.state).toEqual(defaultSampleState());
    expect(result.corruption).toBe(corruption);
    expect(storage.removeItem).toHaveBeenCalledWith(SAMPLE_STATE_STORAGE_KEY);
  });

  it("caps arrays and UTF-8 payload bytes", () => {
    const state = defaultSampleState();
    const invalid = {
      ...state,
      bring: Array.from({ length: 51 }, (_, index) => ({
        id: `x-${index}`,
        category: "Sides",
        label: "🎉".repeat(120),
        qty: 1,
        status: "open" as const,
      })),
    };
    expect(saveSampleState(invalid, memoryStorage())).toEqual({ ok: false, reason: "invalid" });

    const oversizedRaw = JSON.stringify({ ...state, padding: "🎉".repeat(10_000) });
    const storage = memoryStorage(oversizedRaw);
    const result = loadSampleState(storage);
    expect(result.state).toEqual(defaultSampleState());
    expect(result.corruption).toBe("oversize");
  });

  it("reports unavailable and quota failures instead of pretending persistence", () => {
    expect(saveSampleState(defaultSampleState(), null)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    const storage = memoryStorage();
    storage.setItem.mockImplementation(() => {
      throw new Error("quota");
    });
    expect(saveSampleState(defaultSampleState(), storage)).toEqual({
      ok: false,
      reason: "quota",
    });
  });

  it("counts yes attendees consistently with the production people count", () => {
    const state = defaultSampleState();
    state.rsvp = {
      name: "Rivera family",
      choice: "yes",
      adults: 2,
      kids: 2,
      dietary: [],
      allergens: [],
      at: "2027-01-01T00:00:00.000Z",
    };
    expect(derivedCounts(state)).toEqual({ yes: 18, maybe: 3 });
  });

  // -------- Fuzz / adversarial payloads --------

  it("rejects prototype-pollution attempts in bring ids", () => {
    for (const bad of ["__proto__", "prototype", "constructor"]) {
      const raw = JSON.stringify({
        v: 1,
        bring: [{ id: bad, category: "x", label: "x", qty: 1, status: "open" }],
        baseline: { yes: 0, maybe: 0 },
        rsvp: null,
      });
      const result = loadSampleState(memoryStorage(raw));
      expect(result.corruption).toBe("invalid");
    }
  });

  it("rejects non-object and array payloads without throwing", () => {
    for (const raw of ["null", "123", '"string"', "[]", "false"]) {
      expect(loadSampleState(memoryStorage(raw)).corruption).toBeDefined();
    }
  });

  it("rejects duplicate bring ids and dietary tags", () => {
    const dup = JSON.stringify({
      v: 1,
      bring: [
        { id: "a", category: "x", label: "x", qty: 1, status: "open" },
        { id: "a", category: "x", label: "x", qty: 1, status: "open" },
      ],
      baseline: { yes: 0, maybe: 0 },
      rsvp: null,
    });
    expect(loadSampleState(memoryStorage(dup)).corruption).toBe("invalid");

    const dupDiet = JSON.stringify({
      v: 1,
      bring: [],
      baseline: { yes: 0, maybe: 0 },
      rsvp: {
        name: "x",
        choice: "yes",
        adults: 1,
        kids: 0,
        dietary: ["vegan", "vegan"],
        allergens: [],
        at: "2027-01-01T00:00:00.000Z",
      },
    });
    expect(loadSampleState(memoryStorage(dupDiet)).corruption).toBe("invalid");
  });

  it("rejects claimedByMe on non-claimed items", () => {
    const raw = JSON.stringify({
      v: 1,
      bring: [{ id: "a", category: "x", label: "x", qty: 1, status: "open", claimedByMe: true }],
      baseline: { yes: 0, maybe: 0 },
      rsvp: null,
    });
    expect(loadSampleState(memoryStorage(raw)).corruption).toBe("invalid");
  });
});
