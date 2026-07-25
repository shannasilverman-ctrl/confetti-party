import { afterEach, describe, expect, it } from "vitest";
import { _keyedLockSize, _resetKeyedLocks, withKeyedLock } from "@/lib/user-mutex";

afterEach(() => _resetKeyedLocks());

describe("withKeyedLock", () => {
  it("serializes tasks with the same key (strict FIFO)", async () => {
    const order: string[] = [];
    const p1 = withKeyedLock("u1", async () => {
      order.push("start-a");
      await new Promise((r) => setTimeout(r, 15));
      order.push("end-a");
      return "a";
    });
    const p2 = withKeyedLock("u1", async () => {
      order.push("start-b");
      order.push("end-b");
      return "b";
    });
    expect(await Promise.all([p1, p2])).toEqual(["a", "b"]);
    expect(order).toEqual(["start-a", "end-a", "start-b", "end-b"]);
  });

  it("does NOT serialize different keys", async () => {
    let insideA = 0;
    let insideBOverlap = false;
    const a = withKeyedLock("A", async () => {
      insideA++;
      await new Promise((r) => setTimeout(r, 25));
      insideA--;
      return "a";
    });
    // While A is still running, B should be allowed to enter immediately.
    const b = withKeyedLock("B", async () => {
      if (insideA > 0) insideBOverlap = true;
      return "b";
    });
    await Promise.all([a, b]);
    expect(insideBOverlap).toBe(true);
  });

  it("rejection does not poison the next task on the same key", async () => {
    const rejected = withKeyedLock("k", async () => {
      throw new Error("boom");
    });
    await expect(rejected).rejects.toThrow("boom");
    const ok = await withKeyedLock("k", async () => "ok");
    expect(ok).toBe("ok");
  });

  it("registry returns to zero after success", async () => {
    await withKeyedLock("k", async () => "done");
    // Give the finally() microtask a tick to run.
    await new Promise((r) => setTimeout(r, 0));
    expect(_keyedLockSize()).toBe(0);
  });

  it("registry returns to zero after failure", async () => {
    await withKeyedLock("k", async () => {
      throw new Error("boom");
    }).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 0));
    expect(_keyedLockSize()).toBe(0);
  });

  it("registry stays bounded across many sequential tasks (no per-user leak)", async () => {
    for (let i = 0; i < 25; i++) {
      // eslint-disable-next-line no-await-in-loop
      await withKeyedLock(`user-${i}`, async () => i);
    }
    await new Promise((r) => setTimeout(r, 0));
    expect(_keyedLockSize()).toBe(0);
  });

  it("registry is bounded to the number of live in-flight keys", async () => {
    // Start two overlapping tasks with distinct keys.
    let releaseA!: () => void;
    let releaseB!: () => void;
    const a = withKeyedLock("A", () => new Promise<void>((r) => (releaseA = r)));
    const b = withKeyedLock("B", () => new Promise<void>((r) => (releaseB = r)));
    // Let the internal `.then(fn)` microtask run so fn actually starts.
    await Promise.resolve();
    await Promise.resolve();
    // Both keys should be tracked while their tasks are in flight.
    expect(_keyedLockSize()).toBe(2);
    releaseA();
    await a;
    await new Promise((r) => setTimeout(r, 0));
    expect(_keyedLockSize()).toBe(1);
    releaseB();
    await b;
    await new Promise((r) => setTimeout(r, 0));
    expect(_keyedLockSize()).toBe(0);
  });
});
