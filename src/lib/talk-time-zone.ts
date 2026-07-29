import {
  calendarExportIssue,
  canonicalEventTimeZone,
  type CalendarExportIssue,
} from "@/lib/calendar-export";

export type TalkTimeZoneIssue = "missing-time-zone" | CalendarExportIssue;

export type TalkTimeZoneResolution = {
  eventTimeZone: string | null;
  issue: TalkTimeZoneIssue | null;
};

/**
 * Validate the host-confirmed zone before a Talk draft becomes a party.
 * A placeholder date is never used to make DST claims, but a timed party
 * still requires a zone so the real date can be added safely later.
 */
export function resolveTalkEventTimeZone(input: {
  date: string;
  startTime?: string | null;
  eventTimeZone?: string | null;
  dateIsPlaceholder?: boolean;
}): TalkTimeZoneResolution {
  if (!input.startTime?.trim()) return { eventTimeZone: null, issue: null };

  const eventTimeZone = canonicalEventTimeZone(input.eventTimeZone);
  if (!eventTimeZone) return { eventTimeZone: null, issue: "missing-time-zone" };
  if (input.dateIsPlaceholder) return { eventTimeZone, issue: null };

  const issue = calendarExportIssue({
    name: "Talk draft",
    date: input.date,
    start_time: input.startTime,
    event_time_zone: eventTimeZone,
  });
  return { eventTimeZone, issue };
}

export function talkTimeZoneIssueMessage(issue: TalkTimeZoneIssue | null): string | null {
  switch (issue) {
    case "missing-time-zone":
      return "Confirm the party's time zone so every guest sees the same moment.";
    case "invalid-date":
      return "Set a valid party date before confirming this time.";
    case "invalid-time":
      return "Set a valid party time before creating the plan.";
    case "nonexistent-wall-time":
      return "That local time does not exist because the clocks move forward. Choose another time.";
    case "ambiguous-wall-time":
      return "That local time happens twice because the clocks move back. Choose another time.";
    default:
      return null;
  }
}
