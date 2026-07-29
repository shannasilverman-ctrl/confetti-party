import { describe, expect, it } from "vitest";
import { resolveTalkEventTimeZone, talkTimeZoneIssueMessage } from "@/lib/talk-time-zone";

describe("Talk time-zone confirmation", () => {
  it("does not require a zone for an all-day party", () => {
    expect(
      resolveTalkEventTimeZone({
        date: "2027-08-15",
        startTime: null,
        eventTimeZone: null,
      }),
    ).toEqual({ eventTimeZone: null, issue: null });
  });

  it("requires a host-confirmed zone for a timed party", () => {
    const result = resolveTalkEventTimeZone({
      date: "2027-08-15",
      startTime: "7:00 PM",
      eventTimeZone: "",
    });
    expect(result).toEqual({ eventTimeZone: null, issue: "missing-time-zone" });
    expect(talkTimeZoneIssueMessage(result.issue)).toMatch(/every guest sees the same moment/i);
  });

  it("canonicalizes aliases and accepts an unambiguous wall time", () => {
    expect(
      resolveTalkEventTimeZone({
        date: "2027-08-15",
        startTime: "7:00 PM",
        eventTimeZone: "US/Eastern",
      }),
    ).toEqual({ eventTimeZone: "America/New_York", issue: null });
  });

  it("rejects spring-forward gaps and fall-back overlaps", () => {
    expect(
      resolveTalkEventTimeZone({
        date: "2027-03-14",
        startTime: "2:30 AM",
        eventTimeZone: "America/New_York",
      }).issue,
    ).toBe("nonexistent-wall-time");
    expect(
      resolveTalkEventTimeZone({
        date: "2027-11-07",
        startTime: "1:30 AM",
        eventTimeZone: "America/New_York",
      }).issue,
    ).toBe("ambiguous-wall-time");
  });

  it("requires a zone but does not evaluate DST against a placeholder date", () => {
    expect(
      resolveTalkEventTimeZone({
        date: "2027-11-07",
        startTime: "1:30 AM",
        eventTimeZone: "America/New_York",
        dateIsPlaceholder: true,
      }),
    ).toEqual({ eventTimeZone: "America/New_York", issue: null });
  });
});
