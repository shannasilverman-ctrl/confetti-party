/**
 * Date-only helpers.
 *
 * A "date-only" value is a string in the `YYYY-MM-DD` format representing a
 * calendar date with NO time zone. Constructing `new Date("YYYY-MM-DD")`
 * parses this as UTC midnight, which shifts the calendar day west of UTC
 * (e.g. "2027-05-22" renders as May 21 in Los Angeles). Every date-only
 * string in the app must go through the helpers here so the rendered day
 * matches the value the host entered regardless of viewer time zone.
 *
 * Supported year range: 1000..9999 inclusive (four-digit calendar years in
 * the proleptic Gregorian calendar). Values outside that range are
 * rejected by `parseDateOnly`. This range is enforced by the strict
 * `YYYY-MM-DD` regex and validated in tests.
 *
 * Rules enforced by this module:
 *   1. Strict `YYYY-MM-DD` validation (year 1000-9999, real calendar day).
 *   2. All Date construction goes through numeric local components:
 *      `new Date(y, m - 1, d)`.
 *   3. Calendar-day math uses a pure civil-date ordinal (Rata Die), so
 *      DST transitions and historical UTC offset changes never distort
 *      the count. No elapsed-ms rounding.
 *   4. `addDaysDateOnly` requires a finite integer offset.
 *   5. `localDateToDateOnly` rejects `Invalid Date`.
 */

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MIN_YEAR = 1000;
const MAX_YEAR = 9999;

export type DateOnlyParts = { y: number; m: number; d: number };

/**
 * Strictly validate a `YYYY-MM-DD` string and return numeric components.
 * Returns `null` for anything not a real calendar date in [1000-01-01,
 * 9999-12-31].
 */
