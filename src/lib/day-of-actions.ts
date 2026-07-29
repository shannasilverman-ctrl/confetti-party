import { BUCKETS, planningDetailForTask, type Task } from "@/lib/party-context";

/**
 * Keep day-of mode operational: surfaced ownership commitments come first,
 * followed by work closest to the gathering. Stable source order breaks ties.
 */
export function prioritizeDayOfTasks(tasks: Task[], limit = 3): Task[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => !task.done && !planningDetailForTask(task))
    .sort((a, b) => {
      const ownerDelta =
        Number(Boolean(b.task.owner?.trim())) - Number(Boolean(a.task.owner?.trim()));
      if (ownerDelta !== 0) return ownerDelta;

      const bucketDelta = BUCKETS.indexOf(b.task.bucket) - BUCKETS.indexOf(a.task.bucket);
      if (bucketDelta !== 0) return bucketDelta;

      return a.index - b.index;
    })
    .slice(0, limit)
    .map(({ task }) => task);
}
