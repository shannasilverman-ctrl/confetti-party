import { CalendarClock, CheckCircle2, Trash2 } from "lucide-react";
import { celebrateAtEvent } from "@/components/confetti-burst";
import { EditDetailsDialog } from "@/components/edit-details-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { planningDetailForTask, type PlanningDetail, type Task } from "@/lib/party-context";

export function ChecklistTaskRow({
  partyId,
  task,
  popped,
  onToggle,
  onRemove,
  onResolvePlanning,
}: {
  partyId: string;
  task: Task;
  popped: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onResolvePlanning: (detail: PlanningDetail) => void;
}) {
  const planningDetail = planningDetailForTask(task);

  if (planningDetail) {
    return (
      <li
        data-testid={`planning-task-${planningDetail}`}
        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-card ${
          task.done ? "border-border bg-card opacity-60" : "border-primary/20 bg-primary/5"
        }`}
      >
        {task.done ? (
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden />
        ) : (
          <CalendarClock className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        )}
        <span
          className={`min-w-0 flex-1 text-sm ${
            task.done ? "text-muted-foreground line-through" : "font-medium text-secondary"
          }`}
        >
          {task.title}
        </span>
        {!task.done &&
          (planningDetail === "theme" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 shrink-0"
              onClick={() => onResolvePlanning(planningDetail)}
            >
              Pick a look
            </Button>
          ) : (
            <EditDetailsDialog partyId={partyId} triggerLabel="Add details" />
          ))}
      </li>
    );
  }

  return (
    <li
      className={`group flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-card transition ${
        task.done ? "opacity-60" : ""
      }`}
    >
      <div className={popped ? "animate-pop" : ""}>
        <Checkbox
          checked={task.done}
          onClick={(event) => {
            if (!task.done) celebrateAtEvent("micro", event);
          }}
          onCheckedChange={onToggle}
          className="h-5 w-5"
          aria-label={`${task.done ? "Reopen" : "Complete"}: ${task.title}`}
        />
      </div>
      <span
        className={`min-w-0 flex-1 text-sm ${
          task.done ? "text-muted-foreground line-through" : "text-secondary"
        }`}
      >
        {task.title}
      </span>
      {task.done && <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />}
      <button
        type="button"
        onClick={onRemove}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-destructive sm:min-h-0 sm:min-w-0 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
        aria-label="Delete task"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}