export function parseDateOnly(s: string | null | undefined): DateOnlyParts | null {
  if (!s || typeof s !== "string") return null;
  const match = RE.exec(s);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (y < MIN_YEAR || y > MAX_YEAR) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // Reject invalid days (Feb 30, Apr 31, etc.) using the civil-calendar
  // month length table instead of a JS Date round-trip.
  if (d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export function isValidDateOnly(s: string | null | undefined): boolean {
  return parseDateOnly(s) !== null;
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y: number, m: number): number {
  switch (m) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeapYear(y) ? 29 : 28;
    default:
      return 0;
  }
}

/**
 * Proleptic-Gregorian civil-date ordinal (Rata Die). Returns the number of
 * days since 0000-03-01. Purely arithmetic, so it is independent of any
 * time zone, DST, or historical UTC offset change.
 *
 * Reference: Howard Hinnant, "chrono-Compatible Low-Level Date Algorithms."
 */
function civilOrdinal(y: number, m: number, d: number): number {
  const yr = m <= 2 ? y - 1 : y;
  const era = Math.floor(yr / 400);
  const yoe = yr - era * 400; // [0, 399]
  const monthOffset = m > 2 ? m - 3 : m + 9;
  const doy = Math.floor((153 * monthOffset + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe;
}

/**
 * Construct a JS Date pinned to LOCAL midnight of the given date-only value.
 * Every viewer, regardless of time zone, sees the same calendar date.
 *
 * Throws if the input is not a valid `YYYY-MM-DD`.
 */
export function dateOnlyToLocalDate(s: string): Date {
  const parts = parseDateOnly(s);
  if (!parts) throw new Error(`Invalid date-only value: ${JSON.stringify(s)}`);
  return new Date(parts.y, parts.m - 1, parts.d);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function pad4(n: number): string {
  return n.toString().padStart(4, "0");
}

/**
 * Format the current local Date's calendar day back into `YYYY-MM-DD`.
 * Throws on `Invalid Date` — callers must pass a Date they trust.
 */
export function localDateToDateOnly(d: Date): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new Error("localDateToDateOnly: Invalid Date");
  }
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${pad4(y)}-${pad2(m)}-${pad2(day)}`;
}

/** Local calendar today as `YYYY-MM-DD`. */
export function todayDateOnly(now: Date = new Date()): string {
  return localDateToDateOnly(now);
}

/**
 * Add `days` calendar days to a date-only string. Uses the pure civil-date
 * ordinal so DST and historical offset changes never off-by-one the result.
 * Requires `days` to be a finite integer.
 */
export function addDaysDateOnly(s: string, days: number): string {
  const parts = parseDateOnly(s);
  if (!parts) throw new Error(`Invalid date-only value: ${JSON.stringify(s)}`);
  if (!Number.isFinite(days) || !Number.isInteger(days)) {
    throw new Error(`addDaysDateOnly: days must be a finite integer, got ${String(days)}`);
  }
  const dt = new Date(parts.y, parts.m - 1, parts.d + days);
  return localDateToDateOnly(dt);
}

/**
 * ISO date `days` days from `base` (default today), computed against LOCAL
 * calendar. Returns `YYYY-MM-DD`.
 */
export function isoDateInDaysLocal(days: number, base: Date = new Date()): string {
  if (!Number.isFinite(days) || !Number.isInteger(days)) {
    throw new Error(`isoDateInDaysLocal: days must be a finite integer, got ${String(days)}`);
  }
  const dt = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return localDateToDateOnly(dt);
}

/**
 * Exact calendar-day difference between two date-only values (b - a).
 * Computed from validated y/m/d components via the pure civil-date
 * ordinal — no elapsed-milliseconds subtraction, no rounding, no
 * dependence on the host time zone or DST.
 */
export function calendarDaysBetween(aISO: string, bISO: string): number {
  const a = parseDateOnly(aISO);
  const b = parseDateOnly(bISO);
  if (!a) throw new Error(`Invalid date-only value: ${JSON.stringify(aISO)}`);
  if (!b) throw new Error(`Invalid date-only value: ${JSON.stringify(bISO)}`);
  return civilOrdinal(b.y, b.m, b.d) - civilOrdinal(a.y, a.m, a.d);
}

/** Local-calendar days until a date-only string, from `now` (default today). */
export function daysUntilLocal(dateISO: string, now: Date = new Date()): number {
  const today = localDateToDateOnly(now);
  return calendarDaysBetween(today, dateISO);
}

/**
 * Format a date-only value with `Intl` while keeping the calendar day
 * stable across time zones (constructed from local components).
 */
export function formatDateOnly(
  s: string,
  opts: Intl.DateTimeFormatOptions,
  locale?: string,
): string {
  return dateOnlyToLocalDate(s).toLocaleDateString(locale, opts);
}

/**
 * `YYYYMMDD` all-day stamp for ICS/Google calendar. Passes through digits
 * only after strict validation.
 */
export function toAllDayStamp(s: string): string {
  if (!isValidDateOnly(s)) throw new Error(`Invalid date-only value: ${JSON.stringify(s)}`);
  return s.replace(/-/g, "");
}

/**
 * Add days to an all-day stamp value (used for ICS DTEND, which is
 * exclusive). Returns `YYYYMMDD`.
 */
export function allDayStampPlusDays(s: string, days: number): string {
  return toAllDayStamp(addDaysDateOnly(s, days));
}

/**
 * Parse a wall-clock time.
 *
 * - 24-hour form `HH:MM` (or `H:MM`) requires hour 0..23, minute 0..59.
 * - 12-hour form `H:MM AM|PM` requires hour 1..12, minute 0..59.
 *
 * Combinations that mix the two conventions ("13:00 PM", "00:30 PM",
 * "00:00 AM") are rejected. Leading/trailing whitespace is trimmed;
 * any other whitespace inside the value is rejected.
 */
export function parseWallClockTime(t: string | null | undefined): { h: number; m: number } | null {
  if (t == null || typeof t !== "string") return null;
  const trimmed = t.trim();
  if (!trimmed) return null;
  const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(trimmed);
  if (!match) return null;
  const rawH = Number(match[1]);
  const m = Number(match[2]);
  const ap = match[3]?.toUpperCase() as "AM" | "PM" | undefined;
  if (!Number.isInteger(rawH) || !Number.isInteger(m)) return null;
  if (m < 0 || m > 59) return null;

  if (ap) {
    // 12-hour: hour must be 1..12, and the raw match must not be "00".
    if (rawH < 1 || rawH > 12) return null;
    const h = ap === "PM" ? (rawH === 12 ? 12 : rawH + 12) : rawH === 12 ? 0 : rawH;
    return { h, m };
  }

  // 24-hour form: hour must be 0..23.
  if (rawH < 0 || rawH > 23) return null;
  return { h: rawH, m };
}

/**
 * Build a local Date at (date, wall-clock time). Times are treated as the
 * viewer's local wall-clock. If host time zone becomes captured later,
 * swap this for a TZ-aware helper.
 */
export function combineDateAndTime(dateISO: string, time: { h: number; m: number } | null): Date {
  const parts = parseDateOnly(dateISO);
  if (!parts) throw new Error(`Invalid date-only value: ${JSON.stringify(dateISO)}`);
  const t = time ?? { h: 0, m: 0 };
  return new Date(parts.y, parts.m - 1, parts.d, t.h, t.m, 0, 0);
}

/** `YYYYMMDDTHHMMSS` local stamp for ICS/Google (floating local time). */
export function toLocalCalendarStamp(d: Date): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new Error("toLocalCalendarStamp: Invalid Date");
  }
  const y = d.getFullYear();
  const mo = pad2(d.getMonth() + 1);
  const da = pad2(d.getDate());
  const h = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  return `${pad4(y)}${mo}${da}T${h}${mi}00`;
}

/** `YYYYMMDDTHHMMSSZ` UTC stamp — required for ICS DTSTAMP (RFC 5545). */
export function toUtcIcsStamp(d: Date = new Date()): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new Error("toUtcIcsStamp: Invalid Date");
  }
  return (
    `${pad4(d.getUTCFullYear())}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}
