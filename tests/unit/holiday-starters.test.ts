import { describe, it, expect } from "vitest";
import {
  HOLIDAY_STARTERS,
  getStarter,
  starterPack,
  packTasks,
  packBringBoard,
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

  it("getStarter returns undefined for unknown / empty ids and hits for known", () => {
    expect(getStarter(undefined)).toBeUndefined();
    expect(getStarter("")).toBeUndefined();
    expect(getStarter("nope")).toBeUndefined();
    expect(getStarter("hanukkah")?.label).toBe("Hanukkah");
  });

  it('starterPack("generic") returns undefined so no pack is applied', () => {
    expect(starterPack("generic")).toBeUndefined();
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
