import type { Bucket } from "@/lib/party-context";
import { addDaysDateOnly, formatDateOnly, isValidDateOnly, todayDateOnly } from "@/lib/date-only";

export type TaskTimingWindow = {
  startDate: string;
  endDate: string;
  reminderDate: string;
  windowLabel: string;
  reminderLabel: string;
  isDueNow: boolean;
  isPastParty: boolean;
};

const BUCKET_OFFSETS: Record<Bucket, { start: number; end: number }> = {
  "6+ weeks out": { start: -42, end: -42 },
  "3-5 weeks": { start: -35, end: -21 },
  "1-2 weeks": { start: -14, end: -7 },
  "Party week": { start: -6, end: -1 },
  "Day of": { start: 0, end: 0 },
};

function shortDate(date: string, includeYear = false): string {
  return formatDateOnly(
    date,
    includeYear
      ? { month: "short", day: "numeric", year: "numeric" }
      : { month: "short", day: "numeric" },
    "en-US",
  );
}

function rangeLabel(startDate: string, endDate: string): string {
  if (startDate === endDate) return shortDate(startDate);
  const startYear = startDate.slice(0, 4);
  const endYear = endDate.slice(0, 4);
  if (startYear !== endYear) {
    return `${shortDate(startDate, true)}–${shortDate(endDate, true)}`;
  }
  const startMonth = startDate.slice(5, 7);
  const endMonth = endDate.slice(5, 7);
  if (startMonth === endMonth) {
    return `${shortDate(startDate)}–${formatDateOnly(endDate, { day: "numeric" }, "en-US")}`;
  }
  return `${shortDate(startDate)}–${shortDate(endDate)}`;
}

/**
 * Translate Confetti's party-relative buckets into concrete local-calendar
 * dates. The reminder lands at the end of the suggested window, then clamps
 * to today when that window has passed but the party is still ahead.
 */
export function taskTimingWindow(
  partyDate: string,
  bucket: Bucket,
  today = todayDateOnly(),
): TaskTimingWindow | null {
  if (!isValidDateOnly(partyDate) || !isValidDateOnly(today)) return null;
  const offsets = BUCKET_OFFSETS[bucket];
  const startDate = addDaysDateOnly(partyDate, offsets.start);
  const endDate = addDaysDateOnly(partyDate, offsets.end);
  const isPastParty = partyDate < today;
  const isDueNow = !isPastParty && endDate < today;
  const reminderDate = isDueNow ? today : endDate;
  const dateRange = rangeLabel(startDate, endDate);
  const windowLabel =
    bucket === "Day of"
      ? `On ${dateRange}`
      : startDate === endDate
        ? `By ${dateRange}`
        : `${dateRange}`;

  return {
    startDate,
    endDate,
    reminderDate,
    windowLabel,
    reminderLabel: isDueNow ? `Do next · ${shortDate(today)}` : `Remind me ${shortDate(endDate)}`,
    isDueNow,
    isPastParty,
  };
}
