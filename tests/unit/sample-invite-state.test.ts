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
    expect(loadSampleState(storage)).toEqual(state);
  });

  it.each([
    "{",
    JSON.stringify({ v: 1, bring: [], baseline: { yes: 1, maybe: 1 }, rsvp: null, extra: true }),
    JSON.stringify({
      v: 1,
      bring: [{ id: "__proto__", category: "x", label: "x", qty: 1, status: "open" }],
      baseline: { yes: 1, maybe: 1 },
      rsvp: null,
    }),
    JSON.stringify({
      v: 1,
      bring: [{ id: "x", category: "x", label: "x", qty: 0, status: "claimed" }],
      baseline: { yes: 1, maybe: 1 },
      rsvp: null,
    }),
  ])("resets corrupt or out-of-contract state", (raw) => {
    const storage = memoryStorage(raw);
    expect(loadSampleState(storage)).toEqual(defaultSampleState());
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
    expect(loadSampleState(storage)).toEqual(defaultSampleState());
    expect(storage.removeItem).toHaveBeenCalled();
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
});
