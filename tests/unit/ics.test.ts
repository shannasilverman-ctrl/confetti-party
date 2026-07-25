import { describe, expect, it } from "vitest";
import {
  buildGoogleCalendarUrl,
  buildIcsDocument,
  escapeIcsText,
  fnv1a32,
  foldIcsLine,
  icsFilename,
  stableIcsUid,
} from "@/lib/ics";

const FIXED_NOW = new Date(Date.UTC(2027, 4, 20, 12, 34, 56));

describe("fnv1a32 / stableIcsUid", () => {
  it("is deterministic", () => {
    expect(fnv1a32("abc")).toBe(fnv1a32("abc"));
    expect(stableIcsUid("token-xyz")).toBe(stableIcsUid("token-xyz"));
  });
  it("differs across seeds", () => {
    expect(stableIcsUid("a")).not.toBe(stableIcsUid("b"));
  });
  it("never contains the raw seed", () => {
    const seed = "supersecret-token-value";
    expect(stableIcsUid(seed)).not.toContain(seed);
  });
});

describe("escapeIcsText", () => {
  it("escapes RFC 5545 reserved characters", () => {
    expect(escapeIcsText("a\\b")).toBe("a\\\\b");
    expect(escapeIcsText("a;b")).toBe("a\\;b");
    expect(escapeIcsText("a,b")).toBe("a\\,b");
    expect(escapeIcsText("a\nb")).toBe("a\\nb");
    expect(escapeIcsText("a\r\nb")).toBe("a\\nb");
    expect(escapeIcsText("a\rb")).toBe("a\\nb");
  });
  it("blocks property injection via newlines", () => {
    const evil = "Party\r\nDTSTART:20000101T000000Z";
    const doc = buildIcsDocument(
      {
        date: "2027-05-22",
        title: evil,
        uidSeed: "seed",
        startTime: null,
      },
      FIXED_NOW,
    );
    // Injected line must be escaped, not appear as a raw property.
    const summaryLines = doc.split("\r\n").filter((l) => l.startsWith("SUMMARY"));
    expect(summaryLines.length).toBe(1);
    expect(doc).not.toMatch(/\r\nDTSTART:20000101T000000Z/);
  });
});

describe("foldIcsLine", () => {
  it("keeps short lines unchanged", () => {
    expect(foldIcsLine("SUMMARY:short")).toBe("SUMMARY:short");
  });
  it("folds long lines at 75 octets with CRLF + space", () => {
    const long = "X-LONG:" + "a".repeat(200);
    const folded = foldIcsLine(long);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    expect(new TextEncoder().encode(parts[0]).length).toBeLessThanOrEqual(75);
    for (let i = 1; i < parts.length; i++) {
      expect(parts[i].startsWith(" ")).toBe(true);
      expect(new TextEncoder().encode(parts[i]).length).toBeLessThanOrEqual(75);
    }
    // No data loss.
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join("")).toBe(long);
  });
  it("does not split inside a UTF-8 codepoint", () => {
    const line = "X:" + "😀".repeat(30);
    for (const p of foldIcsLine(line).split("\r\n")) {
      expect(() =>
        new TextDecoder("utf-8", { fatal: true }).decode(new TextEncoder().encode(p)),
      ).not.toThrow();
    }
  });
});

describe("buildIcsDocument", () => {
  const base = {
    date: "2027-05-22",
    title: "Maya's Birthday",
    location: "123 Main St",
    description: "See you there",
    uidSeed: "token-xyz",
  };

  it("emits a valid all-day event when no start time", () => {
    const doc = buildIcsDocument({ ...base, startTime: null }, FIXED_NOW);
    expect(doc.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(doc.endsWith("\r\n")).toBe(true);
    expect(doc).toContain("DTSTART;VALUE=DATE:20270522");
    // Exclusive DTEND is next day.
    expect(doc).toContain("DTEND;VALUE=DATE:20270523");
    expect(doc).toContain("DTSTAMP:20270520T123456Z");
    expect(doc).toContain("SUMMARY:Maya's Birthday");
    expect(doc).toContain("LOCATION:123 Main St");
  });

  it("emits a timed event with floating local DTSTART/DTEND", () => {
    const doc = buildIcsDocument({ ...base, startTime: "6:30 PM" }, FIXED_NOW);
    expect(doc).toMatch(/\r\nDTSTART:20270522T183000\r\n/);
    // Default 3h duration.
    expect(doc).toMatch(/\r\nDTEND:20270522T213000\r\n/);
    // No Z suffix on floating stamps.
    expect(doc).not.toMatch(/DTSTART:\d+T\d+Z/);
  });

  it("uses a stable UID across repeat renders", () => {
    const a = buildIcsDocument({ ...base, startTime: null }, FIXED_NOW);
    const b = buildIcsDocument(
      { ...base, startTime: null },
      new Date(FIXED_NOW.getTime() + 60_000),
    );
    const uidA = a.split("\r\n").find((l) => l.startsWith("UID:"));
    const uidB = b.split("\r\n").find((l) => l.startsWith("UID:"));
    expect(uidA).toBeDefined();
    expect(uidA).toBe(uidB);
  });

  it("handles midnight and date rollover for timed events", () => {
    const doc = buildIcsDocument({ ...base, startTime: "23:00" }, FIXED_NOW);
    expect(doc).toContain("DTSTART:20270522T230000");
    // 23:00 + 3h → next day 02:00 (floating).
    expect(doc).toContain("DTEND:20270523T020000");
  });

  it("throws on invalid dates", () => {
    expect(() =>
      buildIcsDocument({ ...base, date: "2027-13-40", startTime: null }, FIXED_NOW),
    ).toThrow();
  });
});

describe("buildGoogleCalendarUrl", () => {
  it("builds an all-day render URL", () => {
    const url = buildGoogleCalendarUrl({
      date: "2027-05-22",
      title: "Maya",
      startTime: null,
      uidSeed: "s",
    });
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("dates=20270522%2F20270523");
    expect(url).toContain("text=Maya");
  });
  it("builds a timed render URL", () => {
    const url = buildGoogleCalendarUrl({
      date: "2027-05-22",
      title: "Maya",
      startTime: "18:30",
      uidSeed: "s",
    });
    expect(url).toContain("dates=20270522T183000%2F20270522T213000");
  });
});

describe("icsFilename", () => {
  it("sanitizes titles and falls back to party.ics", () => {
    expect(icsFilename("Maya's 8th!")).toMatch(/\.ics$/);
    expect(icsFilename("")).toBe("party.ics");
    expect(icsFilename("***")).toBe("party.ics");
  });
});
