import { describe, expect, it, vi } from "vitest";
import { createTalkLifecycle } from "@/lib/talk-lifecycle";

function makeLifecycle(overrides: Partial<Parameters<typeof createTalkLifecycle>[0]> = {}) {
  const calls: Array<{ sessionId: string; disconnectReason: string; durationS?: number }> = [];
  const endSession = vi.fn(async (input: (typeof calls)[number]) => {
    calls.push(input);
  });
  const lc = createTalkLifecycle({ endSession, ...overrides });
  return { lc, calls, endSession };
}

describe("createTalkLifecycle", () => {
  it("user stop ends the owned id exactly once", async () => {
    const { lc, calls } = makeLifecycle();
    lc.own("sess-1");
    await lc.end("user_ended");
    expect(calls).toEqual([
      expect.objectContaining({ sessionId: "sess-1", disconnectReason: "user_ended" }),
    ]);
  });

  it("connect failure ends the owned id even if no other signal fires", async () => {
    const { lc, endSession } = makeLifecycle();
    lc.own("sess-2");
    await lc.end("connect_failed");
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(endSession.mock.calls[0][0].disconnectReason).toBe("connect_failed");
    expect(lc.ownedId()).toBeNull();
  });

  it("pagehide + route_unmount for the same id call endSession at most once", async () => {
    const { lc, endSession } = makeLifecycle();
    lc.own("sess-3");
    // Fire both concurrently — realistic race on tab close during nav.
    await Promise.all([lc.end("pagehide"), lc.end("route_unmount")]);
    expect(endSession).toHaveBeenCalledTimes(1);
    // The first-in wins; either reason is acceptable, but only one call.
    expect(["pagehide", "route_unmount"]).toContain(endSession.mock.calls[0][0].disconnectReason);
  });

  it("duplicate error events on same id are no-ops after first end", async () => {
    const { lc, endSession } = makeLifecycle();
    lc.own("sess-4");
    await lc.end("voice_runtime");
    await lc.end("voice_runtime");
    await lc.end("route_unmount");
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  it("end() before own() is a no-op (never targets an unowned id)", async () => {
    const { lc, endSession } = makeLifecycle();
    await lc.end("pagehide");
    expect(endSession).not.toHaveBeenCalled();
  });

  it("only targets the currently owned id when a new own() replaces the prior one", async () => {
    const { lc, endSession } = makeLifecycle();
    lc.own("sess-first");
    await lc.end("user_ended");
    // A fresh connection reserves a new id.
    lc.own("sess-second");
    await lc.end("route_unmount");
    expect(endSession).toHaveBeenCalledTimes(2);
    expect(endSession.mock.calls.map((c) => c[0].sessionId)).toEqual(["sess-first", "sess-second"]);
  });

  it("swallows endSession errors — never throws from lifecycle end()", async () => {
    const failing = vi.fn(async () => {
      throw new Error("network down");
    });
    const lc = createTalkLifecycle({ endSession: failing });
    lc.own("sess-x");
    await expect(lc.end("pagehide")).resolves.toBeUndefined();
    expect(failing).toHaveBeenCalledTimes(1);
    // Even after failure the id is considered ended — no retries, no leak.
    await lc.end("route_unmount");
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it("computes duration seconds from a monotonic clock", async () => {
    let t = 1_000_000;
    const now = () => t;
    const { lc, calls } = makeLifecycle({ now });
    lc.own("sess-dur");
    t += 3500;
    await lc.end("user_ended");
    expect(calls[0].durationS).toBe(4);
  });
});
