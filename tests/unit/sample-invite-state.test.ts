import { describe, expect, it, vi } from "vitest";
import {
  SAMPLE_STATE_STORAGE_KEY,
  defaultSampleState,
  derivedCounts,
  loadSampleState,
  saveSampleState,
} from "@/lib/sample-invite-state";

function memoryStorage(initial?: string, initialKey = SAMPLE_STATE_STORAGE_KEY) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(initialKey, initial);
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, next: string) => {
      values.set(key, next);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
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
      JSON.stringify({ v: 2, bring: [], baseline: { yes: 1, maybe: 1 }, rsvp: null, extra: true }),
      "invalid",
    ],
    [
      JSON.stringify({
        v: 2,
        bring: [{ id: "__proto__", category: "x", label: "x", qty: 1, status: "open" }],
        baseline: { yes: 1, maybe: 1 },
        rsvp: null,
      }),
      "invalid",
    ],
    [
      JSON.stringify({
        v: 2,
        bring: [{ id: "x", category: "x", label: "x", qty: 0, status: "claimed" }],
        baseline: { yes: 1, maybe: 1 },
        rsvp: null,
      }),
      "invalid",
    ],
  ] as const)("reports %s corruption and resets out-of-contract state", (raw, corruption) => {
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
    expect(storage.removeItem).toHaveBeenCalled();
  });

  it("rejects duplicate tags and duplicate bring IDs", () => {
    const duplicateId = {
      ...defaultSampleState(),
      bring: [
        { id: "same", category: "Sides", label: "Salad", qty: 1, status: "open" as const },
        { id: "same", category: "Sides", label: "Bread", qty: 1, status: "open" as const },
      ],
    };
    expect(saveSampleState(duplicateId, memoryStorage())).toEqual({
      ok: false,
      reason: "invalid",
    });

    const duplicateTags = defaultSampleState();
    duplicateTags.rsvp = {
      name: "Rivera family",
      choice: "yes",
      adults: 1,
      kids: 0,
      dietary: ["vegan", "vegan"],
      allergens: [],
      at: "2027-01-01T00:00:00.000Z",
    };
    expect(saveSampleState(duplicateTags, memoryStorage())).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("migrates the strict v1 sample without inventing a private note", () => {
    const legacyKey = "confetti:sample-invite:v1";
    const legacy = {
      v: 1,
      rsvp: {
        name: "Rivera family",
        choice: "yes",
        adults: 2,
        kids: 0,
        dietary: ["Vegan"],
        allergens: [],
        at: "2027-01-01T00:00:00.000Z",
      },
      bring: defaultSampleState().bring,
      baseline: { yes: 14, maybe: 3 },
    };
    const storage = memoryStorage(JSON.stringify(legacy), legacyKey);

    const loaded = loadSampleState(storage);

    expect(loaded.state).toMatchObject({
      v: 2,
      rsvp: { name: "Rivera family", choice: "yes" },
    });
    expect(loaded.state.rsvp).not.toHaveProperty("accessNotes");
    expect(storage.setItem).toHaveBeenCalledWith(SAMPLE_STATE_STORAGE_KEY, expect.any(String));
    expect(storage.removeItem).toHaveBeenCalledWith(legacyKey);
  });

  it("persists a bounded host-only note and rejects one attached to a no", () => {
    const withNote = defaultSampleState();
    withNote.rsvp = {
      name: "Sam Rivera",
      choice: "maybe",
      adults: 0,
      kids: 0,
      dietary: [],
      allergens: [],
      accessNotes: "A seat away from the speakers would help.",
      at: "2027-01-01T00:00:00.000Z",
    };
    const storage = memoryStorage();
    expect(saveSampleState(withNote, storage)).toEqual({ ok: true });
    expect(loadSampleState(storage).state.rsvp?.accessNotes).toBe(
      "A seat away from the speakers would help.",
    );

    withNote.rsvp = { ...withNote.rsvp, choice: "no" };
    expect(saveSampleState(withNote, storage)).toEqual({ ok: false, reason: "invalid" });
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
