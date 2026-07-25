// TalkLifecycle — owns "the currently reserved voice session id" and
// guarantees exactly-one logical end() call for it, regardless of which
// termination signal fires (user stop, connect failure, pagehide, SPA
// route unmount, duplicate events). Extracted from routes/talk.tsx so we
// can unit-test the invariants without React or a real audio pipeline.
//
// Notes on the bug this replaces:
//   * The previous unmount effect closed the TalkClient but never called
//     `endSession`, so a SPA route change left the DB row open.
//   * The pagehide effect captured `sessionId` via closure and would only
//     end the id that existed when the effect last ran — stale-id risk.
//   * There was no explicit "owned" concept: two sequential connect
//     attempts could double-end the second id.
//
// The controller only ever calls the injected `endSession` for the
// currently owned id and only once per (id, controller) pairing.

export type EndSessionFn = (input: {
  sessionId: string;
  disconnectReason: string;
  durationS?: number;
}) => Promise<unknown>;

export interface TalkLifecycleDeps {
  endSession: EndSessionFn;
  now?: () => number;
}

export interface TalkLifecycle {
  /** Called after the server reserves a new session. Replaces any prior owned id. */
  own(sessionId: string, startedAt?: number): void;
  /** Idempotent best-effort end. Never throws. */
  end(reason: string): Promise<void>;
  /** Currently owned id, or null. Test-observable. */
  ownedId(): string | null;
  /** Test-observable count of times endSession() actually fired. */
  endCallCount(): number;
}

export function createTalkLifecycle(deps: TalkLifecycleDeps): TalkLifecycle {
  const now = deps.now ?? (() => Date.now());
  let owned: string | null = null;
  let startedAt: number | null = null;
  // Once we've ended a given id, remember it so late signals (pagehide
  // firing after unmount, duplicate error events, etc.) become no-ops.
  const endedIds = new Set<string>();
  let calls = 0;

  return {
    own(sessionId, started) {
      if (!sessionId) return;
      owned = sessionId;
      startedAt = typeof started === "number" ? started : now();
    },
    async end(reason) {
      const sid = owned;
      if (!sid) return;
      if (endedIds.has(sid)) {
        // Already ended once. Clear ownership defensively.
        owned = null;
        startedAt = null;
        return;
      }
      // Claim the id BEFORE awaiting so a re-entrant call from another
      // signal (pagehide firing while unmount cleanup is in flight) is a
      // no-op instead of a second end.
      endedIds.add(sid);
      const dur =
        startedAt != null ? Math.max(0, Math.round((now() - startedAt) / 1000)) : undefined;
      owned = null;
      startedAt = null;
      calls += 1;
      try {
        await deps.endSession({ sessionId: sid, disconnectReason: reason, durationS: dur });
      } catch {
        // best-effort — never throw from lifecycle end.
      }
    },
    ownedId() {
      return owned;
    },
    endCallCount() {
      return calls;
    },
  };
}
