import type { Task, TaskOwnerStatus } from "@/lib/party-context";

export const TASK_OWNER_STATUS_OPTIONS: Array<{
  value: TaskOwnerStatus;
  label: string;
  shortLabel: string;
}> = [
  { value: "ready", label: "Ready to hand off", shortLabel: "Not sent" },
  { value: "copied", label: "Copied — still needs sending", shortLabel: "Copied" },
  { value: "waiting", label: "Waiting for owner confirmation", shortLabel: "Waiting" },
  { value: "confirmed", label: "Owner confirmed", shortLabel: "Confirmed" },
  { value: "blocked", label: "Needs a decision or unblock", shortLabel: "Blocked" },
];

const VALID_STATUSES = new Set(TASK_OWNER_STATUS_OPTIONS.map((option) => option.value));

export function taskOwnerStatus(task: Task): TaskOwnerStatus | null {
  if (!task.owner?.trim()) return null;
  return task.ownerStatus && VALID_STATUSES.has(task.ownerStatus) ? task.ownerStatus : "ready";
}

export function taskOwnerStatusOption(status: TaskOwnerStatus) {
  return TASK_OWNER_STATUS_OPTIONS.find((option) => option.value === status)!;
}

export function ownerStatusForSave(
  task: Task,
  nextOwner: string,
  selectedStatus: TaskOwnerStatus,
  explicitlyChanged = false,
): TaskOwnerStatus | undefined {
  const normalized = nextOwner.trim().toLocaleLowerCase();
  if (!normalized) return undefined;
  const current = task.owner?.trim().toLocaleLowerCase();
  return current === normalized || explicitlyChanged ? selectedStatus : "ready";
}

export function ownerStatusAfterHandoff(
  status: TaskOwnerStatus,
  channel: "share" | "copy",
): TaskOwnerStatus {
  if (status === "confirmed" || status === "blocked") return status;
  return channel === "share" ? "waiting" : "copied";
}

const ATTENTION_PRIORITY: Record<TaskOwnerStatus, number> = {
  blocked: 0,
  copied: 1,
  ready: 2,
  waiting: 3,
  confirmed: 4,
};

export function tasksNeedingOwnerFollowThrough(tasks: Task[]): Task[] {
  return tasks
    .filter((task) => {
      const status = taskOwnerStatus(task);
      return !task.done && status != null && status !== "confirmed";
    })
    .sort((a, b) => {
      const statusDelta =
        ATTENTION_PRIORITY[taskOwnerStatus(a)!] - ATTENTION_PRIORITY[taskOwnerStatus(b)!];
      if (statusDelta !== 0) return statusDelta;
      return a.title.localeCompare(b.title);
    });
}
