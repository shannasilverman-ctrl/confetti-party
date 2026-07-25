import { describe, expect, it } from "vitest";
import { demoReply, DEMO_MAX_TURNS } from "@/lib/talk-demo";

describe("talk-demo", () => {
  it("provides a finite sequence of turns", () => {
    expect(DEMO_MAX_TURNS).toBeGreaterThan(0);
  });

  it("marks the final turn complete and steers toward sign-up", () => {
    const last = demoReply(DEMO_MAX_TURNS - 1);
    expect(last.complete).toBe(true);
    expect(last.reply.toLowerCase()).toMatch(/sign up|save/);
  });

  it("returns non-empty replies with warm on-brand tone (no exclamation, no emoji)", () => {
    for (let i = 0; i < DEMO_MAX_TURNS; i++) {
      const t = demoReply(i);
      expect(t.reply.length).toBeGreaterThan(20);
      expect(t.reply).not.toMatch(/!/);
      // Rough emoji check — no BMP pictographs.
      expect(t.reply).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    }
  });

  it("clamps past the end of the sequence", () => {
    const overflow = demoReply(DEMO_MAX_TURNS + 5);
    expect(overflow.reply).toBe(demoReply(DEMO_MAX_TURNS - 1).reply);
  });
});
