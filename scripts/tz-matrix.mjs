#!/usr/bin/env node
/**
 * TZ-matrix proof: run the date-only helpers in a subprocess per IANA zone
 * and assert that "2027-05-22" always renders as May 22 and daysUntil
 * across DST/leap boundaries is stable.
 *
 * We spawn a child node process with TZ set in its environment, because
 * changing process.env.TZ after startup does not re-initialize Intl in
 * modern Node.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CHILD = path.join(__dirname, "tz-matrix-child.mjs");

const ZONES = [
  "Pacific/Honolulu",
  "America/Los_Angeles",
  "America/New_York",
  "Europe/London",
  "Asia/Kolkata",
  "Pacific/Auckland",
];

let failed = 0;
for (const tz of ZONES) {
  const res = spawnSync(process.execPath, [CHILD], {
    env: { ...process.env, TZ: tz },
    encoding: "utf8",
  });
  if (res.status !== 0) {
    console.error(`[${tz}] child failed:\n${res.stdout}\n${res.stderr}`);
    failed++;
    continue;
  }
  try {
    const out = JSON.parse(res.stdout);
    assert.equal(out.day, 22, `[${tz}] expected day 22`);
    assert.equal(out.month, 5, `[${tz}] expected month 5`);
    assert.equal(out.year, 2027, `[${tz}] expected year 2027`);
    assert.equal(
      out.formatted.includes("May 22"),
      true,
      `[${tz}] expected 'May 22' in "${out.formatted}"`,
    );
    assert.equal(out.plusOne, "2027-05-23", `[${tz}] +1 day mismatch`);
    assert.equal(out.leapPlusOne, "2024-02-29", `[${tz}] leap day mismatch`);
    assert.equal(out.dstSpring, 2, `[${tz}] DST spring diff`);
    assert.equal(out.dstFall, 2, `[${tz}] DST fall diff`);
    assert.equal(out.allDayStamp, "20270522", `[${tz}] all-day stamp mismatch`);
    console.log(`[${tz}] ok — ${out.formatted}`);
  } catch (e) {
    console.error(`[${tz}] assertion failed:`, e);
    failed++;
  }
}

if (failed) {
  console.error(`FAIL: ${failed} zones`);
  process.exit(1);
}
console.log(`OK: ${ZONES.length} zones`);
