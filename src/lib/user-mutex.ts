// Small in-process per-key serializer. Different keys never block each
// other; the same key runs its tasks sequentially. Rejections do NOT
// poison subsequent tasks — the internal chain always catches so the
// next `run` sees a fresh baseline.
//
// The bug this replaces: previously the registry stored
// `queued.finally(cleanup)` and cleanup compared `map.get(key) === queued`.
// Those are two distinct promises, so cleanup never matched and the map
// grew forever. We fix that by comparing against the SAME reference the
// registry holds.
//
// Not distributed: this is single-node only. See voice release-blocker
// note in src/routes/api/realtime/session.ts.

const registry = new Map<string, Promise<unknown>>();

export function withKeyedLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = registry.get(key) ?? Promise.resolve();
  // Never let a prior rejection poison the next task.
  const gated = prev.catch(() => undefined).then(fn);
  // Store the SAME promise we'll compare against in cleanup.
  const tracked: Promise<unknown> = gated.finally(() => {
    if (registry.get(key) === tracked) registry.delete(key);
  });
  registry.set(key, tracked);
  return gated;
}

/** Test-only: number of live keys currently tracked. */
export function _keyedLockSize(): number {
  return registry.size;
}

/** Test-only: reset (safe because tests are single-threaded). */
export function _resetKeyedLocks(): void {
  registry.clear();
}
