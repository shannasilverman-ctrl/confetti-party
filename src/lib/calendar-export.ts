import {
  allDayStampPlusDays,
  parseDateOnly,
  parseWallClockTime,
  toAllDayStamp,
  toUtcCalendarStamp,
} from "@/lib/date-only";

export type CalendarParty = {
  name: string;
  date: string;
  start_time?: string | null;
  event_time_zone?: string | null;
  location?: string | null;
  details?: string | null;
};

const DEFAULT_DETAILS = "See you there — sent via Confetti.";

export function isValidEventTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 3 || value.length > 80) return false;
  if (value !== "UTC" && !/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function deviceEventTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidEventTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

function zonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    y: read("year"),
    m: read("month"),
    d: read("day"),
    h: read("hour"),
    min: read("minute"),
    s: read("second"),
  };
}

function sameWallTime(left: ReturnType<typeof zonedParts>, right: ReturnType<typeof zonedParts>) {
  return (
    left.y === right.y &&
    left.m === right.m &&
    left.d === right.d &&
    left.h === right.h &&
    left.min === right.min &&
    left.s === right.s
  );
}

/** Convert an IANA-zoned wall time to its absolute instant, independent of the viewer's zone. */
export function zonedWallTimeToUtc(date: string, time: string, timeZone: string): Date {
  const day = parseDateOnly(date);
  const clock = parseWallClockTime(time);
  if (!day || !clock) throw new Error("Party has an invalid date or time");
  if (!isValidEventTimeZone(timeZone)) throw new Error("Party has an invalid time zone");

  const desired = { y: day.y, m: day.m, d: day.d, h: clock.h, min: clock.m, s: 0 };
  const desiredAsUtc = Date.UTC(day.y, day.m - 1, day.d, clock.h, clock.m, 0, 0);
  let instantMs = desiredAsUtc;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = zonedParts(new Date(instantMs), timeZone);
    const actualAsUtc = Date.UTC(actual.y, actual.m - 1, actual.d, actual.h, actual.min, actual.s);
    const correction = desiredAsUtc - actualAsUtc;
    if (correction === 0) break;
    instantMs += correction;
  }

  const instant = new Date(instantMs);
  if (!sameWallTime(zonedParts(instant, timeZone), desired)) {
    throw new Error("Party time does not exist in the selected time zone");
  }
  return instant;
}

function localStamp(date: Date): string {
  return [
    date.getUTCFullYear().toString().padStart(4, "0"),
    (date.getUTCMonth() + 1).toString().padStart(2, "0"),
    date.getUTCDate().toString().padStart(2, "0"),
    "T",
    date.getUTCHours().toString().padStart(2, "0"),
    date.getUTCMinutes().toString().padStart(2, "0"),
    "00",
  ].join("");
}

export type CalendarExportIssue = "invalid-time" | "missing-time-zone" | "invalid-wall-time";

export function calendarExportIssue(party: CalendarParty): CalendarExportIssue | null {
  if (!party.start_time?.trim()) return null;
  if (!parseWallClockTime(party.start_time)) return "invalid-time";
  if (!isValidEventTimeZone(party.event_time_zone)) return "missing-time-zone";
  try {
    zonedWallTimeToUtc(party.date, party.start_time, party.event_time_zone);
    return null;
  } catch {
    return "invalid-wall-time";
  }
}

function buildCalendarPayload(party: CalendarParty) {
  const time = parseWallClockTime(party.start_time);
  if (time) {
    const date = parseDateOnly(party.date);
    if (!date) throw new Error("Party has an invalid date");
    if (!isValidEventTimeZone(party.event_time_zone)) {
      throw new Error("Party needs a valid event time zone");
    }
    const start = zonedWallTimeToUtc(party.date, party.start_time!, party.event_time_zone);
    const endWall = new Date(Date.UTC(date.y, date.m - 1, date.d, time.h + 3, time.m, 0, 0));
    const endDate = [
      endWall.getUTCFullYear().toString().padStart(4, "0"),
      (endWall.getUTCMonth() + 1).toString().padStart(2, "0"),
      endWall.getUTCDate().toString().padStart(2, "0"),
    ].join("-");
    const endTime = `${endWall.getUTCHours().toString().padStart(2, "0")}:${endWall
      .getUTCMinutes()
      .toString()
      .padStart(2, "0")}`;
    const end = zonedWallTimeToUtc(endDate, endTime, party.event_time_zone);
    const startWall = new Date(Date.UTC(date.y, date.m - 1, date.d, time.h, time.m, 0, 0));
    return {
      googleDates: `${localStamp(startWall)}/${localStamp(endWall)}`,
      icsStart: toUtcCalendarStamp(start),
      icsEnd: toUtcCalendarStamp(end),
      icsAllDay: false,
    };
  }
  if (party.start_time?.trim()) throw new Error("Party has an invalid start time");

  const startStamp = toAllDayStamp(party.date);
  const endStamp = allDayStampPlusDays(party.date, 1);
  return {
    googleDates: `${startStamp}/${endStamp}`,
    icsStart: startStamp,
    icsEnd: endStamp,
    icsAllDay: true,
  };
}

export function googleCalUrl(party: CalendarParty): string {
  const payload = buildCalendarPayload(party);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: party.name,
    dates: payload.googleDates,
    details: party.details ?? DEFAULT_DETAILS,
  });
  if (party.location) params.set("location", party.location);
  if (payload.icsAllDay === false && isValidEventTimeZone(party.event_time_zone)) {
    params.set("ctz", party.event_time_zone);
  }
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** Fold an RFC 5545 content line to no more than 75 UTF-8 octets. */
export function foldIcsLine(line: string): string[] {
  const output: string[] = [];
  let current = "";
  let byteLimit = 75;

  for (const character of line) {
    const candidate = current + character;
    if (new TextEncoder().encode(candidate).length > byteLimit && current) {
      output.push(output.length === 0 ? current : ` ${current}`);
      current = character;
      byteLimit = 74;
    } else {
      current = candidate;
    }
  }

  output.push(output.length === 0 ? current : ` ${current}`);
  return output;
}

function stableUid(party: CalendarParty): string {
  const source = [
    party.name,
    party.date,
    party.start_time ?? "",
    party.event_time_zone ?? "",
    party.location ?? "",
  ].join("\u001f");
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `confetti-${(hash >>> 0).toString(16).padStart(8, "0")}@confettiapp.ai`;
}

export function buildIcs(party: CalendarParty, generatedAt: Date = new Date()): string {
  const payload = buildCalendarPayload(party);
  const logicalLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Confetti//RSVP//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${stableUid(party)}`,
    `DTSTAMP:${toUtcCalendarStamp(generatedAt)}`,
    payload.icsAllDay ? `DTSTART;VALUE=DATE:${payload.icsStart}` : `DTSTART:${payload.icsStart}`,
    payload.icsAllDay ? `DTEND;VALUE=DATE:${payload.icsEnd}` : `DTEND:${payload.icsEnd}`,
    `SUMMARY:${escapeIcsText(party.name)}`,
    party.location ? `LOCATION:${escapeIcsText(party.location)}` : null,
    `DESCRIPTION:${escapeIcsText(party.details ?? DEFAULT_DETAILS)}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((line): line is string => line !== null);

  return `${logicalLines.flatMap(foldIcsLine).join("\r\n")}\r\n`;
}
