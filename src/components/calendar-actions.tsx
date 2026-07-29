import { CalendarPlus, Navigation } from "lucide-react";
import { toast } from "sonner";
import {
  buildIcs,
  calendarExportIssue,
  googleCalUrl,
  type CalendarParty,
} from "@/lib/calendar-export";
import { Button } from "@/components/ui/button";

function safeFilename(name: string): string {
  return `${name.replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "party"}.ics`;
}

function downloadCalendarFile(party: CalendarParty): void {
  const blob = new Blob([buildIcs(party)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeFilename(party.name);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function CalendarActions({ party }: { party: CalendarParty }) {
  const issue = calendarExportIssue(party);
  const canExport = issue === null;
  const warning =
    issue === "missing-time-zone"
      ? "Ask the host to confirm the event time zone before adding this date."
      : issue === "invalid-date"
        ? "Ask the host to confirm the event date before adding it to a calendar."
        : issue === "ambiguous-wall-time"
          ? "This start time happens twice when the clocks change. Ask the host to choose a time outside that clock-change hour."
          : issue === "nonexistent-wall-time"
            ? "This start time does not exist when the clocks change. Ask the host to choose another time."
            : "Ask the host to confirm the event start time before adding this date.";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-center gap-2">
        {canExport && (
          <>
            <Button asChild variant="outline" size="sm">
              <a href={googleCalUrl(party)} target="_blank" rel="noopener noreferrer">
                <CalendarPlus /> Google Calendar
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                try {
                  downloadCalendarFile(party);
                } catch {
                  toast.error("Couldn't prepare the calendar file. Try Google Calendar instead.");
                }
              }}
            >
              <CalendarPlus /> Apple / .ics
            </Button>
          </>
        )}
        {party.location && (
          <Button asChild variant="outline" size="sm">
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(party.location)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Navigation /> Directions
            </a>
          </Button>
        )}
      </div>
      {party.start_time && canExport && (
        <p className="text-center text-[11px] text-muted-foreground">
          Calendar time zone: {party.event_time_zone}
        </p>
      )}
      {party.start_time && !canExport && (
        <p
          className="text-center text-xs font-medium text-warning-foreground"
          data-testid="calendar-time-zone-warning"
        >
          {warning}
        </p>
      )}
    </div>
  );
}
