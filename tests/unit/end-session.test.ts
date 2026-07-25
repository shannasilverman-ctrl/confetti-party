import { describe, expect, it, vi } from "vitest";
import { performEndSession } from "@/lib/talk.functions";

// A tiny mock that mirrors the exact chain performEndSession relies on:
//   .from("talk_sessions").update(patch).eq("id",X).eq("user_id",Y).is("ended_at", null).select("id")
// Terminal returns { data, error }. This lets us assert:
//   * ownership filter (user_id) is applied
//   * idempotency filter (ended_at IS null) is applied
//   * second call reports changed:false and never re-issues the patch
//   * DB errors throw a sanitized error and log only correlation-safe info

interface Row {
  id: string;
  user_id: string;
  ended_at: string | null;
}

function makeSupabase(rows: Row[]) {
  const calls: Array<{
    patch: Record<string, unknown>;
    filters: Record<string, string | null>;
  }> = [];
  const client = {
    _rows: rows,
    _calls: calls,
    _forceError: null as { message: string; code?: string } | null,
    from(table: string) {
      if (table !== "talk_sessions") throw new Error(`unexpected table ${table}`);
      return {
        update(patch: Record<string, unknown>) {
          const filters: Record<string, string | null> = {};
          return {
            eq(col: string, val: string) {
              filters[col] = val;
              return {
                eq(col2: string, val2: string) {
                  filters[col2] = val2;
                  return {
                    is(col3: string, val3: null) {
                      filters[col3] = val3;
                      return {
                        select: async (_cols: string) => {
                          calls.push({ patch, filters });
                          if (client._forceError) {
                            return { data: null, error: client._forceError };
                          }
                          const matched = rows.filter(
                            (r) =>
                              r.id === filters.id &&
                              r.user_id === filters.user_id &&
                              r.ended_at === filters.ended_at,
                          );
                          for (const r of matched) {
                            r.ended_at = String(patch.ended_at);
                          }
                          return { data: matched.map((r) => ({ id: r.id })), error: null };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return client;
}

describe("performEndSession", () => {
  it("ends a session the caller owns and reports changed:true", async () => {
    const supabase = makeSupabase([{ id: "s1", user_id: "u1", ended_at: null }]);
    const out = await performEndSession(supabase as never, "u1", {
      sessionId: "s1",
      durationS: 42,
      disconnectReason: "user_ended",
    });
    expect(out).toEqual({ ok: true, changed: true });
    expect(supabase._calls).toHaveLength(1);
    // Ownership filter present:
    expect(supabase._calls[0].filters).toMatchObject({
      id: "s1",
      user_id: "u1",
      ended_at: null,
    });
    // Duration + reason recorded:
    expect(supabase._calls[0].patch).toMatchObject({
      duration_s: 42,
      disconnect_reason: "user_ended",
    });
  });

  it("cannot end another user's session (ownership filter, not just RLS)", async () => {
    const supabase = makeSupabase([{ id: "s1", user_id: "victim", ended_at: null }]);
    const out = await performEndSession(supabase as never, "attacker", {
      sessionId: "s1",
    });
    expect(out).toEqual({ ok: true, changed: false });
    // Victim's row is UNCHANGED — no ended_at set:
    expect(supabase._rows[0].ended_at).toBeNull();
  });

  it("second end is truly idempotent — patch never rewrites ended_at/duration/reason", async () => {
    const supabase = makeSupabase([{ id: "s1", user_id: "u1", ended_at: null }]);
    const first = await performEndSession(supabase as never, "u1", {
      sessionId: "s1",
      durationS: 10,
      disconnectReason: "user_ended",
    });
    expect(first.changed).toBe(true);
    const firstEndedAt = supabase._rows[0].ended_at;

    const second = await performEndSession(supabase as never, "u1", {
      sessionId: "s1",
      durationS: 999,
      disconnectReason: "second_call_should_not_win",
    });
    expect(second).toEqual({ ok: true, changed: false });
    // Row's ended_at is EXACTLY what the first call wrote:
    expect(supabase._rows[0].ended_at).toBe(firstEndedAt);
  });

  it("DB failure throws sanitized error and logs correlation-only (no ids)", async () => {
    const supabase = makeSupabase([{ id: "s1", user_id: "u1", ended_at: null }]);
    supabase._forceError = { message: "detailed pg message with user u1 and session s1", code: "PGRST123" };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const sink: string[] = [];
    errorSpy.mockImplementation((...args: unknown[]) => {
      sink.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    });
    try {
      await expect(
        performEndSession(supabase as never, "u1", { sessionId: "s1" }),
      ).rejects.toThrow(/end_session_failed/);
      const joined = sink.join("\n");
      // Log has category + safe code only. NOT the raw pg message, NOT ids.
      expect(joined).toMatch(/end_session_failed/);
      expect(joined).toMatch(/PGRST123/);
      expect(joined).not.toContain("u1");
      expect(joined).not.toContain("s1");
      expect(joined).not.toContain("detailed pg message");
    } finally {
      errorSpy.mockRestore();
    }
  });
});
