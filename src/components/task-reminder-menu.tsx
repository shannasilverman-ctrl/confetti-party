import { CalendarPlus, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildIcs, googleCalUrl } from "@/lib/calendar-export";
import type { Bucket } from "@/lib/party-context";
import { taskTimingWindow } from "@/lib/task-timing";

function safeFilename(value: string): string {
  return `${value.replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "party-task"}.ics`;
}

function downloadReminder(name: string, ics: string): void {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeFilename(name);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function TaskReminderMenu({
  partyName,
  partyDate,
  taskTitle,
  bucket,
}: {
  partyName: string;
  partyDate: string;
  taskTitle: string;
  bucket: Bucket;
}) {
  const timing = taskTimingWindow(partyDate, bucket);
  if (!timing || timing.isPastParty) return null;
  const name = `${taskTitle.trim() || "Party task"} · ${partyName}`;
  const details = `Planning reminder for ${partyName}. Confetti suggested this date from the task’s “${bucket}” timing. Adjust it in your calendar if another day works better.`;
  const entry = {
    name,
    date: timing.reminderDate,
    start_time: null,
    details,
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-primary/[0.06] p-3">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-secondary">
          {timing.isDueNow
            ? "This needs attention now"
            : `Suggested window · ${timing.windowLabel}`}
        </div>
        <div className="text-xs text-muted-foreground">{timing.reminderLabel}</div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="min-h-11 shrink-0">
            <CalendarPlus className="h-4 w-4" aria-hidden /> Add reminder
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem asChild>
            <a href={googleCalUrl(entry)} target="_blank" rel="noopener noreferrer">
              <CalendarPlus aria-hidden /> Google Calendar
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              try {
                downloadReminder(name, buildIcs(entry));
                toast.success("Calendar reminder ready", {
                  description: "Open the downloaded file to add or adjust it.",
                });
              } catch {
                toast.error("Couldn't prepare the reminder. Try Google Calendar instead.");
              }
            }}
          >
            <Download aria-hidden /> Apple / Outlook (.ics)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
