import { useEffect, useState } from "react";
import { Send, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BUCKETS,
  useParties,
  type Bucket,
  type Task,
  type TaskOwnerStatus,
} from "@/lib/party-context";
import { generatedTaskMetadata } from "@/lib/task-guidance";
import { taskHandoffMessage } from "@/lib/task-handoff";
import {
  ownerStatusAfterHandoff,
  ownerStatusForSave,
  TASK_OWNER_STATUS_OPTIONS,
  taskOwnerStatus,
  taskOwnerStatusOption,
} from "@/lib/task-ownership";

const OWNER_MAX = 60;
const TITLE_MAX = 180;
const HANDOFF_NOTES_MAX = 300;

export function TaskDetailsDialog({ partyId, task }: { partyId: string; task: Task }) {
  const { getParty, updateParty } = useParties();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [bucket, setBucket] = useState<Bucket>(task.bucket);
  const [owner, setOwner] = useState(task.owner ?? "");
  const [handoffNotes, setHandoffNotes] = useState(task.handoffNotes ?? "");
  const [ownerStatus, setOwnerStatus] = useState<TaskOwnerStatus>(taskOwnerStatus(task) ?? "ready");
  const [ownerStatusExplicitlyChanged, setOwnerStatusExplicitlyChanged] = useState(false);
  const recordHandoffStatus = (status: TaskOwnerStatus) => {
    setOwnerStatus(status);
    updateParty(partyId, (party) => ({
      ...party,
      tasks: party.tasks.map((item) =>
        item.id === task.id && item.owner?.trim() ? { ...item, ownerStatus: status } : item,
      ),
    }));
  };

  useEffect(() => {
    if (!open) return;
    const current = getParty(partyId)?.tasks.find((item) => item.id === task.id);
    if (!current) {
      setOpen(false);
      return;
    }
    setTitle(current.title);
    setBucket(current.bucket);
    setOwner(current.owner ?? "");
    setHandoffNotes(current.handoffNotes ?? "");
    setOwnerStatus(taskOwnerStatus(current) ?? "ready");
    setOwnerStatusExplicitlyChanged(false);
  }, [getParty, open, partyId, task.id]);

  const save = async (handOff = false) => {
    const nextTitle = title.trim().slice(0, TITLE_MAX);
    if (!nextTitle) return;
    const party = getParty(partyId);
    const current = party?.tasks.find((item) => item.id === task.id);
    if (!party || !current) {
      toast.error("That task is no longer in this plan.");
      setOpen(false);
      return;
    }
    const nextOwner = owner.trim().slice(0, OWNER_MAX);
    const nextHandoffNotes = handoffNotes.trim().slice(0, HANDOFF_NOTES_MAX);
    const nextOwnerStatus = ownerStatusForSave(
      current,
      nextOwner,
      ownerStatus,
      ownerStatusExplicitlyChanged,
    );
    const nextTask: Task = {
      ...current,
      ...(nextTitle !== current.title ? generatedTaskMetadata(nextTitle) : {}),
      title: nextTitle,
      bucket,
      owner: nextOwner || undefined,
      handoffNotes: nextHandoffNotes || undefined,
      ownerStatus: nextOwnerStatus,
    };
    updateParty(partyId, (party) => ({
      ...party,
      tasks: party.tasks.map((item) => (item.id === task.id ? nextTask : item)),
    }));
    setOpen(false);
    if (!handOff || !nextOwner) return;
    const message = taskHandoffMessage(party, nextTask);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: `${party.name} · ${nextTask.title}`, text: message });
        recordHandoffStatus(ownerStatusAfterHandoff(nextOwnerStatus!, "share"));
        toast.success("Task saved", {
          description: "Marked as waiting. Confetti cannot verify delivery or acceptance.",
        });
      } else {
        await navigator.clipboard.writeText(message);
        recordHandoffStatus(ownerStatusAfterHandoff(nextOwnerStatus!, "copy"));
        toast.success("Handoff copied—not sent", {
          description: "Paste it into your usual conversation with the owner.",
        });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        toast("Task saved. Handoff canceled.");
        return;
      }
      try {
        await navigator.clipboard.writeText(message);
        recordHandoffStatus(ownerStatusAfterHandoff(nextOwnerStatus!, "copy"));
        toast.success("Handoff copied—not sent", {
          description: "The share flow was unavailable, so Confetti copied the brief instead.",
        });
      } catch {
        toast.error("Task saved, but Confetti couldn't open or copy the handoff.");
      }
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 max-w-full gap-1.5"
        onClick={() => setOpen(true)}
        aria-label={
          task.owner
            ? `Task owner: ${task.owner}, status: ${taskOwnerStatusOption(taskOwnerStatus(task)!).label}`
            : `Assign: ${task.title}`
        }
      >
        <UserRound className="h-4 w-4" aria-hidden />
        <span className="max-w-28 truncate">{task.owner || "Assign"}</span>
        {task.owner && <OwnerStatusPill status={taskOwnerStatus(task)!} />}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="shrink-0 px-6 pb-3 pt-6 pr-12">
            <DialogTitle className="font-display text-2xl text-secondary">
              Make this task clear
            </DialogTitle>
            <DialogDescription>
              Transfer the outcome, not just the errand. Confetti can prepare the handoff, but it
              never messages someone or gives them access without you.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 py-2">
            <div className="space-y-1.5">
              <Label htmlFor={`task-title-${task.id}`}>Task</Label>
              <Input
                id={`task-title-${task.id}`}
                value={title}
                maxLength={TITLE_MAX}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`task-owner-${task.id}`}>Who owns this? (optional)</Label>
              <Input
                id={`task-owner-${task.id}`}
                value={owner}
                maxLength={OWNER_MAX}
                onChange={(event) => {
                  setOwner(event.target.value);
                  if (
                    event.target.value.trim().toLocaleLowerCase() !==
                    (task.owner?.trim().toLocaleLowerCase() ?? "")
                  ) {
                    setOwnerStatus("ready");
                    setOwnerStatusExplicitlyChanged(false);
                  }
                }}
                placeholder="e.g. Jordan, Dad, Food lead"
              />
              <p className="text-xs leading-5 text-muted-foreground">
                Use a name or role. The handoff stays optional until you choose where to share it.
              </p>
            </div>
            {owner.trim() && (
              <div className="space-y-1.5">
                <Label htmlFor={`task-owner-status-${task.id}`}>
                  Where does the handoff stand?
                </Label>
                <Select
                  value={ownerStatus}
                  onValueChange={(value) => {
                    setOwnerStatus(value as TaskOwnerStatus);
                    setOwnerStatusExplicitlyChanged(true);
                  }}
                >
                  <SelectTrigger id={`task-owner-status-${task.id}`} className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_OWNER_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs leading-5 text-muted-foreground">
                  You record this status. Confetti cannot read the conversation or verify a reply.
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor={`task-handoff-${task.id}`}>
                What does done look like? (optional)
              </Label>
              <Textarea
                id={`task-handoff-${task.id}`}
                value={handoffNotes}
                maxLength={HANDOFF_NOTES_MAX}
                onChange={(event) => setHandoffNotes(event.target.value)}
                placeholder="e.g. Pick up the cake by 2 PM; confirm candles and serving knife are included."
              />
              <p className="text-xs leading-5 text-muted-foreground">
                Add the finish line, constraints, or one decision they can make without checking
                back with you. Keep private guest details in the guest list.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`task-timing-${task.id}`}>When</Label>
              <Select value={bucket} onValueChange={(value) => setBucket(value as Bucket)}>
                <SelectTrigger id={`task-timing-${task.id}`} className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUCKETS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-border bg-background px-6 py-4 sm:space-x-0">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={owner.trim() ? "outline" : "festive"}
              onClick={() => void save()}
              disabled={!title.trim()}
            >
              Save task
            </Button>
            {owner.trim() && (
              <Button
                type="button"
                variant="festive"
                onClick={() => void save(true)}
                disabled={!title.trim()}
              >
                <Send className="h-4 w-4" aria-hidden /> Save & hand off
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function OwnerStatusPill({ status }: { status: TaskOwnerStatus }) {
  const label = taskOwnerStatusOption(status).shortLabel;
  const className =
    status === "confirmed"
      ? "bg-success/10 text-success"
      : status === "blocked"
        ? "bg-destructive/10 text-destructive"
        : status === "waiting"
          ? "bg-warning/15 text-warning-foreground"
          : "bg-muted text-muted-foreground";
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${className}`}>
      {label}
    </span>
  );
}
