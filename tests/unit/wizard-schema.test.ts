import { describe, expect, it } from "vitest";
import { detectTimeZone, essentialsSchema, flattenErrors } from "@/lib/wizard-schema";

const FIXED_NOW = new Date(2030, 5, 1, 12, 0, 0); // 2030-06-01 local

function base() {
  return {
    name: "Ava's Housewarming",
    date: "2030-07-04",
    startTime: "6:30 PM",
    location: "The garden",
    guests: "24",
    budget: "500",
    timeZone: "America/New_York",
  };
}

describe("essentialsSchema", () => {
  it("accepts a well-formed payload and normalizes numbers", () => {
    const r = essentialsSchema(FIXED_NOW).safeParse(base());
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.guests).toBe(24);
      expect(r.data.budget).toBe(500);
      expect(r.data.startTime).toBe("6:30 PM");
      expect(r.data.location).toBe("The garden");
    }
  });

  it("rejects an empty name and past date", () => {
    const r = essentialsSchema(FIXED_NOW).safeParse({
      ...base(),
      name: "   ",
      date: "2020-01-01",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const errs = flattenErrors(r.error);
      expect(errs.name).toBeDefined();
      expect(errs.date).toBeDefined();
    }
  });

  it("rejects nonsensical times and hybrid PM", () => {
    for (const bad of ["13:00 PM", "0:30 PM", "25:00", "abc"]) {
      const r = essentialsSchema(FIXED_NOW).safeParse({ ...base(), startTime: bad });
      expect(r.success).toBe(false);
    }
  });

  it("bounds guests and budget", () => {
    const tooManyGuests = essentialsSchema(FIXED_NOW).safeParse({ ...base(), guests: "10000" });
    expect(tooManyGuests.success).toBe(false);
    const negBudget = essentialsSchema(FIXED_NOW).safeParse({ ...base(), budget: "-1" });
    expect(negBudget.success).toBe(false);
    const fractional = essentialsSchema(FIXED_NOW).safeParse({ ...base(), guests: "1.5" });
    expect(fractional.success).toBe(false);
  });

  it("requires a plausible time zone", () => {
    const r = essentialsSchema(FIXED_NOW).safeParse({ ...base(), timeZone: "not a zone!" });
    expect(r.success).toBe(false);
  });

  it("allows optional empty start time and location", () => {
    const r = essentialsSchema(FIXED_NOW).safeParse({
      ...base(),
      startTime: "",
      location: "",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.startTime).toBeUndefined();
      expect(r.data.location).toBeUndefined();
    }
  });
});

describe("detectTimeZone", () => {
  it("returns a non-empty IANA-shaped string", () => {
    const tz = detectTimeZone();
    expect(tz.length).toBeGreaterThan(0);
    expect(/^[A-Za-z0-9_+\-/]+$/.test(tz)).toBe(true);
  });
});
