import { describe, it, expect } from "vitest";
import { makeParty, type Task } from "@/lib/party-context";

const baseInput = {
  name: "Test Gathering",
  occasion: "holiday" as const,
  date: "2026-12-24",
  guestEstimate: 10,
  budget: 300,
  theme: "Warm & Cozy",
};

describe("makeParty", () => {
  it("returns a single, non-duplicated tasks array", () => {
    const p = makeParty(baseInput, "id-1");
    // Regression guard: exactly one enumerable `tasks` field, not two.
    const keys = Object.keys(p).filter((k) => k === "tasks");
    expect(keys.length).toBe(1);
    expect(Array.isArray(p.tasks)).toBe(true);
    // Every task must have a unique id (no accidental duplication from
    // both a stale and a fresh `tasks:` property being merged).
    const ids = p.tasks.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('"generic" starter seeds real (tradition-neutral) tasks + bring board', () => {
    const p = makeParty({ ...baseInput, holidayPackId: "generic" }, "id-2");
    expect(p.holidayPackId).toBe("generic");
    expect(p.bringBoard.length).toBeGreaterThan(0);
    // Pack tasks land alongside generated tasks — total exceeds generateTasks
    // for the same occasion alone.
    const withoutPack = makeParty(baseInput, "id-3");
    expect(p.tasks.length).toBeGreaterThan(withoutPack.tasks.length);
  });

  it("unknown holidayPackId is discarded and no pack is applied", () => {
    const p = makeParty(
      // Intentional cast — this mimics a stale row from an older schema.
      { ...baseInput, holidayPackId: "totally-fake" as never },
      "id-4",
    );
    expect(p.holidayPackId).toBeUndefined();
    expect(p.bringBoard.length).toBe(0);
  });

  it("extraTasks are appended once (no duplication with pack or generated)", () => {
    const extra: Task[] = [
      { id: "x1", title: "Sharpen carving knife", bucket: "Party week", done: false },
    ];
    const p = makeParty(
      { ...baseInput, holidayPackId: "thanksgiving", extraTasks: extra },
      "id-5",
    );
    const matches = p.tasks.filter((t) => t.id === "x1");
    expect(matches.length).toBe(1);
  });
});
