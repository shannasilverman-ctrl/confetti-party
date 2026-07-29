import type { PartyRetrospective, Task } from "@/lib/party-context";

export function retrospectiveCarryForwardTasks(
  retrospective: PartyRetrospective | null | undefined,
  makeId: () => string,
): Task[] {
  if (!retrospective) return [];

  const tasks: Task[] = [];
  const ranOut = retrospective.ranOut?.trim();
  const changeNext = retrospective.changeNext?.trim();

  if (ranOut) {
    tasks.push({
      id: makeId(),
      title: "Plan for what ran short last time",
      bucket: "1-2 weeks",
      done: false,
      reason: `Last time: ${ranOut}`,
      action: "shopping",
      guidanceSource: "curated",
    });
  }

  if (changeNext) {
    tasks.push({
      id: makeId(),
      title: "Apply the change you wanted next time",
      bucket: "3-5 weeks",
      done: false,
      reason: `You wanted to change: ${changeNext}`,
      action: "overview",
      guidanceSource: "curated",
    });
  }

  return tasks;
}
