import { describe, expect, it } from "vitest";
import { rankNextPartyTasks } from "@/lib/next-party-actions";
import { PLANNING_TASK_TITLES, type Party, type Task } from "@/lib/party-context";

function task(id: string, bucket: Task["bucket"], title = id): Task {
  return { id, title, bucket, done: false };
}

function party(tasks: Task[], overrides: Partial<Party> = {}): Party {
  return {
    id: "party",
    name: "Eliana turns five",
    occasion: "birthday",
    date: "2027-08-15",
    startTime: "2:00 PM",
    location: "",
    guestEstimate: 12,
    budget: 500,
    theme: "Rainbow",
    hostNote: "",
    tasks,
    guests: [],
    bringBoard: [],
    budgetCategories: [],
    timeline: [],
    shoppingItems: [],
    pinnedInspiration: [],
    hostUpdates: [],
    ...overrides,
  };
}

describe("next party actions", () => {
  it("puts foundational open decisions before ordinary tasks", () => {
    const result = rankNextPartyTasks(
      party([
        task("decor", "1-2 weeks"),
        task("theme", "6+ weeks out", PLANNING_TASK_TITLES.theme),
        task("guests", "6+ weeks out", PLANNING_TASK_TITLES.guests),
        task("date", "6+ weeks out", PLANNING_TASK_TITLES.date),
      ]),
      "2027-01-01",
    );

    expect(result.slice(0, 3).map((item) => item.planningDetail)).toEqual([
      "date",
      "guests",
      "theme",
    ]);
    expect(result[0].phase).toBe("decision");
  });

  it("puts overdue work before tasks in their active or future window", () => {
    const result = rankNextPartyTasks(
      party([
        task("future", "Party week"),
        task("active", "1-2 weeks"),
        task("overdue", "3-5 weeks"),
      ]),
      "2027-08-05",
    );

    expect(result.map(({ task: item }) => item.id)).toEqual(["overdue", "active", "future"]);
    expect(result.map((item) => item.phase)).toEqual(["overdue", "active", "upcoming"]);
  });

  it("keeps completed work out of the recommendation", () => {
    const result = rankNextPartyTasks(
      party([{ ...task("done", "6+ weeks out"), done: true }, task("open", "Party week")]),
      "2027-08-01",
    );
    expect(result.map(({ task: item }) => item.id)).toEqual(["open"]);
  });

  it("uses unscheduled guidance while the date is still open", () => {
    const result = rankNextPartyTasks(
      party([task("food", "1-2 weeks"), task("date", "6+ weeks out", PLANNING_TASK_TITLES.date)]),
      "2027-08-01",
    );
    expect(result.find(({ task: item }) => item.id === "food")).toMatchObject({
      phase: "unscheduled",
      timing: null,
    });
  });
});
