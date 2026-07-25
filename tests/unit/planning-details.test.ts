import { describe, expect, it } from "vitest";
import {
  makeParty,
  openPlanningDetails,
  planningDetailForTask,
  planningDetailIsOpen,
  resolvePlanningDetails,
  type Task,
} from "@/lib/party-context";

const openDateTask: Task = {
  id: "date-task",
  title: "Choose the party date",
  bucket: "6+ weeks out",
  done: false,
};

function partyWithOpenDate() {
  return makeParty(
    {
      name: "Neighborhood potluck",
      occasion: "other",
      date: "2026-08-22",
      guestEstimate: 0,
      budget: 0,
      theme: "Make it yours",
      extraTasks: [openDateTask],
    },
    "party-open-date",
  );
}

describe("open planning details", () => {
  it("identifies special planning tasks without treating ordinary tasks as details", () => {
    expect(planningDetailForTask(openDateTask)).toBe("date");
    expect(
      planningDetailForTask({
        title: "Order the cake",
      }),
    ).toBeUndefined();
  });

  it("keeps a skipped date open until the real detail flow resolves it", () => {
    const party = partyWithOpenDate();

    expect(planningDetailIsOpen(party, "date")).toBe(true);
    expect(openPlanningDetails(party)).toEqual(["date"]);

    const resolved = resolvePlanningDetails({ ...party, date: "2026-09-12" }, ["date"]);
    expect(planningDetailIsOpen(resolved, "date")).toBe(false);
    expect(openPlanningDetails(resolved)).toEqual([]);
    expect(resolved.date).toBe("2026-09-12");
  });
});
