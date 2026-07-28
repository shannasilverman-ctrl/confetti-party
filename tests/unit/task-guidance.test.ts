import { describe, expect, it } from "vitest";
import { generateTasks, type Task } from "@/lib/party-context";
import { packTasks, starterPack } from "@/lib/holiday-packs";
import { generatedTaskMetadata, withTaskGuidance } from "@/lib/task-guidance";

describe("task guidance", () => {
  it("routes common planning work to the place where the host can act", () => {
    expect(generatedTaskMetadata("Confirm headcount and dietary needs").action).toBe("guests");
    expect(generatedTaskMetadata("Assign potluck dishes on the Bring Board").action).toBe("bring");
    expect(generatedTaskMetadata("Order the birthday cake").action).toBe("shopping");
    expect(generatedTaskMetadata("Set up the photo backdrop").action).toBe("theme");
    expect(generatedTaskMetadata("Test the stream before kickoff").action).toBe("timeline");
  });

  it("gives every generic occasion task a useful reason and destination", () => {
    const tasks = generateTasks("game-day", "2099-07-26");
    expect(tasks.length).toBeGreaterThan(0);
    expect(
      tasks.every((task) => task.reason && task.action && task.guidanceSource === "inferred"),
    ).toBe(true);
  });

  it("gives every holiday-pack task the same actionable baseline", () => {
    const thanksgiving = starterPack("thanksgiving");
    expect(thanksgiving).toBeTruthy();
    let id = 0;
    const tasks = packTasks(thanksgiving!, () => `pack-${++id}`);
    expect(tasks.every((task) => task.reason && task.action)).toBe(true);
    expect(tasks.find((task) => task.title.includes("Bring Board"))?.action).toBe("bring");
  });

  it("hydrates missing legacy guidance without replacing saved ownership or curated copy", () => {
    const legacy: Task = {
      id: "legacy",
      title: "Buy birthday cake",
      bucket: "Party week",
      done: false,
      owner: "Jordan",
    };
    expect(withTaskGuidance(legacy)).toMatchObject({
      owner: "Jordan",
      action: "shopping",
      guidanceSource: "inferred",
    });

    const curated: Task = {
      ...legacy,
      reason: "The bakery needs a final pickup name.",
      action: "shopping",
      guidanceSource: "curated",
    };
    expect(withTaskGuidance(curated)).toBe(curated);
  });
});
