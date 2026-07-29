import { describe, expect, it } from "vitest";
import { retrospectiveCarryForwardTasks } from "@/lib/retrospective-reuse";

describe("retrospectiveCarryForwardTasks", () => {
  it("turns only actionable lessons into transparent planning tasks", () => {
    let nextId = 0;
    const tasks = retrospectiveCarryForwardTasks(
      {
        updatedAt: "2027-01-01T00:00:00.000Z",
        worked: "The self-serve drink station was perfect.",
        ranOut: "Ice and kid-friendly drinks",
        changeNext: "Move dessert before the final match",
      },
      () => `retro-${++nextId}`,
    );

    expect(tasks).toEqual([
      expect.objectContaining({
        id: "retro-1",
        title: "Plan for what ran short last time",
        bucket: "1-2 weeks",
        done: false,
        reason: "Last time: Ice and kid-friendly drinks",
        action: "shopping",
      }),
      expect.objectContaining({
        id: "retro-2",
        title: "Apply the change you wanted next time",
        bucket: "3-5 weeks",
        done: false,
        reason: "You wanted to change: Move dessert before the final match",
        action: "overview",
      }),
    ]);
  });

  it("does not manufacture work from praise or blank notes", () => {
    expect(
      retrospectiveCarryForwardTasks(
        {
          updatedAt: "2027-01-01T00:00:00.000Z",
          worked: "Everything felt easy.",
          ranOut: "  ",
        },
        () => "unused",
      ),
    ).toEqual([]);
  });
});
