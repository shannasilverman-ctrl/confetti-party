import { describe, expect, it, afterEach, vi } from "vitest";
import {
  parseDateOnly,
  isValidDateOnly,
  dateOnlyToLocalDate,
  localDateToDateOnly,
  nextWeekdayDateOnly,
  todayDateOnly,
  addDaysDateOnly,
  isoDateInDaysLocal,
  calendarDaysBetween,
  daysUntilLocal,
  formatDateOnly,
  toAllDayStamp,
  allDayStampPlusDays,
  parseWallClockTime,
  combineDateAndTime,
  toLocalCalendarStamp,
  toUtcCalendarStamp,
} from "@/lib/date-only";

// Node's Intl runs in the *process* time zone. We can't switch TZ mid-test
// via `process.env.TZ`, but we CAN prove the calendar-date invariant by
// asserting that `dateOnlyToLocalDate` uses local components, which is
// the whole point of this module: the returned Date's getFullYear/
// getMonth/getDate always match the input parts, no matter the host TZ.
// We also run the tz-matrix helper (see scripts/tz-matrix.mjs) in a
// subprocess to prove the same invariant across HNL/LAX/NYC/LON/IST/AKL.

afterEach(() => {
  vi.useRealTimers();
});

describe("nextWeekdayDateOnly", () => {
  it.each([
    new Date(2026, 0, 1),
    new Date(2026, 5, 15),
    new Date(2027, 10, 30),
    new Date(2028, 1, 29),
  ])("returns a Saturday 21–27 days after %s", (now) => {
    const result = nextWeekdayDateOnly(6, 21, now);
    expect(dateOnlyToLocalDate(result).getDay()).toBe(6);
    expect(daysUntilLocal(result, now)).toBeGreaterThanOrEqual(21);
    expect(daysUntilLocal(result, now)).toBeLessThanOrEqual(27);
  });

  it("rejects invalid weekday and range inputs", () => {
    expect(() => nextWeekdayDateOnly(7, 1)).toThrow(/weekday/);
    expect(() => nextWeekdayDateOnly(6, -1)).toThrow(/minimumDays/);
  });
});

describe("parseDateOnly", () => {
  it("accepts strict YYYY-MM-DD", () => {
    expect(parseDateOnly("2027-05-22")).toEqual({ y: 2027, m: 5, d: 22 });
  });
  it("rejects bad shapes", () => {
    for (const s of [
      "",
      "2027-5-22",
      "2027/05/22",
      "2027-05-22T00:00:00",
      null,
      undefined,
      "abc",
    ]) {
      expect(parseDateOnly(s as string)).toBeNull();
    }
  });
  it("rejects impossible calendar days", () => {
    expect(parseDateOnly("2027-02-30")).toBeNull();
    expect(parseDateOnly("2027-04-31")).toBeNull();
    expect(parseDateOnly("2027-13-01")).toBeNull();
    expect(parseDateOnly("2027-00-10")).toBeNull();
    expect(parseDateOnly("2027-05-00")).toBeNull();
  });
  it("accepts leap day only in leap years", () => {
    expect(isValidDateOnly("2024-02-29")).toBe(true);
    expect(isValidDateOnly("2023-02-29")).toBe(false);
  });
});

describe("dateOnlyToLocalDate", () => {
  it("preserves the calendar day via local components", () => {
    const dt = dateOnlyToLocalDate("2027-05-22");
    expect(dt.getFullYear()).toBe(2027);
    expect(dt.getMonth()).toBe(4);
    expect(dt.getDate()).toBe(22);
    expect(dt.getHours()).toBe(0);
  });
  it("round-trips through localDateToDateOnly", () => {
    for (const iso of ["2024-02-29", "2027-05-22", "2025-12-31", "2025-01-01"]) {
      expect(localDateToDateOnly(dateOnlyToLocalDate(iso))).toBe(iso);
    }
  });
  it("throws on bad input", () => {
    expect(() => dateOnlyToLocalDate("nope")).toThrow();
  });
});

