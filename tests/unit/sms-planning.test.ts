import { describe, expect, it } from "vitest";
import {
  EMPTY_SMS_PLANNING_STATE,
  planSmsMessage,
  type SmsPlanningState,
} from "@/lib/sms-planning";

const NOW = new Date(2026, 6, 28, 12);

describe("provider-independent SMS planning", () => {
  it("starts an adult birthday without falling into the preschool flow", () => {
    const result = planSmsMessage(
      EMPTY_SMS_PLANNING_STATE,
      "Bday for a 54 yr old, about 25 people",
      { now: NOW },
    );

    expect(result.state.draft).toMatchObject({
      identity: { occasion: "birthday", honoreeAge: 54 },
      people: { expectedCount: 25 },
    });
    expect(result.reply).toContain("54th Birthday");
    expect(result.reply).toContain("What date");
    expect(result.reply).toContain("Reply STOP");
    expect(result.reply).not.toContain("play venue");
  });

  it("merges later answers and marks a useful draft ready for secure claim", () => {
    const first = planSmsMessage(
      EMPTY_SMS_PLANNING_STATE,
      "A relaxed 54th birthday for 25 people",
      { now: NOW },
    );
    const second = planSmsMessage(first.state, "August 15 at home", { now: NOW });

    expect(second.readyForClaim).toBe(true);
    expect(second.state.draft).toMatchObject({
      identity: { occasion: "birthday", honoreeAge: 54, tone: "relaxed" },
      when: { date: "2026-08-15" },
      where: { venueKind: "home" },
      people: { expectedCount: 25 },
    });
    expect(second.reply).toContain("ready to continue securely online");
  });

  it("lets a host correct an age without losing earlier facts", () => {
    const first = planSmsMessage(
      EMPTY_SMS_PLANNING_STATE,
      "A 54th birthday on August 15 for 25 people",
      { now: NOW },
    );
    const corrected = planSmsMessage(first.state, "Actually, she is turning 55", { now: NOW });

    expect(corrected.state.draft).toMatchObject({
      identity: { occasion: "birthday", honoreeAge: 55 },
      when: { date: "2026-08-15" },
      people: { expectedCount: 25 },
    });
  });

  it("handles compliance commands before planning", () => {
    const planning = planSmsMessage(EMPTY_SMS_PLANNING_STATE, "A birthday", { now: NOW });
    const stopped = planSmsMessage(planning.state, "STOP", { now: NOW });
    const ignored = planSmsMessage(stopped.state, "August 15", { now: NOW });
    const resumed = planSmsMessage(ignored.state, "START", { now: NOW });

    expect(stopped.kind).toBe("stopped");
    expect(stopped.state.status).toBe("stopped");
    expect(ignored).toMatchObject({ kind: "ignored", reply: null, readyForClaim: false });
    expect(ignored.state.draft).toEqual(planning.state.draft);
    expect(resumed.kind).toBe("resumed");
    expect(resumed.state.status).toBe("active");
    expect(resumed.reply).toContain("Reply STOP");
  });

  it.each(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"])(
    "recognizes the standard opt-out keyword %s",
    (keyword) => {
      const result = planSmsMessage(EMPTY_SMS_PLANNING_STATE, keyword, { now: NOW });
      expect(result).toMatchObject({
        kind: "stopped",
        state: { status: "stopped" },
        readyForClaim: false,
      });
    },
  );

  it("provides help without changing or incrementing the draft", () => {
    const state: SmsPlanningState = {
      status: "active",
      draft: { identity: { occasion: "birthday", honoreeAge: 54 } },
      turnCount: 1,
    };
    const result = planSmsMessage(state, "HELP", { now: NOW });

    expect(result.kind).toBe("help");
    expect(result.state).toEqual(state);
    expect(result.reply).toContain("RESET");
    expect(result.reply).toContain("STOP");
  });

  it("provides HELP while stopped without reactivating the thread", () => {
    const state: SmsPlanningState = {
      status: "stopped",
      draft: { identity: { occasion: "birthday", honoreeAge: 54 } },
      turnCount: 1,
    };
    const result = planSmsMessage(state, "HELP", { now: NOW });

    expect(result.kind).toBe("help");
    expect(result.state).toEqual(state);
    expect(result.state.status).toBe("stopped");
    expect(result.reply).toContain("STOP");
  });

  it("clears the draft only on an explicit reset command", () => {
    const first = planSmsMessage(EMPTY_SMS_PLANNING_STATE, "A 54th birthday", { now: NOW });
    const reset = planSmsMessage(first.state, "RESET", { now: NOW });

    expect(reset.kind).toBe("reset");
    expect(reset.state).toEqual(EMPTY_SMS_PLANNING_STATE);
    expect(reset.reply).toContain("draft is cleared");
  });
});
