import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  canonicalHash,
  classifyPaths,
  planFirebaseExport,
} from "../../tools/migration/plan-firebase-export.mjs";

async function fixture() {
  return JSON.parse(
    await readFile("tools/migration/fixtures/firebase-sanitized-v1.json", "utf8"),
  ) as Record<string, unknown>;
}

async function fieldMap() {
  return JSON.parse(await readFile("tools/migration/firebase-field-map-v1.json", "utf8")) as {
    sourceTenant: string;
    version: string;
    fields: { path: string }[];
  };
}

describe("Firebase migration dry-run", () => {
  it("classifies every sanitized known path and emits no source PII", async () => {
    const payload = await fixture();
    const plan = await planFirebaseExport(payload, {
      hmacKey: "test-only-migration-hmac-key-123456789",
    });
    expect(plan.unknownPathCount).toBe(0);
    expect(plan.counts).toMatchObject({ auth: 1, events: 1, invitations: 1, bookings: 1 });
    const serialized = JSON.stringify(plan);
    for (const secret of [
      "Sample Host",
      "guest@example.invalid",
      "ABC123",
      "sanitized-owner-uid",
      "Sanitized message",
    ])
      expect(serialized).not.toContain(secret);
  });

  it("fails closed when the export contains an unknown field", async () => {
    const payload = await fixture();
    (payload as { events: Record<string, { data: Record<string, unknown> }> }).events.ABC123.data[
      "surpriseUnknown"
    ] = "must not disappear";
    await expect(
      planFirebaseExport(payload, {
        hmacKey: "test-only-migration-hmac-key-123456789",
      }),
    ).rejects.toMatchObject({
      code: "UNCLASSIFIED_FIELDS",
      unknownPaths: ["events.*.data.surpriseUnknown"],
    });
  });

  it.each([{}, []])("fails closed on an unknown empty structural field", async (value) => {
    const payload = await fixture();
    (payload as { events: Record<string, { data: Record<string, unknown> }> }).events.ABC123.data[
      "surpriseUnknown"
    ] = value;
    await expect(
      planFirebaseExport(payload, {
        hmacKey: "test-only-migration-hmac-key-123456789",
      }),
    ).rejects.toMatchObject({ code: "UNCLASSIFIED_FIELDS" });
  });

  it("canonical hashes do not depend on object key order", () => {
    expect(canonicalHash({ a: 1, b: { c: 2, d: 3 } })).toBe(
      canonicalHash({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  it("reports no unclassified path in the checked-in fixture", async () => {
    expect(classifyPaths(await fixture(), await fieldMap()).unknownPaths).toEqual([]);
  });
});
