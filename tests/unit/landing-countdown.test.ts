import { describe, expect, it } from "vitest";
import { daysUntilLocal, localDateToDateOnly } from "@/lib/date-only";

// Mirror of the helper in src/routes/index.tsx. If the source drifts,
// update both together.
function nextIllustrativeSaturday(now: Date): string {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 21);
  const daysToSat = (6 - base.getDay() + 7) % 7;
  base.setDate(base.getDate() + daysToSat);
  return localDateToDateOnly(base);
}

describe("landing illustrative date", () => {
  it.each([
    new Date(2026, 0, 1),
    new Date(2026, 5, 15),
    new Date(2027, 10, 30),
    new Date(2028, 1, 29),
  ])("is a Saturday at least 21 days out from %s", (now) => {
    const iso = nextIllustrativeSaturday(now);
    const [y, m, d] = iso.split("-").map(Number);
    const parsed = new Date(y, m - 1, d);
    expect(parsed.getDay()).toBe(6);
    expect(daysUntilLocal(iso, now)).toBeGreaterThanOrEqual(21);
    expect(daysUntilLocal(iso, now)).toBeLessThanOrEqual(28);
  });
});
