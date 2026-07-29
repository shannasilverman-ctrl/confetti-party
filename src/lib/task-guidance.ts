import type { Task, TaskAction } from "./party-context";

/**
 * Baseline guidance for templates that do not yet have a specialized
 * intelligence pack. Specialized playbooks supply task-by-task copy.
 */
export function generatedTaskMetadata(
  title: string,
): Pick<Task, "reason" | "action" | "guidanceSource"> {
  const normalized = title.toLowerCase();
  let action: TaskAction;

  if (/(invite|rsvp|guest list|guest count|headcount|dietary needs)/.test(normalized))
    action = "guests";
  else if (/(bring board|assign.*dish)/.test(normalized)) action = "bring";
  else if (/(theme|decor|backdrop|set the table|set up space)/.test(normalized)) action = "theme";
  else if (
    /(menu|grocery|shop|cake|dessert|food|drink|snack|wing|chili|dip|ice|favor|propane|charcoal)/.test(
      normalized,
    )
  )
    action = "shopping";
  else if (/(date|venue|reserve|book venue)/.test(normalized)) action = "overview";
  else action = "timeline";

  const reasonByAction: Record<TaskAction, string> = {
    guests:
      "A reliable guest picture keeps quantities, space, communication, and special needs aligned.",
    theme:
      "One clear setup direction makes the room feel intentional without buying things that do not work together.",
    shopping:
      "Turning this into a concrete plan now prevents a last-minute run and protects the budget.",
    overview:
      "Settling this decision unlocks the rest of the plan and reduces expensive rework later.",
    timeline:
      "Giving this a real place in the plan keeps day-of work from piling up at the same time.",
    bring: "A clear contribution plan spreads the work without creating gaps or duplicate items.",
    budget:
      "A visible spending decision protects the priorities that matter most to this gathering.",
  };

  return { action, reason: reasonByAction[action], guidanceSource: "inferred" };
}

export function withTaskGuidance(task: Task): Task {
  if (task.reason && task.action && task.guidanceSource) return task;
  const inferred = generatedTaskMetadata(task.title);
  return {
    ...task,
    reason: task.reason ?? inferred.reason,
    action: task.action ?? inferred.action,
    guidanceSource: task.guidanceSource ?? inferred.guidanceSource,
  };
}
