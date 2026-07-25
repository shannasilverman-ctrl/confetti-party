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
 * Rules enforced by this module:
 *   1. Strict `YYYY-MM-DD` validation (month 1-12, day 1-31, real calendar).
 *   2. All Date construction goes through numeric local components:
 *      `new Date(y, m - 1, d)`.
 *   3. Calendar-day math uses local components, never rounded ms.
 */

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type DateOnlyParts = { y: number; m: number; d: number };

/**
 * Strictly validate a `YYYY-MM-DD` string and return numeric components.
 * Returns `null` for anything not a real calendar date.
 */
export function parseDateOnly(s: string | null | undefined): DateOnlyParts | null {
  if (!s || typeof s !== "string") return null;
  const match = RE.exec(s);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // Reject invalid days (Feb 30, Apr 31, etc.) by round-tripping through a
  // local Date and re-checking the components.
  const probe = new Date(y, m - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) {
    return null;
  }
  return { y, m, d };
}

export function isValidDateOnly(s: string | null | undefined): boolean {
  return parseDateOnly(s) !== null;
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

/** Format the current local Date's calendar day back into `YYYY-MM-DD`. */
export function localDateToDateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Local calendar today as `YYYY-MM-DD`. */
export function todayDateOnly(now: Date = new Date()): string {
  return localDateToDateOnly(now);
}

/**
 * Add `days` calendar days to a date-only string. Uses local components,
 * so DST transitions never off-by-one the result.
 */
export function addDaysDateOnly(s: string, days: number): string {
  const { y, m, d } = parseDateOnly(s) ?? { y: 0, m: 0, d: 0 };
  if (!m) throw new Error(`Invalid date-only value: ${JSON.stringify(s)}`);
  const dt = new Date(y, m - 1, d + days);
  return localDateToDateOnly(dt);
}

/**
 * ISO date `days` days from `base` (default today), computed against LOCAL
 * calendar. Returns `YYYY-MM-DD`.
 */
export function isoDateInDaysLocal(days: number, base: Date = new Date()): string {
  const dt = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return localDateToDateOnly(dt);
}

/**
 * Difference between two date-only values in calendar days (b - a). Uses
 * local components so DST does not distort the count.
 */
export function calendarDaysBetween(aISO: string, bISO: string): number {
  const a = parseDateOnly(aISO);
  const b = parseDateOnly(bISO);
  if (!a) throw new Error(`Invalid date-only value: ${JSON.stringify(aISO)}`);
  if (!b) throw new Error(`Invalid date-only value: ${JSON.stringify(bISO)}`);
  // UTC is used only as a stable calendar ordinal. These are not instants and
  // are never shown to the user, so DST and the viewer's time zone cannot
  // distort the number of crossed calendar boundaries.
  const aOrdinal = Date.UTC(a.y, a.m - 1, a.d) / 86_400_000;
  const bOrdinal = Date.UTC(b.y, b.m - 1, b.d) / 86_400_000;
  return bOrdinal - aOrdinal;
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

/** Parse `HH:MM` or `H:MM AM/PM` into 24h components; returns null if bad. */
export function parseWallClockTime(t: string | null | undefined): { h: number; m: number } | null {
  if (!t) return null;
  const match = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let h = Number(match[1]);
  const m = Number(match[2]);
  const ap = match[3]?.toUpperCase();
  if (ap && (h < 1 || h > 12)) return null;
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  if (h > 23 || m > 59) return null;
  return { h, m };
}

/**
 * Build a local Date at (date, wall-clock time). Times are treated as the
 * viewer's local wall-clock. If host time zone becomes captured later,
 * swap this for a TZ-aware helper.
 */
export function combineDateAndTime(dateISO: string, time: { h: number; m: number } | null): Date {
  const { y, m, d } = parseDateOnly(dateISO) ?? { y: 0, m: 0, d: 0 };
  if (!m) throw new Error(`Invalid date-only value: ${JSON.stringify(dateISO)}`);
  const t = time ?? { h: 0, m: 0 };
  return new Date(y, m - 1, d, t.h, t.m, 0, 0);
}

/** `YYYYMMDDTHHMMSS` local stamp for ICS/Google (floating local time). */
export function toLocalCalendarStamp(d: Date): string {
  const y = d.getFullYear();
  const mo = pad2(d.getMonth() + 1);
  const da = pad2(d.getDate());
  const h = pad2(d.getHours());
  const mi = pad2(d.getMinutes());
  return `${y}${mo}${da}T${h}${mi}00`;
}

/** `YYYYMMDDTHHMMSSZ` UTC stamp for ICS metadata such as DTSTAMP. */
export function toUtcCalendarStamp(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = pad2(d.getUTCMonth() + 1);
  const da = pad2(d.getUTCDate());
  const h = pad2(d.getUTCHours());
  const mi = pad2(d.getUTCMinutes());
  const s = pad2(d.getUTCSeconds());
  return `${y}${mo}${da}T${h}${mi}${s}Z`;
}
