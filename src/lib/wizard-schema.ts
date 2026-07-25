// Validation contract for the New Party wizard. Kept pure so unit tests
// can drive it deterministically without React or Radix.
//
// Every field returns a friendly, non-enumerating message on failure.
// Callers preserve inputs and render errors inline via aria-live regions.

import { z } from "zod";
import { isValidDateOnly, localDateToDateOnly, parseWallClockTime } from "./date-only";

const NAME_MAX = 80;
const LOCATION_MAX = 200;
const GUEST_MIN = 1;
const GUEST_MAX = 500;
const BUDGET_MIN = 0;
const BUDGET_MAX = 1_000_000;
const TIMEZONE_MAX = 60;
const TIMEZONE_RE = /^[A-Za-z0-9_+\-/]+$/;

/** Trimmed non-empty display name. */
export const nameField = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1, "Please add a party name.").max(NAME_MAX, "Name is too long."));

/** Whitelisted IANA-shaped zone string. Callers may seed from Intl. */
export const timeZoneField = z
  .string()
  .transform((s) => s.trim())
  .pipe(
    z
      .string()
      .min(1, "Pick a time zone.")
      .max(TIMEZONE_MAX, "Time zone name is too long.")
      .regex(TIMEZONE_RE, "That doesn't look like a valid time zone."),
  );

/** Optional wall-clock time. Empty is allowed and returns undefined. */
export const startTimeField = z
  .string()
  .transform((s) => s.trim())
  .pipe(
    z
      .string()
      .refine((s) => s === "" || parseWallClockTime(s) !== null, {
        message: "Use a time like 2:00 PM or 14:00.",
      })
      .transform((s) => (s === "" ? undefined : s)),
  );

export const locationField = z
  .string()
  .transform((s) => s.trim())
  .pipe(
    z
      .string()
      .max(LOCATION_MAX, "Location is too long.")
      .transform((s) => (s === "" ? undefined : s)),
  );

export const guestsField = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "string" ? v.trim() : String(v)))
  .pipe(
    z
      .string()
      .regex(/^-?\d+$/, "Enter a whole number of guests.")
      .transform((s) => Number(s))
      .refine((n) => Number.isFinite(n) && Number.isInteger(n), {
        message: "Enter a whole number of guests.",
      })
      .refine((n) => n >= GUEST_MIN, { message: `At least ${GUEST_MIN} guest.` })
      .refine((n) => n <= GUEST_MAX, {
        message: `Up to ${GUEST_MAX} guests per party.`,
      }),
  );

export const budgetField = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "string" ? v.trim() : String(v)))
  .pipe(
    z
      .string()
      .regex(/^-?\d+(\.\d{1,2})?$/, "Enter a budget amount.")
      .transform((s) => Math.round(Number(s)))
      .refine((n) => Number.isFinite(n), { message: "Enter a valid budget." })
      .refine((n) => n >= BUDGET_MIN, { message: "Budget can't be negative." })
      .refine((n) => n <= BUDGET_MAX, { message: "Budget is too large." }),
  );

/** Strict date-only. Past dates are rejected unless `allowPast` is true. */
export function dateField(now: Date = new Date(), allowPast = false) {
  const todayIso = localDateToDateOnly(now);
  return z
    .string()
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .refine((s) => isValidDateOnly(s), { message: "Pick a valid date." })
        .refine((s) => allowPast || s >= todayIso, {
          message: "Pick today or a future date.",
        }),
    );
}

/** Step-2 essentials — combined for a single form submit. */
export function essentialsSchema(now: Date = new Date(), allowPast = false) {
  return z.object({
    name: nameField,
    date: dateField(now, allowPast),
    startTime: startTimeField.optional().default(""),
    location: locationField.optional().default(""),
    guests: guestsField,
    budget: budgetField,
    timeZone: timeZoneField,
  });
}

export type EssentialsInput = z.input<ReturnType<typeof essentialsSchema>>;
export type EssentialsOutput = z.output<ReturnType<typeof essentialsSchema>>;

/** Detect a reasonable IANA default for the current browser. */
export function detectTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && TIMEZONE_RE.test(tz) && tz.length <= TIMEZONE_MAX) return tz;
  } catch {
    /* fall through */
  }
  return "UTC";
}

/** List of IANA zones for pickers. Falls back to a small curated set. */
export function supportedTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  if (typeof intl.supportedValuesOf === "function") {
    try {
      return intl.supportedValuesOf("timeZone");
    } catch {
      /* fall through */
    }
  }
  return [
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Toronto",
    "America/Mexico_City",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Europe/Madrid",
    "Asia/Jerusalem",
    "Asia/Dubai",
    "Asia/Kolkata",
    "Asia/Tokyo",
    "Australia/Sydney",
  ];
}

/** Format zod errors into a { field: message } map, safely. */
export function flattenErrors<T extends z.ZodTypeAny>(err: z.ZodError<z.infer<T>>): {
  [k: string]: string;
} {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && out[key] === undefined) out[key] = issue.message;
  }
  return out;
}