describe("addDaysDateOnly & isoDateInDaysLocal", () => {
  it("adds calendar days ignoring DST", () => {
    // US spring-forward 2025-03-09 (LAX). Adding 1 day must land on 2025-03-10
    // regardless of the missing hour.
    expect(addDaysDateOnly("2025-03-08", 1)).toBe("2025-03-09");
    expect(addDaysDateOnly("2025-03-09", 1)).toBe("2025-03-10");
    // Fall-back 2025-11-02.
    expect(addDaysDateOnly("2025-11-01", 1)).toBe("2025-11-02");
    expect(addDaysDateOnly("2025-11-02", 1)).toBe("2025-11-03");
    // Month/year rollovers.
    expect(addDaysDateOnly("2025-01-31", 1)).toBe("2025-02-01");
    expect(addDaysDateOnly("2025-12-31", 1)).toBe("2026-01-01");
    // Leap day math.
    expect(addDaysDateOnly("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDaysDateOnly("2024-02-28", 2)).toBe("2024-03-01");
    expect(addDaysDateOnly("2023-02-28", 1)).toBe("2023-03-01");
    // Negative offsets.
    expect(addDaysDateOnly("2025-01-01", -1)).toBe("2024-12-31");
  });
  it("isoDateInDaysLocal is anchored to local today", () => {
    const base = new Date(2027, 4, 22, 23, 30);
    expect(isoDateInDaysLocal(0, base)).toBe("2027-05-22");
    expect(isoDateInDaysLocal(1, base)).toBe("2027-05-23");
    expect(isoDateInDaysLocal(-1, base)).toBe("2027-05-21");
  });
});

describe("calendarDaysBetween & daysUntilLocal", () => {
  it("returns exact calendar-day counts", () => {
    expect(calendarDaysBetween("2027-05-22", "2027-05-22")).toBe(0);
    expect(calendarDaysBetween("2027-05-22", "2027-05-23")).toBe(1);
    expect(calendarDaysBetween("2027-05-22", "2027-05-21")).toBe(-1);
    expect(calendarDaysBetween("2025-03-08", "2025-03-10")).toBe(2); // DST spring
    expect(calendarDaysBetween("2025-11-01", "2025-11-03")).toBe(2); // DST fall
    expect(calendarDaysBetween("2024-02-28", "2024-03-01")).toBe(2); // leap
    expect(calendarDaysBetween("2025-12-31", "2026-01-02")).toBe(2);
  });
  it("daysUntilLocal is today-anchored", () => {
    vi.useFakeTimers().setSystemTime(new Date(2027, 4, 20, 15));
    expect(daysUntilLocal("2027-05-22")).toBe(2);
    expect(daysUntilLocal("2027-05-20")).toBe(0);
    expect(daysUntilLocal("2027-05-19")).toBe(-1);
  });
});

describe("todayDateOnly", () => {
  it("returns local calendar today, not UTC", () => {
    // 2027-05-22 23:30 local → still 2027-05-22, even if UTC has ticked over.
    const late = new Date(2027, 4, 22, 23, 30);
    expect(todayDateOnly(late)).toBe("2027-05-22");
  });
});

describe("formatDateOnly", () => {
  it("renders the input calendar day", () => {
    const s = formatDateOnly(
      "2027-05-22",
      { month: "long", day: "numeric", year: "numeric" },
      "en-US",
    );
    expect(s).toContain("May 22, 2027");
  });
});

describe("all-day calendar stamps", () => {
  it("toAllDayStamp strips dashes after validation", () => {
    expect(toAllDayStamp("2027-05-22")).toBe("20270522");
    expect(() => toAllDayStamp("2027-13-01")).toThrow();
  });
  it("allDayStampPlusDays advances by calendar day", () => {
    expect(allDayStampPlusDays("2027-05-22", 1)).toBe("20270523");
    expect(allDayStampPlusDays("2024-02-28", 2)).toBe("20240301"); // leap
  });
});

describe("time helpers", () => {
  it("parseWallClockTime handles 24h and 12h", () => {
    expect(parseWallClockTime("18:30")).toEqual({ h: 18, m: 30 });
    expect(parseWallClockTime("6:30 PM")).toEqual({ h: 18, m: 30 });
    expect(parseWallClockTime("12:00 AM")).toEqual({ h: 0, m: 0 });
    expect(parseWallClockTime("12:00 PM")).toEqual({ h: 12, m: 0 });
    expect(parseWallClockTime("13:00 PM")).toBeNull();
    expect(parseWallClockTime("00:30 AM")).toBeNull();
    expect(parseWallClockTime("garbage")).toBeNull();
    expect(parseWallClockTime(null)).toBeNull();
  });
  it("combineDateAndTime produces the intended wall clock", () => {
    const d = combineDateAndTime("2027-05-22", { h: 18, m: 30 });
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(22);
    expect(d.getHours()).toBe(18);
    expect(d.getMinutes()).toBe(30);
  });
  it("toLocalCalendarStamp encodes local wall clock", () => {
    const d = combineDateAndTime("2027-05-22", { h: 18, m: 30 });
    expect(toLocalCalendarStamp(d)).toBe("20270522T183000");
  });
  it("toUtcCalendarStamp encodes an absolute UTC timestamp", () => {
    expect(toUtcCalendarStamp(new Date("2027-05-22T18:30:45.000Z"))).toBe("20270522T183045Z");
  });
});
