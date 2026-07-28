import { describe, expect, it } from "vitest";
import type { Task, TaskOwnerStatus } from "@/lib/party-context";
import {
  ownerStatusAfterHandoff,
  ownerStatusForSave,
  taskOwnerStatus,
  tasksNeedingOwnerFollowThrough,
} from "@/lib/task-ownership";

const task = (overrides: Partial<Task> = {}): Task => ({
  id: overrides.id ?? "task-1",
  title: overrides.title ?? "Pick up the cake",
  bucket: overrides.bucket ?? "Party week",
  done: overrides.done ?? false,
  ...overrides,
});

describe("task ownership follow-through", () => {
  it("has no lifecycle until a task has an owner and defaults an assigned task to ready", () => {
    expect(taskOwnerStatus(task())).toBeNull();
    expect(taskOwnerStatus(task({ owner: "Jordan" }))).toBe("ready");
  });

  it("resets an inherited status for a new owner but respects an explicit host selection", () => {
    const current = task({ owner: "Jordan", ownerStatus: "confirmed" });

    expect(ownerStatusForSave(current, "Casey", "confirmed")).toBe("ready");
    expect(ownerStatusForSave(current, "Casey", "blocked", true)).toBe("blocked");
    expect(ownerStatusForSave(current, " Jordan ", "waiting")).toBe("waiting");
    expect(ownerStatusForSave(current, "", "waiting")).toBeUndefined();
  });

  it("records the honest result of the host-controlled handoff channel", () => {
    expect(ownerStatusAfterHandoff("ready", "copy")).toBe("copied");
    expect(ownerStatusAfterHandoff("ready", "share")).toBe("waiting");
    expect(ownerStatusAfterHandoff("confirmed", "copy")).toBe("confirmed");
    expect(ownerStatusAfterHandoff("blocked", "share")).toBe("blocked");
  });

  it("prioritizes unresolved assigned work and excludes confirmed or completed work", () => {
    const assigned = (id: string, status: TaskOwnerStatus, done = false) =>
      task({ id, title: id, owner: "Jordan", ownerStatus: status, done });

    expect(
      tasksNeedingOwnerFollowThrough([
        assigned("waiting", "waiting"),
        assigned("confirmed", "confirmed"),
        assigned("ready", "ready"),
        assigned("blocked", "blocked"),
        assigned("copied", "copied"),
        assigned("complete", "blocked", true),
        task({ id: "unassigned", title: "unassigned" }),
      ]).map((item) => item.id),
    ).toEqual(["blocked", "copied", "ready", "waiting"]);
  });
});
