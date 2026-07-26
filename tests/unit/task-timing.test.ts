import { describe, expect, it } from "vitest";
import { taskTimingWindow } from "@/lib/task-timing";

describe("task timing", () => {
  it.each([
    ["6+ weeks out", "2027-07-04", "2027-07-04", "By Jul 4"],
    ["3-5 weeks", "2027-07-11", "2027-07-25", "Jul 11–25"],
    ["1-2 weeks", "2027-08-01", "2027-08-08", "Aug 1–8"],
    ["Party week", "2027-08-09", "2027-08-14", "Aug 9–14"],
    ["Day of", "2027-08-15", "2027-08-15", "On Aug 15"],
  ] as const)("turns %s into a concrete planning window", (bucket, start, end, label) => {
    const timing = taskTimingWindow("2027-08-15", bucket, "2027-01-01");

    expect(timing).toMatchObject({
      startDate: start,
      endDate: end,
      reminderDate: end,
      windowLabel: label,
      isDueNow: false,
      isPastParty: false,
    });
  });

  it("keeps years visible when a window crosses New Year's", () => {
    const timing = taskTimingWindow("2027-01-25", "3-5 weeks", "2026-01-01");
    expect(timing?.windowLabel).toBe("Dec 21, 2026–Jan 4, 2027");
  });

  it("moves an overdue planning reminder to today while the party is still ahead", () => {
    const timing = taskTimingWindow("2027-08-15", "3-5 weeks", "2027-08-01");
    expect(timing).toMatchObject({
      reminderDate: "2027-08-01",
      reminderLabel: "Do next · Aug 1",
      isDueNow: true,
      isPastParty: false,
    });
  });

  it("marks past parties and rejects invalid dates", () => {
    expect(taskTimingWindow("2027-08-15", "Day of", "2027-08-16")?.isPastParty).toBe(true);
    expect(taskTimingWindow("not-a-date", "Day of", "2027-08-16")).toBeNull();
  });
});
