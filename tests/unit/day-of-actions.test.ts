import { describe, expect, it } from "vitest";
import { prioritizeDayOfTasks } from "@/lib/day-of-actions";
import { PLANNING_TASK_TITLES, type Task } from "@/lib/party-context";

function task(id: string, bucket: Task["bucket"], overrides: Partial<Task> = {}): Task {
  return { id, title: id, bucket, done: false, ...overrides };
}

describe("day-of action priority", () => {
  it("keeps assigned commitments visible before unowned work", () => {
    const result = prioritizeDayOfTasks([
      task("old planning", "3-5 weeks"),
      task("setup", "Day of"),
      task("confirm RSVPs", "Party week", { owner: "Casey" }),
      task("serve dessert", "Day of"),
    ]);

    expect(result.map(({ id }) => id)).toEqual(["confirm RSVPs", "setup", "serve dessert"]);
  });

  it("omits completed work and foundational planning decisions", () => {
    const result = prioritizeDayOfTasks([
      task("done", "Day of", { done: true }),
      task("date", "6+ weeks out", { title: PLANNING_TASK_TITLES.date }),
      task("arrival", "Day of"),
    ]);

    expect(result.map(({ id }) => id)).toEqual(["arrival"]);
  });
});
