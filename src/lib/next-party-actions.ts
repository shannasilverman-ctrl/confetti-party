import {
  BUCKETS,
  planningDetailForTask,
  planningDetailIsOpen,
  type Party,
  type PlanningDetail,
  type Task,
} from "@/lib/party-context";
import { taskTimingWindow, type TaskTimingWindow } from "@/lib/task-timing";
import { todayDateOnly } from "@/lib/date-only";

export type NextActionPhase =
  | "decision"
  | "overdue"
  | "active"
  | "upcoming"
  | "unscheduled"
  | "past";

export type RankedPartyTask = {
  task: Task;
  phase: NextActionPhase;
  timing: TaskTimingWindow | null;
  planningDetail: PlanningDetail | null;
};

const PHASE_PRIORITY: Record<NextActionPhase, number> = {
  decision: 0,
  overdue: 1,
  active: 2,
  upcoming: 3,
  unscheduled: 4,
  past: 5,
};

const DECISION_PRIORITY: Record<PlanningDetail, number> = {
  date: 0,
  guests: 1,
  budget: 2,
  theme: 3,
};

function phaseForTiming(timing: TaskTimingWindow | null, today: string): NextActionPhase {
  if (!timing) return "unscheduled";
  if (timing.isPastParty) return "past";
  if (timing.isDueNow) return "overdue";
  if (timing.startDate <= today && today <= timing.endDate) return "active";
  return "upcoming";
}

/**
 * Rank the host's unfinished work by what unlocks the plan first, then by
 * real-world timing. This intentionally recommends rather than auto-completes:
 * the host remains in control and can choose another action.
 */
export function rankNextPartyTasks(party: Party, today = todayDateOnly()): RankedPartyTask[] {
  const dateIsOpen = planningDetailIsOpen(party, "date");

  return party.tasks
    .filter((task) => !task.done)
    .map((task) => {
      const planningDetail = planningDetailForTask(task) ?? null;
      const timing = dateIsOpen ? null : taskTimingWindow(party.date, task.bucket, today);
      return {
        task,
        planningDetail,
        timing,
        phase: planningDetail ? ("decision" as const) : phaseForTiming(timing, today),
      };
    })
    .sort((a, b) => {
      const phaseDelta = PHASE_PRIORITY[a.phase] - PHASE_PRIORITY[b.phase];
      if (phaseDelta !== 0) return phaseDelta;
      if (a.planningDetail && b.planningDetail) {
        return DECISION_PRIORITY[a.planningDetail] - DECISION_PRIORITY[b.planningDetail];
      }
      const bucketDelta = BUCKETS.indexOf(a.task.bucket) - BUCKETS.indexOf(b.task.bucket);
      if (bucketDelta !== 0) return bucketDelta;
      return a.task.title.localeCompare(b.task.title);
    });
}
