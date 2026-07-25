import { describe, expect, it } from "vitest";
import {
  detectPack,
  getPack,
  listPacks,
  packBringBoard,
  packOccasion,
  packTasks,
} from "@/lib/holiday-packs";

const mkId = () => {
  let n = 0;
  return () => `id-${++n}`;
};

describe("holiday packs", () => {
  it("lists at least the core holiday packs", () => {
    const ids = listPacks().map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(["thanksgiving", "friendsgiving", "hanukkah"]));
    expect(listPacks().length).toBeGreaterThanOrEqual(5);
  });

  it("returns undefined for unknown pack ids and null-ish input", () => {
    expect(getPack(undefined)).toBeUndefined();
    expect(getPack(null)).toBeUndefined();
    expect(getPack("does-not-exist")).toBeUndefined();
  });

  it("detects packs case-insensitively and disambiguates friendsgiving", () => {
    expect(detectPack("planning a Thanksgiving dinner")?.id).toBe("thanksgiving");
    expect(detectPack("hosting FRIENDSGIVING this year")?.id).toBe("friendsgiving");
    expect(detectPack("just a birthday party")).toBeUndefined();
  });

  it("materializes task and bring-board seeds with unique ids", () => {
    const pack = getPack("thanksgiving")!;
    const tasks = packTasks(pack, mkId());
    const bring = packBringBoard(pack, mkId());
    expect(tasks.length).toBe(pack.taskSeeds.length);
    expect(new Set(tasks.map((t) => t.id)).size).toBe(tasks.length);
    expect(tasks.every((t) => t.done === false)).toBe(true);
    expect(bring.every((b) => b.status === "open" && b.source === "host")).toBe(true);
  });

  it("maps every pack to the holiday occasion", () => {
    for (const p of listPacks()) {
      expect(packOccasion(p)).toBe("holiday");
    }
  });
});
