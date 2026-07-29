import { describe, expect, it } from "vitest";
import {
  dayOfRunSheet,
  formatMinutesUntil,
  resolveScheduledTimeline,
} from "@/lib/day-of-run-sheet";
import type { TimelineItem } from "@/lib/party-context";

const timeline: TimelineItem[] = [
  { id: "arrival", time: "4:30 PM", activity: "Guests arrive" },
  { id: "ceremony", time: "5:30 PM", activity: "Ceremony" },
  { id: "dinner", time: "7:30 PM", activity: "Dinner" },
];

describe("day-of run sheet", () => {
  it("sorts absolute and relative times while preserving flexible items", () => {
    const result = resolveScheduledTimeline(
      [
        { id: "late", time: "+90 min", activity: "Dessert" },
        { id: "flex", time: "", activity: "Take photos when it feels right" },
        { id: "early", time: "-30 min", activity: "Host ready" },
        { id: "start", time: "Start", activity: "Doors open" },
      ],
      "6:00 PM",
    );

    expect(result.scheduled.map(({ item, minutes }) => [item.id, minutes])).toEqual([
      ["early", 17 * 60 + 30],
      ["start", 18 * 60],
      ["late", 19 * 60 + 30],
    ]);
    expect(result.untimed.map(({ id }) => id)).toEqual(["flex"]);
  });

  it("shows the current and next scheduled moments on the gathering date", () => {
    const result = dayOfRunSheet("2026-07-29", "5:30 PM", timeline, new Date(2026, 6, 29, 18, 10));

    expect(result).toMatchObject({
      phase: "live",
      current: { item: { id: "ceremony" } },
      next: { item: { id: "dinner" } },
      minutesUntilNext: 80,
    });
  });

  it("shows an honest before-start state and countdown", () => {
    const result = dayOfRunSheet("2026-07-29", "5:30 PM", timeline, new Date(2026, 6, 29, 16, 0));

    expect(result).toMatchObject({
      phase: "before",
      current: null,
      next: { item: { id: "arrival" } },
      following: { item: { id: "ceremony" } },
      minutesUntilNext: 30,
    });
  });

  it("previews future run sheets without pretending they are live", () => {
    const result = dayOfRunSheet("2027-05-22", "5:30 PM", timeline, new Date(2026, 6, 29, 18, 10));

    expect(result).toMatchObject({
      phase: "preview",
      current: null,
      next: { item: { id: "arrival" } },
      following: { item: { id: "ceremony" } },
      minutesUntilNext: null,
    });
  });

  it("does not invent a live position for untimed or past run sheets", () => {
    expect(
      dayOfRunSheet(
        "2026-07-29",
        undefined,
        [{ id: "flex", time: "", activity: "Toast when ready" }],
        new Date(2026, 6, 29, 18),
      ),
    ).toMatchObject({ phase: "empty", current: null, next: null });

    expect(
      dayOfRunSheet("2026-07-28", "5:30 PM", timeline, new Date(2026, 6, 29, 18)),
    ).toMatchObject({
      phase: "past",
      current: { item: { id: "dinner" } },
      next: null,
    });
  });

  it("formats countdowns without false precision", () => {
    expect(formatMinutesUntil(null)).toBeNull();
    expect(formatMinutesUntil(0)).toBe("Starting now");
    expect(formatMinutesUntil(25)).toBe("In 25 min");
    expect(formatMinutesUntil(60)).toBe("In 1 hr");
    expect(formatMinutesUntil(80)).toBe("In 1 hr 20 min");
  });
});
