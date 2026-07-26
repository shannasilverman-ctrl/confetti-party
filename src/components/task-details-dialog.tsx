import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BUCKETS, useParties, type Bucket, type Task } from "@/lib/party-context";
import { generatedTaskMetadata } from "@/lib/task-guidance";

const OWNER_MAX = 60;
const TITLE_MAX = 180;

export function TaskDetailsDialog({ partyId, task }: { partyId: string; task: Task }) {
  const { getParty, updateParty } = useParties();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [bucket, setBucket] = useState<Bucket>(task.bucket);
  const [owner, setOwner] = useState(task.owner ?? "");

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
  }, [getParty, open, partyId, task.id]);

  const save = () => {
    const nextTitle = title.trim().slice(0, TITLE_MAX);
    if (!nextTitle) return;
    const current = getParty(partyId)?.tasks.find((item) => item.id === task.id);
    if (!current) {
      toast.error("That task is no longer in this plan.");
      setOpen(false);
      return;
    }
    updateParty(partyId, (party) => ({
      ...party,
      tasks: party.tasks.map((item) => {
        if (item.id !== task.id) return item;
        const nextOwner = owner.trim().slice(0, OWNER_MAX);
        return {
          ...item,
          ...(nextTitle !== item.title ? generatedTaskMetadata(nextTitle) : {}),
          title: nextTitle,
          bucket,
          owner: nextOwner || undefined,
        };
      }),
    }));
    setOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 max-w-full gap-1.5"
        onClick={() => setOpen(true)}
        aria-label={task.owner ? `Task owner: ${task.owner}` : `Assign: ${task.title}`}
      >
        <UserRound className="h-4 w-4" aria-hidden />
        <span className="max-w-32 truncate">{task.owner || "Assign"}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-secondary">
              Make this task clear
            </DialogTitle>
            <DialogDescription>
              Name the person or role taking this on. This organizes your plan—it does not message
              them or give them access.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
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
                onChange={(event) => setOwner(event.target.value)}
                placeholder="e.g. Jordan, Dad, Food lead"
              />
              <p className="text-xs leading-5 text-muted-foreground">
                Use a name or role. Confetti will always show who is responsible.
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
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="festive" onClick={save} disabled={!title.trim()}>
              Save task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
