import { isValidDateOnly, todayDateOnly } from "@/lib/date-only";
import type { TimelineItem } from "@/lib/party-context";

export type ScheduledTimelineItem = {
  item: TimelineItem;
  minutes: number;
};

export type DayOfRunSheetPhase = "empty" | "preview" | "before" | "live" | "past";

export type DayOfRunSheet = {
  phase: DayOfRunSheetPhase;
  scheduled: ScheduledTimelineItem[];
  untimed: TimelineItem[];
  current: ScheduledTimelineItem | null;
  next: ScheduledTimelineItem | null;
  following: ScheduledTimelineItem | null;
  minutesUntilNext: number | null;
};

function parseAbsoluteMinutes(value: string | null | undefined): number | null {
  const text = value?.trim();
  if (!text) return null;

  const twelveHour = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i.exec(text);
  if (twelveHour) {
    const hour = Number(twelveHour[1]);
    const minute = Number(twelveHour[2] ?? "0");
    if (hour < 1 || hour > 12 || minute > 59) return null;
    return (hour % 12) * 60 + minute + (twelveHour[3].toLowerCase() === "p" ? 12 * 60 : 0);
  }

  const twentyFourHour = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(text);
  if (twentyFourHour) return Number(twentyFourHour[1]) * 60 + Number(twentyFourHour[2]);

  return null;
}

function parseTimelineMinutes(value: string, startMinutes: number | null): number | null {
  const text = value.trim();
  if (/^start$/i.test(text)) return startMinutes;

  const relative = /^([+-])\s*(\d+)\s*(m|min|mins|minutes?|h|hr|hrs|hours?)$/i.exec(text);
  if (relative && startMinutes != null) {
    const quantity = Number(relative[2]);
    const unitMinutes = relative[3].toLowerCase().startsWith("h") ? 60 : 1;
    const delta = quantity * unitMinutes * (relative[1] === "-" ? -1 : 1);
    return startMinutes + delta;
  }

  return parseAbsoluteMinutes(text);
}

export function resolveScheduledTimeline(
  timeline: TimelineItem[],
  startTime?: string,
): { scheduled: ScheduledTimelineItem[]; untimed: TimelineItem[] } {
  const startMinutes = parseAbsoluteMinutes(startTime);
  const scheduled: Array<ScheduledTimelineItem & { index: number }> = [];
  const untimed: TimelineItem[] = [];

  timeline.forEach((item, index) => {
    const minutes = parseTimelineMinutes(item.time, startMinutes);
    if (minutes == null) {
      untimed.push(item);
      return;
    }
    scheduled.push({ item, minutes, index });
  });

  scheduled.sort((a, b) => a.minutes - b.minutes || a.index - b.index);
  return {
    scheduled: scheduled.map(({ item, minutes }) => ({ item, minutes })),
    untimed,
  };
}

export function dayOfRunSheet(
  partyDate: string,
  startTime: string | undefined,
  timeline: TimelineItem[],
  now = new Date(),
): DayOfRunSheet {
  const { scheduled, untimed } = resolveScheduledTimeline(timeline, startTime);
  const today = todayDateOnly(now);

  if (scheduled.length === 0) {
    return {
      phase: "empty",
      scheduled,
      untimed,
      current: null,
      next: null,
      following: null,
      minutesUntilNext: null,
    };
  }

  if (!isValidDateOnly(partyDate) || partyDate > today) {
    return {
      phase: "preview",
      scheduled,
      untimed,
      current: null,
      next: scheduled[0],
      following: scheduled[1] ?? null,
      minutesUntilNext: null,
    };
  }

  if (partyDate < today) {
    return {
      phase: "past",
      scheduled,
      untimed,
      current: scheduled.at(-1) ?? null,
      next: null,
      following: null,
      minutesUntilNext: null,
    };
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const nextIndex = scheduled.findIndex(({ minutes }) => minutes > currentMinutes);
  const currentIndex = nextIndex === -1 ? scheduled.length - 1 : nextIndex - 1;
  const current = currentIndex >= 0 ? scheduled[currentIndex] : null;
  const next = nextIndex >= 0 ? scheduled[nextIndex] : null;

  return {
    phase: current ? "live" : "before",
    scheduled,
    untimed,
    current,
    next,
    following: nextIndex >= 0 ? (scheduled[nextIndex + 1] ?? null) : null,
    minutesUntilNext: next ? Math.max(0, next.minutes - currentMinutes) : null,
  };
}

export function formatMinutesUntil(minutes: number | null): string | null {
  if (minutes == null) return null;
  if (minutes <= 0) return "Starting now";
  if (minutes < 60) return `In ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const hourLabel = `${hours} hr`;
  return remainder === 0 ? `In ${hourLabel}` : `In ${hourLabel} ${remainder} min`;
}
