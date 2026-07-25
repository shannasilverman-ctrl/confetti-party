import { describe, it, expect } from "vitest";
import { computeRateWindow } from "@/lib/talk-brain.functions";

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-01-01T12:00:00Z").getTime();

describe("computeRateWindow — rolling per-hour turn limit", () => {
  it("first turn on a fresh draft is allowed and starts the window", () => {
    const r = computeRateWindow({ aiTurns: 0, hourStartISO: null }, NOW);
    expect(r.allowed).toBe(true);
    expect(r.nextTurns).toBe(1);
    expect(new Date(r.nextHourStartISO).getTime()).toBe(NOW);
  });

  it("increments within the current hour without resetting the anchor", () => {
    const anchor = new Date(NOW - 10 * 60_000).toISOString(); // 10 min ago
    const r = computeRateWindow({ aiTurns: 5, hourStartISO: anchor }, NOW);
    expect(r.allowed).toBe(true);
    expect(r.nextTurns).toBe(6);
    expect(r.nextHourStartISO).toBe(anchor);
  });

  it("blocks the 41st turn inside the same window", () => {
    const anchor = new Date(NOW - 30 * 60_000).toISOString();
    const r = computeRateWindow({ aiTurns: 40, hourStartISO: anchor }, NOW);
    expect(r.allowed).toBe(false);
    expect(r.nextTurns).toBe(41);
  });

  it("RESETS the window when the anchor is older than one hour — this is the bug fix", () => {
    // Prior behavior: a lifetime ai_turns > 40 permanently blocked the caller
    // even after a full hour of quiet. New behavior: resets to 1.
    const stale = new Date(NOW - HOUR - 1000).toISOString();
    const r = computeRateWindow({ aiTurns: 500, hourStartISO: stale }, NOW);
    expect(r.allowed).toBe(true);
    expect(r.nextTurns).toBe(1);
    expect(new Date(r.nextHourStartISO).getTime()).toBe(NOW);
  });

  it("treats a missing anchor with a nonzero lifetime count as a fresh window", () => {
    const r = computeRateWindow({ aiTurns: 200, hourStartISO: null }, NOW);
    expect(r.allowed).toBe(true);
    expect(r.nextTurns).toBe(1);
  });
});
