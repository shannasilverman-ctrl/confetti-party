import {
  allDayStampPlusDays,
  combineDateAndTime,
  parseDateOnly,
  parseWallClockTime,
  toAllDayStamp,
  toLocalCalendarStamp,
  toUtcCalendarStamp,
} from "@/lib/date-only";

export type CalendarParty = {
  name: string;
  date: string;
  start_time?: string | null;
  location?: string | null;
  details?: string | null;
};

const DEFAULT_DETAILS = "See you there — sent via Confetti.";

function buildCalendarPayload(party: CalendarParty) {
  // Until the host's time zone is captured, event times remain floating wall
  // times. Adding three to the hour (instead of elapsed milliseconds) keeps a
  // three-hour party a three-hour wall-clock event across DST transitions.
  const time = parseWallClockTime(party.start_time);
  if (time) {
    const date = parseDateOnly(party.date);
    if (!date) throw new Error("Party has an invalid date");
    const start = combineDateAndTime(party.date, time);
    const end = new Date(date.y, date.m - 1, date.d, time.h + 3, time.m, 0, 0);
    return {
      googleDates: `${toLocalCalendarStamp(start)}/${toLocalCalendarStamp(end)}`,
      icsStart: toLocalCalendarStamp(start),
      icsEnd: toLocalCalendarStamp(end),
      icsAllDay: false,
    };
  }

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
  const source = [party.name, party.date, party.start_time ?? "", party.location ?? ""].join(
    "\u001f",
  );
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
