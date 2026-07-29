import { describe, expect, it } from "vitest";
import type { PartyView } from "@/lib/rsvp.functions";
import {
  buildIcs,
  calendarExportIssue,
  foldIcsLine,
  googleCalUrl,
  isValidEventTimeZone,
  zonedWallTimeToUtc,
} from "@/lib/calendar-export";

const PARTY: PartyView = {
  name: "Ava & Liam's Wedding",
  date: "2027-05-22",
  start_time: "6:30 PM",
  event_time_zone: "America/New_York",
  location: "Garden Hall, 10 Main St",
  occasion: "wedding",
  theme_id: null,
  theme: null,
  host_note: null,
  holiday_pack_id: null,
  host_updates: [],
  bring_board: [],
  photo_drop: null,
  yes_count: 0,
  maybe_count: 0,
  total_count: 0,
};

describe("calendar export", () => {
  it("keeps a stable UID while emitting a UTC DTSTAMP", () => {
    const first = buildIcs(PARTY, new Date("2027-01-02T03:04:05.000Z"));
    const second = buildIcs(PARTY, new Date("2027-02-03T04:05:06.000Z"));
    const uid = first.match(/^UID:(.+)$/m)?.[1];

    expect(uid).toMatch(/^confetti-[0-9a-f]{8}@confettiapp\.ai\r?$/);
    expect(second).toContain(`UID:${uid?.replace(/\r$/, "")}`);
    expect(first).toContain("DTSTAMP:20270102T030405Z\r\n");
    expect(first).toContain("DTSTART:20270522T223000Z\r\n");
    expect(first).toContain("DTEND:20270523T013000Z\r\n");
    expect(first.endsWith("\r\n")).toBe(true);
    expect(first.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("escapes untrusted content without allowing injected ICS lines", () => {
    const ics = buildIcs(
      {
        ...PARTY,
        name: "Dinner,\r\nATTENDEE:bad@example.com",
        location: "Room A; west\\wing",
      },
      new Date("2027-01-02T03:04:05.000Z"),
    );

    expect(ics).toContain("SUMMARY:Dinner\\,\\nATTENDEE:bad@example.com");
    expect(ics).toContain("LOCATION:Room A\\; west\\\\wing");
    expect(ics).not.toContain("\r\nATTENDEE:");
  });

  it("uses custom reminder details without allowing injected ICS lines", () => {
    const details = "Suggested by Confetti,\r\nATTENDEE:bad@example.com";
    const entry = { ...PARTY, start_time: null, details };
    const ics = buildIcs(entry, new Date("2027-01-02T03:04:05.000Z"));
    const url = new URL(googleCalUrl(entry));

    expect(url.searchParams.get("details")).toBe(details);
    expect(ics).toContain("DESCRIPTION:Suggested by Confetti\\,\\nATTENDEE:bad@example.com");
    expect(ics).not.toContain("\r\nATTENDEE:");
  });

  it("folds every physical line to 75 UTF-8 octets or fewer", () => {
    const ics = buildIcs(
      { ...PARTY, name: `A celebration ${"🎉".repeat(40)} with everybody` },
      new Date("2027-01-02T03:04:05.000Z"),
    );

    for (const line of ics.split("\r\n").filter(Boolean)) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(foldIcsLine("SUMMARY:short")).toEqual(["SUMMARY:short"]);
  });

  it("uses an exclusive end date for all-day events", () => {
    const ics = buildIcs({ ...PARTY, start_time: null }, new Date("2027-01-02T03:04:05.000Z"));
    expect(ics).toContain("DTSTART;VALUE=DATE:20270522\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20270523\r\n");

    const url = new URL(googleCalUrl({ ...PARTY, start_time: null }));
    expect(url.searchParams.get("dates")).toBe("20270522/20270523");
    expect(url.searchParams.has("ctz")).toBe(false);
  });

  it("exports the Tuscany sample as one absolute instant for every guest", () => {
    const party = {
      ...PARTY,
      start_time: "5:30 PM",
      event_time_zone: "Europe/Rome",
      location: "Tenuta di Fiore, Tuscany",
    };
    const ics = buildIcs(party, new Date("2027-01-02T03:04:05.000Z"));
    const url = new URL(googleCalUrl(party));

    expect(ics).toContain("DTSTART:20270522T153000Z\r\n");
    expect(ics).toContain("DTEND:20270522T183000Z\r\n");
    expect(url.searchParams.get("dates")).toBe("20270522T173000/20270522T203000");
    expect(url.searchParams.get("ctz")).toBe("Europe/Rome");
  });

  it("handles seasonal offsets without depending on the process time zone", () => {
    expect(zonedWallTimeToUtc("2027-01-22", "5:30 PM", "Europe/Rome").toISOString()).toBe(
      "2027-01-22T16:30:00.000Z",
    );
    expect(zonedWallTimeToUtc("2027-07-22", "5:30 PM", "Europe/Rome").toISOString()).toBe(
      "2027-07-22T15:30:00.000Z",
    );
  });

  it("validates IANA zones and fails closed for missing or nonexistent timed exports", () => {
    expect(isValidEventTimeZone("America/New_York")).toBe(true);
    expect(isValidEventTimeZone("Europe/Rome")).toBe(true);
    expect(isValidEventTimeZone("UTC")).toBe(true);
    expect(isValidEventTimeZone("Tuscany")).toBe(false);
    expect(isValidEventTimeZone("+02:00")).toBe(false);
    expect(isValidEventTimeZone("Not/A_Real_Zone")).toBe(false);

    const missing = { ...PARTY, event_time_zone: null };
    expect(calendarExportIssue(missing)).toBe("missing-time-zone");
    expect(() => googleCalUrl(missing)).toThrow(/time zone/i);
    expect(() => zonedWallTimeToUtc("2027-03-14", "2:30 AM", "America/New_York")).toThrow(
      /does not exist/i,
    );
  });
});
