// Simple guest-facing feed of host updates (newest first).

import { Megaphone } from "lucide-react";
import type { HostUpdateView } from "@/lib/rsvp.functions";

function formatRelative(iso: string) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export function HostUpdatesFeed({ updates }: { updates: HostUpdateView[] }) {
  if (!updates || updates.length === 0) return null;
  const ordered = [...updates].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-2 flex items-center gap-2">
        <Megaphone className="h-4 w-4 text-primary" />
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          From your host
        </div>
      </div>
      <ul className="space-y-2.5">
        {ordered.slice(0, 5).map((u) => (
          <li key={u.id} className="rounded-xl bg-muted/40 px-3 py-2">
            <div className="text-sm text-foreground whitespace-pre-wrap">{u.text}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {formatRelative(u.at)}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
