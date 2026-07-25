import { describe, expect, it } from "vitest";
import { partiesSummary } from "@/lib/parties-summary";

function iso(daysFromToday: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

describe("partiesSummary", () => {
  it("returns empty copy when no parties", () => {
    const s = partiesSummary([]);
    expect(s.active).toBe(0);
    expect(s.past).toBe(0);
    expect(s.copy).toMatch(/nothing here yet/i);
  });

  it("counts upcoming and past honestly", () => {
    const s = partiesSummary([
      { date: iso(3) },
      { date: iso(10) },
      { date: iso(30) },
      { date: iso(-5) },
    ]);
    expect(s.active).toBe(3);
    expect(s.past).toBe(1);
    expect(s.copy).toBe("3 upcoming · 1 past — pick one to keep planning.");
  });

  it("says wrapped when everything is in the past", () => {
    const s = partiesSummary([{ date: iso(-1) }, { date: iso(-30) }]);
    expect(s.active).toBe(0);
    expect(s.past).toBe(2);
    expect(s.copy).toMatch(/wrapped/i);
  });

  it("omits past segment when everything is upcoming", () => {
    const s = partiesSummary([{ date: iso(1) }, { date: iso(2) }]);
    expect(s.copy).toBe("2 upcoming — pick one to keep planning.");
  });

  it("treats today as upcoming", () => {
    const s = partiesSummary([{ date: iso(0) }]);
    expect(s.active).toBe(1);
    expect(s.past).toBe(0);
  });
});
