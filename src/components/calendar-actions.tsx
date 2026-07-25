import { CalendarPlus, Navigation } from "lucide-react";
import { toast } from "sonner";
import { buildIcs, googleCalUrl, type CalendarParty } from "@/lib/calendar-export";
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
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-center gap-2">
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
      {party.start_time && (
        <p className="text-center text-[11px] text-muted-foreground">
          Calendar times use the host-entered local time shown above.
        </p>
      )}
    </div>
  );
}
