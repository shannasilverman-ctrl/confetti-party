import { describe, expect, it } from "vitest";
import type { PartyView } from "@/lib/rsvp.functions";
import { buildIcs, foldIcsLine, googleCalUrl } from "@/lib/calendar-export";

const PARTY: PartyView = {
  name: "Ava & Liam's Wedding",
  date: "2027-05-22",
  start_time: "6:30 PM",
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

    expect(uid).toMatch(/^confetti-[0-9a-f]{8}@confetti-party\.lovable\.app\r?$/);
    expect(second).toContain(`UID:${uid?.replace(/\r$/, "")}`);
    expect(first).toContain("DTSTAMP:20270102T030405Z\r\n");
    expect(first).toContain("DTSTART:20270522T183000\r\n");
    expect(first).toContain("DTEND:20270522T213000\r\n");
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
  });
});
