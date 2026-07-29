import { CircleAlert, UsersRound } from "lucide-react";
import { TaskDetailsDialog } from "@/components/task-details-dialog";
import {
  taskOwnerStatus,
  taskOwnerStatusOption,
  tasksNeedingOwnerFollowThrough,
} from "@/lib/task-ownership";
import type { Task } from "@/lib/party-context";

export function TaskOwnershipFollowThrough({ partyId, tasks }: { partyId: string; tasks: Task[] }) {
  const attention = tasksNeedingOwnerFollowThrough(tasks);
  if (attention.length === 0) return null;
  const visible = attention.slice(0, 3);

  return (
    <section
      aria-labelledby="task-follow-through-title"
      className="overflow-hidden rounded-2xl border border-primary/20 bg-card shadow-card"
      data-testid="task-owner-follow-through"
    >
      <div className="flex items-start gap-3 bg-primary/[0.055] p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <UsersRound className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h2
            id="task-follow-through-title"
            className="font-display text-lg font-semibold text-secondary"
          >
            Ownership follow-through
          </h2>
          <p className="mt-0.5 text-sm leading-6 text-muted-foreground">
            These tasks have an owner but still need a handoff, reply, or decision. Confetti keeps
            the follow-up visible without reading anyone’s messages.
          </p>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {visible.map((task) => {
          const status = taskOwnerStatus(task)!;
          return (
            <li key={task.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <CircleAlert
                className={`h-4 w-4 shrink-0 ${
                  status === "blocked" ? "text-destructive" : "text-primary"
                }`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-secondary">{task.title}</div>
                <div className="text-xs text-muted-foreground">
                  {task.owner} · {taskOwnerStatusOption(status).label}
                </div>
              </div>
              <TaskDetailsDialog partyId={partyId} task={task} />
            </li>
          );
        })}
      </ul>
      {attention.length > visible.length && (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          {attention.length - visible.length} more assigned{" "}
          {attention.length - visible.length === 1 ? "task needs" : "tasks need"} follow-through
          below.
        </p>
      )}
    </section>
  );
}
