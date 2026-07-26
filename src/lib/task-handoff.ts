import { formatDateOnly } from "@/lib/date-only";
import { planningDetailIsOpen, type Party, type Task } from "@/lib/party-context";

function partyTiming(party: Party): string | null {
  if (planningDetailIsOpen(party, "date")) return null;
  const date = formatDateOnly(party.date, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const startTime = party.startTime?.trim();
  return startTime ? `${date} at ${startTime}` : date;
}

/**
 * Creates a channel-neutral task brief. It deliberately excludes the private
 * workspace URL, guest data, host notes, access notes, and invite token.
 */
export function taskHandoffMessage(party: Party, task: Task): string {
  const owner = task.owner?.trim();
  const timing = partyTiming(party);
  const done = task.handoffNotes?.trim();
  const reason = task.reason?.trim();
  return [
    `${owner ? `${owner} — c` : "C"}an you own this for ${party.name}?`,
    "",
    `Task: ${task.title}`,
    `Timing: ${task.bucket}${timing ? ` · Party is ${timing}` : ""}`,
    ...(done ? [`Done means: ${done}`] : []),
    ...(reason ? [`Why it matters: ${reason}`] : []),
    "",
    "Please reply here to confirm you’ve got it, and flag anything you need to finish it.",
  ].join("\n");
}
