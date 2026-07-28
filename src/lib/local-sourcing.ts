import type { Task } from "./party-context";
import type {
  LocalSourcingOption,
  LocalSourcingStatus,
  PartyPlanningProfile,
} from "./party-intelligence";
import { safeExternalHref } from "./safe-url";

export const LOCAL_SOURCING_STATUS_LABELS: Record<LocalSourcingStatus, string> = {
  considering: "Considering",
  contacted: "Contacted",
  quoted: "Quote received",
  booked: "Booked by you",
};

const VALID_KINDS = new Set(["venue", "food", "experience"]);
const VALID_STATUSES = new Set<LocalSourcingStatus>([
  "considering",
  "contacted",
  "quoted",
  "booked",
]);

export function localSourcingOptions(
  profile: PartyPlanningProfile | undefined,
): LocalSourcingOption[] {
  const raw = profile?.localSourcingOptions;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const result: LocalSourcingOption[] = [];
  for (const candidate of raw) {
    if (
      !candidate ||
      typeof candidate.id !== "string" ||
      !candidate.id.trim() ||
      seen.has(candidate.id) ||
      typeof candidate.suggestionId !== "string" ||
      !candidate.suggestionId.trim() ||
      !VALID_KINDS.has(candidate.kind) ||
      typeof candidate.providerName !== "string" ||
      !candidate.providerName.trim() ||
      !VALID_STATUSES.has(candidate.status)
    ) {
      continue;
    }
    seen.add(candidate.id);
    const url = candidate.url ? safeExternalHref(candidate.url) : null;
    const cost =
      typeof candidate.cost === "number" &&
      Number.isFinite(candidate.cost) &&
      candidate.cost >= 0 &&
      candidate.cost <= 1_000_000
        ? candidate.cost
        : undefined;
    result.push({
      id: candidate.id,
      suggestionId: candidate.suggestionId,
      kind: candidate.kind,
      providerName: candidate.providerName.trim().slice(0, 100),
      status: candidate.status,
      ...(url ? { url } : {}),
      ...(cost != null ? { cost } : {}),
      ...(cost != null && candidate.costBasis === "vendor-quote"
        ? { costBasis: "vendor-quote" as const }
        : cost != null
          ? { costBasis: "host-estimate" as const }
          : {}),
      ...(typeof candidate.notes === "string" && candidate.notes.trim()
        ? { notes: candidate.notes.trim().slice(0, 300) }
        : {}),
      ...(candidate.selected ? { selected: true } : {}),
    });
  }
  return result;
}

export function upsertLocalSourcingOption(
  profile: PartyPlanningProfile | undefined,
  option: LocalSourcingOption,
): PartyPlanningProfile {
  const existing = localSourcingOptions(profile);
  const next = existing.some((item) => item.id === option.id)
    ? existing.map((item) => (item.id === option.id ? option : item))
    : [...existing, option];
  return {
    version: 1,
    ...profile,
    localSourcingOptions: next,
  };
}

export function selectLocalSourcingOption(
  profile: PartyPlanningProfile | undefined,
  optionId: string,
): PartyPlanningProfile {
  const options = localSourcingOptions(profile);
  const selected = options.find((option) => option.id === optionId);
  if (!selected) return { version: 1, ...profile, localSourcingOptions: options };
  return {
    version: 1,
    ...profile,
    localSourcingOptions: options.map((option) => ({
      ...option,
      selected:
        option.suggestionId === selected.suggestionId ? option.id === selected.id : option.selected,
    })),
  };
}

export function removeLocalSourcingOption(
  profile: PartyPlanningProfile | undefined,
  optionId: string,
): PartyPlanningProfile {
  return {
    version: 1,
    ...profile,
    localSourcingOptions: localSourcingOptions(profile).filter((option) => option.id !== optionId),
  };
}

export function sourcingDecisionTask(option: LocalSourcingOption, id: string): Task {
  return {
    id,
    title: `Confirm ${option.providerName}: availability, inclusions, and final price`,
    bucket: "1-2 weeks",
    done: false,
    reason:
      "A favorite is not a booking. Confirm the date, exact package, fees, cancellation terms, access needs, and payment directly with the provider.",
    action: "budget",
    guidanceSource: "curated",
    source: "local-sourcing",
    sourcingOptionId: option.id,
  };
}

export function reconcileSourcingDecisionTasks(
  tasks: Task[],
  options: LocalSourcingOption[],
  selected: LocalSourcingOption,
  newTaskId: string,
): Task[] {
  const siblingIds = new Set(
    options
      .filter((option) => option.suggestionId === selected.suggestionId)
      .map((option) => option.id),
  );
  let retainedSelectedTask = false;
  const next = tasks.flatMap((task) => {
    if (!task.sourcingOptionId || !siblingIds.has(task.sourcingOptionId)) return [task];
    if (task.sourcingOptionId !== selected.id || retainedSelectedTask) return [];
    retainedSelectedTask = true;
    const refreshed = sourcingDecisionTask(selected, task.id);
    return [{ ...task, ...refreshed }];
  });
  return retainedSelectedTask ? next : [...next, sourcingDecisionTask(selected, newTaskId)];
}

export function localCostContext(cost: number | undefined, budget: number): string | null {
  if (cost == null) return null;
  if (budget <= 0) return `$${cost.toLocaleString()} · budget still open`;
  const share = Math.round((cost / budget) * 100);
  return `$${cost.toLocaleString()} · ${share}% of the current budget`;
}
