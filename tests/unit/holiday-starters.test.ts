import { describe, it, expect } from "vitest";
import {
  HOLIDAY_STARTERS,
  PACKS,
  getStarter,
  starterPack,
  toHolidayStarterId,
  packTasks,
  packBringBoard,
  type HolidayStarterId,
} from "@/lib/holiday-packs";

describe("holiday starter selector mapping", () => {
  it("exposes all six required starters in order", () => {
    expect(HOLIDAY_STARTERS.map((s) => s.id)).toEqual([
      "generic",
      "thanksgiving",
      "hanukkah",
      "christmas",
      "new-years",
      "shabbat",
    ]);
  });

  it("every starter has a human label, emoji, blurb, and suggested name", () => {
    for (const s of HOLIDAY_STARTERS) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.emoji.length).toBeGreaterThan(0);
      expect(s.blurb.length).toBeGreaterThan(0);
      expect(s.suggestedName.length).toBeGreaterThan(0);
    }
  });

  it("every starter id resolves to a real pack (no orphan starters)", () => {
    for (const s of HOLIDAY_STARTERS) {
      expect(PACKS[s.id]).toBeDefined();
      expect(starterPack(s.id)?.id).toBe(s.id);
    }
  });

  it("getStarter returns undefined for unknown / empty ids and hits for known", () => {
    expect(getStarter(undefined)).toBeUndefined();
    expect(getStarter("")).toBeUndefined();
    expect(getStarter("nope")).toBeUndefined();
    expect(getStarter("hanukkah")?.label).toBe("Hanukkah");
  });

  it('"generic" resolves to the tradition-neutral pack (not a blank)', () => {
    const pack = starterPack("generic");
    expect(pack?.id).toBe("generic");
    expect(pack?.bringBoardSeeds.length).toBeGreaterThan(0);
    expect(pack?.taskSeeds.length).toBeGreaterThan(0);
    // Tradition-neutral: seed labels must not name a specific ritual/menu.
    const allLabels = [
      ...(pack?.bringBoardSeeds.map((s) => s.label) ?? []),
      ...(pack?.taskSeeds.map((s) => s.title) ?? []),
    ]
      .join(" ")
      .toLowerCase();
    for (const banned of ["turkey", "latke", "menorah", "christmas", "shabbat", "candle"]) {
      expect(allLabels).not.toContain(banned);
    }
  });

  it("toHolidayStarterId narrows unknown input to undefined without throwing", () => {
    expect(toHolidayStarterId("generic")).toBe("generic");
    expect(toHolidayStarterId("thanksgiving")).toBe("thanksgiving");
    expect(toHolidayStarterId("nope")).toBeUndefined();
    expect(toHolidayStarterId(undefined)).toBeUndefined();
    expect(toHolidayStarterId(null)).toBeUndefined();
    expect(toHolidayStarterId(42)).toBeUndefined();
    expect(toHolidayStarterId({})).toBeUndefined();
  });

  it("HolidayStarterId compile check accepts known ids", () => {
    const ids: HolidayStarterId[] = ["generic", "thanksgiving", "hanukkah"];
    expect(ids.length).toBe(3);
  });

  it("starterPack for real ids returns the matching pack", () => {
    expect(starterPack("thanksgiving")?.id).toBe("thanksgiving");
    expect(starterPack("new-years")?.id).toBe("new-years");
    expect(starterPack("shabbat")?.id).toBe("shabbat");
  });

  it("materialized pack tasks + bring board are non-empty and editable-shaped", () => {
    const pack = starterPack("thanksgiving")!;
    let n = 0;
    const mkId = () => `id-${++n}`;
    const tasks = packTasks(pack, mkId);
    const bring = packBringBoard(pack, mkId);
    expect(tasks.length).toBeGreaterThan(0);
    expect(bring.length).toBeGreaterThan(0);
    for (const t of tasks) {
      expect(t.done).toBe(false);
      expect(typeof t.title).toBe("string");
    }
    for (const b of bring) {
      expect(b.status).toBe("open");
      expect(b.source).toBe("host");
    }
  });
});
