/**
 * RFC 5545 ICS event serializer + Google Calendar URL builder.
 *
 * We hand-roll a small, well-tested serializer instead of pulling in a
 * dependency so the output is predictable and easy to audit.
 *
 * Design notes:
 *  - DTSTAMP is UTC with the trailing `Z` (RFC 5545 §3.8.7.2 requires it).
 *  - Timed events use `DTSTART`/`DTEND` in floating local time because
 *    Confetti does not yet capture a host IANA time zone. The invite UI
 *    surfaces this explicitly so guests aren't misled.
 *  - All-day events use `DTSTART;VALUE=DATE:YYYYMMDD` and an exclusive
 *    `DTEND` (§3.8.2.2).
 *  - Property values escape CR, LF, comma, semicolon, and backslash
 *    (§3.3.11) so no attacker-controlled field can inject a new property.
 *  - Long content lines are folded at 75 octets with CRLF + single space
 *    (§3.1 "Content Lines"). We measure in UTF-8 bytes.
 *  - The final output ends with CRLF (§3.4 "iCalendar Object").
 *  - `UID` is stable per invite (see `stableIcsUid`), so a re-download
 *    updates the existing event in the calendar client instead of adding
 *    a duplicate. It never contains the raw invite token.
 */

import {
  toAllDayStamp,
  allDayStampPlusDays,
  parseWallClockTime,
  combineDateAndTime,
  toLocalCalendarStamp,
  toUtcIcsStamp,
  parseDateOnly,
} from "./date-only";

export type CalendarInput = {
  /** `YYYY-MM-DD` date-only. */
  date: string;
  /** Optional host-entered wall-clock start time. Missing = all-day event. */
  startTime?: string | null;
  /** Timed events default to a 3-hour block. Override in hours. */
  durationHours?: number;
  /** Event title. */
  title: string;
  /** Optional location line. */
  location?: string | null;
  /** Optional plain-text description. */
  description?: string | null;
  /** Stable seed used to derive UID (e.g. RSVP token). Never appears verbatim. */
  uidSeed: string;
  /** Domain used for the UID @-part. Defaults to `confetti-party.lovable.app`. */
  uidHost?: string;
};

/**
 * Small non-cryptographic 32-bit FNV-1a hash rendered as 8 lowercase hex
 * chars. Used to derive a stable, opaque UID token from a secret without
 * putting the secret in visible ICS text. Not a security primitive.
 */
export function fnv1a32(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // Multiply by FNV prime 16777619, keep 32 bits.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Deterministic UID for an invite-scoped event. Same seed → same UID, so
 * re-downloading the ICS updates the same calendar entry instead of
 * creating a duplicate.
 */
export function stableIcsUid(uidSeed: string, uidHost = "confetti-party.lovable.app"): string {
  // Namespaced so multiple invite events for one token stay unique but
  // deterministic across downloads.
  return `confetti-invite-${fnv1a32(`confetti:invite:${uidSeed}`)}@${uidHost}`;
}

/**
 * Escape an ICS TEXT-typed property value per RFC 5545 §3.3.11.
 * Backslash first, then the other reserved characters.
 */
export function escapeIcsText(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n/g, "\\n")
    .replace(/\r/g, "\\n")
    .replace(/\n/g, "\\n");
}

/**
 * Fold a single content line to <=75 octets per line (RFC 5545 §3.1).
 * Continuation lines start with a single space. We count UTF-8 bytes so
 * emoji / non-ASCII characters don't overflow.
 */
export function foldIcsLine(line: string): string {
  const enc = new TextEncoder();
  const bytes = enc.encode(line);
  if (bytes.length <= 75) return line;
  const dec = new TextDecoder();
  const parts: string[] = [];
  let offset = 0;
  let first = true;
  while (offset < bytes.length) {
    // First line is 75 octets max; continuation lines are 74 (they cost a
    // leading space octet).
    const budget = first ? 75 : 74;
    let end = Math.min(offset + budget, bytes.length);
    // Don't split inside a UTF-8 continuation byte (0b10xxxxxx).
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    const chunk = dec.decode(bytes.subarray(offset, end));
    parts.push(first ? chunk : ` ${chunk}`);
    offset = end;
    first = false;
  }
  return parts.join("\r\n");
}

function assembleLines(props: Array<[string, string | null]>): string[] {
  return props
    .filter((p): p is [string, string] => p[1] !== null && p[1] !== "")
    .map(([k, v]) => foldIcsLine(`${k}:${v}`));
}

function timedPayload(input: CalendarInput) {
  const time = parseWallClockTime(input.startTime ?? null);
  if (!time) return null;
  const start = combineDateAndTime(input.date, time);
  const durMs = Math.max(15, (input.durationHours ?? 3) * 60) * 60 * 1000;
  const end = new Date(start.getTime() + durMs);
  return {
    allDay: false as const,
    start,
    end,
    dtStart: toLocalCalendarStamp(start),
    dtEnd: toLocalCalendarStamp(end),
  };
}

function allDayPayload(input: CalendarInput) {
  return {
    allDay: true as const,
    dtStart: toAllDayStamp(input.date),
    // DTEND is exclusive for VALUE=DATE.
    dtEnd: allDayStampPlusDays(input.date, 1),
  };
}

/**
 * Compute the calendar payload used by both Google URL and ICS builders.
 * Exposed so callers can render user-visible time labels from the same
 * source.
 */
export function calendarPayload(input: CalendarInput) {
  if (!parseDateOnly(input.date)) {
    throw new Error(`calendarPayload: invalid date ${JSON.stringify(input.date)}`);
  }
  if (!input.title || typeof input.title !== "string") {
    throw new Error("calendarPayload: title is required");
  }
  return timedPayload(input) ?? allDayPayload(input);
}

/** Build the `https://calendar.google.com/calendar/render?...` URL. */
export function buildGoogleCalendarUrl(input: CalendarInput): string {
  const p = calendarPayload(input);
  const dates = `${p.dtStart}/${p.dtEnd}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates,
  });
  if (input.description) params.set("details", input.description);
  if (input.location) params.set("location", input.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Build a fully-formed ICS document, terminated by CRLF. */
export function buildIcsDocument(input: CalendarInput, now: Date = new Date()): string {
  const p = calendarPayload(input);
  const uid = stableIcsUid(input.uidSeed, input.uidHost);
  const dtStamp = toUtcIcsStamp(now);

  const eventProps: Array<[string, string | null]> = [
    ["UID", uid],
    ["DTSTAMP", dtStamp],
    p.allDay ? ["DTSTART;VALUE=DATE", p.dtStart] : ["DTSTART", p.dtStart],
    p.allDay ? ["DTEND;VALUE=DATE", p.dtEnd] : ["DTEND", p.dtEnd],
    ["SUMMARY", escapeIcsText(input.title)],
    input.location ? ["LOCATION", escapeIcsText(input.location)] : ["LOCATION", null],
    input.description
      ? ["DESCRIPTION", escapeIcsText(input.description)]
      : ["DESCRIPTION", null],
  ];

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Confetti//RSVP//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    ...assembleLines(eventProps),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // RFC 5545 §3.4: iCalendar object ends with CRLF.
  return `${lines.join("\r\n")}\r\n`;
}

/** Suggested filename for a downloaded ICS. */
export function icsFilename(title: string): string {
  const safe = title.replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "");
  return `${safe || "party"}.ics`;
}
