import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  buildFirebaseRehearsalPackage,
  compareFirebaseRehearsalPackages,
  InMemoryMigrationLedger,
  MIGRATED_FIELD_CONSUMERS,
  reconcileFirebaseRehearsal,
  runFirebaseRehearsal,
  type FirebaseRehearsalPackage,
} from "../../tools/migration/rehearse-firebase-export.mjs";
import {
  planFirebaseExport,
  validateFieldMap,
} from "../../tools/migration/plan-firebase-export.mjs";

const KEY = "test-only-rehearsal-hmac-key-123456789";
const OTHER_KEY = "other-test-rehearsal-hmac-key-987654321";
const OPTIONS = { hmacKey: KEY, keyId: "test-v1" };

type Fixture = {
  meta: { sanitized: boolean; snapshotAt: string; sourceTenant: string };
  auth: Array<Record<string, unknown>>;
  users: Record<string, Record<string, unknown>>;
  events: Record<
    string,
    {
      ownerUid: string;
      updatedAt: string;
      data: {
        title: string;
        members: Array<{ role: string } & Record<string, unknown>>;
      } & Record<string, unknown>;
    } & Record<string, unknown>
  >;
  vendors: Record<string, Record<string, unknown>>;
  bookings: Record<string, { vendorUid: string } & Record<string, unknown>>;
  integrations: Record<string, Record<string, unknown>>;
  storage: { attachments: Array<Record<string, unknown>> };
};

async function fixture(): Promise<Fixture> {
  return JSON.parse(
    await readFile("tools/migration/fixtures/firebase-sanitized-v1.json", "utf8"),
  ) as Fixture;
}

async function fieldMap(): Promise<{
  fields: Array<Record<string, unknown>>;
  [key: string]: unknown;
}> {
  return JSON.parse(await readFile("tools/migration/firebase-field-map-v1.json", "utf8")) as {
    fields: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, item]) => [key, reverseObjectKeys(item)]),
    );
  }
  return value;
}

async function packageFor(
  mutate?: (payload: Fixture) => void,
  options: { hmacKey: string; keyId: string; fieldMap?: unknown } = OPTIONS,
): Promise<FirebaseRehearsalPackage> {
  const payload = await fixture();
  mutate?.(payload);
  return buildFirebaseRehearsalPackage(payload, options);
}

describe("Firebase credential-free shadow rehearsal", () => {
  it("emits a deterministic, redacted, explicitly non-production report", async () => {
    const payload = await fixture();
    const first = await runFirebaseRehearsal(payload, OPTIONS);
    const second = await runFirebaseRehearsal(reverseObjectKeys(payload), OPTIONS);
    const frozenBundle = await buildFirebaseRehearsalPackage(payload, OPTIONS);

    expect(second).toEqual(first);
    expect(Object.isFrozen(frozenBundle)).toBe(true);
    expect(Object.isFrozen(frozenBundle.records[0].targetPayload)).toBe(true);
    expect(first).toMatchObject({
      rehearsalOnly: true,
      databaseWrites: false,
      productionReady: false,
      idempotency: {
        firstApply: { created: 17, updated: 0, unchanged: 0 },
        identicalReplay: { created: 0, updated: 0, unchanged: 17 },
      },
      reconciliation: { ok: true, expectedTargets: 17, actualTargets: 17 },
    });

    const serialized = JSON.stringify(first);
    for (const rawValue of [
      "Sample Host",
      "Sample Guest",
      "guest@example.invalid",
      "host@example.invalid",
      "vendor@example.invalid",
      "sanitized-owner-uid",
      "sanitized-vendor-uid",
      "ABC123",
      "SANITIZED_REAUTHORIZE",
      "Sanitized message",
      "https://example.invalid/sample.pdf",
      "attachments/sanitized/sample.pdf",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ])
      expect(serialized).not.toContain(rawValue);
    expect(serialized).not.toContain("canonicalPayloadHash");
  });

  it("requires an explicit secret and non-secret key id even for sanitized input", async () => {
    const payload = await fixture();
    await expect(
      buildFirebaseRehearsalPackage(payload, {
        hmacKey: "",
        keyId: "test-v1",
      }),
    ).rejects.toThrow(/32\+ byte migration HMAC key/);
    await expect(
      buildFirebaseRehearsalPackage(payload, {
        hmacKey: KEY,
        keyId: "../unsafe",
      }),
    ).rejects.toMatchObject({ code: "INVALID_KEY_ID" });
  });

  it("domain-separates identities and changes opaque evidence when the key changes", async () => {
    const first = await packageFor();
    const second = await packageFor(undefined, { hmacKey: OTHER_KEY, keyId: "test-v2" });
    const firstIdentity = first.manifest.records.find((record) => record.kind === "auth_identity");
    const firstProfile = first.manifest.records.find((record) => record.kind === "user_profile");

    expect(firstIdentity?.sourceRef).not.toBe(firstProfile?.sourceRef);
    expect(second.manifest.sourceRoot).not.toBe(first.manifest.sourceRoot);
    expect(new Set(second.manifest.records.map((record) => record.sourceRef))).not.toContain(
      firstIdentity?.sourceRef,
    );
  });

  it("never copies legacy authority or integration and contact secrets into shadow targets", async () => {
    const bundle = await packageFor();
    const targets = JSON.stringify(bundle.records.map((record) => record.targetPayload));

    expect(targets).not.toContain("SANITIZED_REAUTHORIZE");
    expect(targets).not.toContain("guest@example.invalid");
    expect(targets).not.toContain("host@example.invalid");
    expect(targets).not.toContain("ABC123");
    expect(targets).not.toContain("invite:");
    expect(bundle.manifest.decisionCounts).toEqual({
      archive: 8,
      migrate: 5,
      reauthorize: 4,
    });
    expect(bundle.records.find((record) => record.kind === "user_profile")?.targetKind).toBe(
      "legacy_link_candidate",
    );

    const party = bundle.records.find((record) => record.kind === "party")?.targetPayload as {
      guests: Array<Record<string, unknown>>;
    };
    expect(party.guests[0]).toMatchObject({
      name: "Sample Guest",
      kind: "adult",
      rsvp: "invited",
    });
    expect(party.guests[0]).not.toHaveProperty("email");
  });

  it("fails closed on malformed roots, relationships, timestamps, roles, and providers", async () => {
    await expect(
      packageFor((payload) => {
        payload.auth[0].providers = ["unknown-provider"];
      }),
    ).rejects.toMatchObject({ code: "UNKNOWN_AUTH_PROVIDER" });
    await expect(
      packageFor((payload) => {
        payload.events.ABC123.ownerUid = "missing-owner";
      }),
    ).rejects.toMatchObject({ code: "DANGLING_OWNER" });
    await expect(
      packageFor((payload) => {
        payload.events.ABC123.data.members[0].role = "viewer";
      }),
    ).rejects.toMatchObject({ code: "UNKNOWN_MEMBER_ROLE" });
    for (const status of ["removed", "revoked", "pending", "typo"]) {
      await expect(
        packageFor((payload) => {
          payload.events.ABC123.data.members[0].status = status;
        }),
      ).rejects.toMatchObject({ code: "UNSAFE_MEMBER_STATUS" });
    }
    for (const invalidName of ["x".repeat(81), "Line\nbreak", "nul\u0000byte"]) {
      await expect(
        packageFor((payload) => {
          payload.events.ABC123.data.members[0].name = invalidName;
        }),
      ).rejects.toMatchObject({ code: "INVALID_DISPLAY_NAME" });
    }
    await expect(
      packageFor((payload) => {
        payload.events.ABC123.updatedAt = "2026-07-29T12:00:00.000Z";
      }),
    ).rejects.toMatchObject({ code: "FUTURE_TIMESTAMP" });
    await expect(
      packageFor((payload) => {
        payload.bookings["booking-1"].vendorUid = "missing-vendor";
      }),
    ).rejects.toMatchObject({ code: "DANGLING_BOOKING_VENDOR" });
    await expect(
      packageFor((payload) => {
        payload.bookings["booking-1"].createdAt = "2026-07-22T10:00:00.000Z";
      }),
    ).rejects.toMatchObject({ code: "INVALID_TIMESTAMP_ORDER" });
    await expect(
      packageFor((payload) => {
        payload.storage.attachments[0].size = 1.5;
      }),
    ).rejects.toMatchObject({ code: "INVALID_VALUE" });
    await expect(
      packageFor((payload) => {
        payload.events.ABC123.data.members = [];
      }),
    ).rejects.toMatchObject({ code: "OWNER_CARDINALITY" });
    await expect(
      packageFor((payload) => {
        const guests = payload.events.ABC123.data.guests as Array<Record<string, unknown>>;
        guests.push(clone(guests[0]));
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_SOURCE_ENTITY" });
    await expect(
      packageFor((payload) => {
        const pins = payload.events.ABC123.data.pins as Array<Record<string, unknown>>;
        pins[0].url = "javascript:alert(1)";
      }),
    ).rejects.toMatchObject({ code: "INVALID_URL" });
    for (const invalidDate of ["2026-02-29", "2026-02-30", "2026-04-31"]) {
      await expect(
        packageFor((payload) => {
          payload.events.ABC123.data.date = invalidDate;
        }),
      ).rejects.toMatchObject({ code: "INVALID_DATE" });
    }
    await expect(
      packageFor((payload) => {
        payload.events.ABC123.data.date = "2028-02-29";
      }),
    ).resolves.toBeDefined();
    await expect(
      packageFor((payload) => {
        (payload as Fixture & { surprise?: unknown }).surprise = {};
      }),
    ).rejects.toMatchObject({ code: "INVALID_ROOT" });
  });

  it("rejects duplicate field-map rules and never emits an unkeyed export hash", async () => {
    const payload = await fixture();
    const map = await fieldMap();
    map.fields.push(clone(map.fields[0]));
    expect(() => validateFieldMap(map)).toThrow(/duplicate path/);

    const plan = await planFirebaseExport(payload, {
      hmacKey: KEY,
    });
    expect(plan).not.toHaveProperty("canonicalPayloadHash");
    expect(plan.opaquePayloadDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("couples every migrate decision to a reviewed transform consumer", async () => {
    const map = await fieldMap();
    expect(Object.keys(MIGRATED_FIELD_CONSUMERS).sort()).toEqual(
      map.fields
        .filter((field) => field.action === "migrate")
        .map((field) => field.path)
        .sort(),
    );

    const changedMap = clone(map);
    const title = changedMap.fields.find((field) => field.path === "events.*.data.title")!;
    title.action = "archive";
    title.destination = "migration_archive.payload_digest";
    await expect(packageFor(undefined, { ...OPTIONS, fieldMap: changedMap })).rejects.toMatchObject(
      { code: "TRANSFORM_CONTRACT_MISMATCH" },
    );

    const sameMigrateSet = clone(map);
    const emoji = sameMigrateSet.fields.find((field) => field.path === "events.*.data.emoji")!;
    emoji.destination = "different_archive.payload_digest";
    await expect(
      packageFor(undefined, { ...OPTIONS, fieldMap: sameMigrateSet }),
    ).rejects.toMatchObject({ code: "FIELD_MAP_CONTRACT_MISMATCH" });
  });

  it("normalizes valid display names and preserves exact pin archive evidence", async () => {
    const normalized = await packageFor((payload) => {
      payload.users["sanitized-owner-uid"].name = "  Sample   Host  ";
      payload.events.ABC123.data.members[0].name = "  Sample   Host  ";
    });
    expect(
      (
        normalized.records.find((record) => record.kind === "user_profile")
          ?.targetPayload as Record<string, unknown>
      ).displayName,
    ).toBe("Sample Host");
    expect(
      (
        normalized.records.find((record) => record.kind === "party_membership")
          ?.targetPayload as Record<string, unknown>
      ).displayName,
    ).toBe("Sample Host");

    const withoutSlash = await packageFor((payload) => {
      const pins = payload.events.ABC123.data.pins as Array<Record<string, unknown>>;
      pins[0].url = "https://example.invalid";
    });
    const withSlash = await packageFor((payload) => {
      const pins = payload.events.ABC123.data.pins as Array<Record<string, unknown>>;
      pins[0].url = "https://example.invalid/";
    });
    expect(
      withoutSlash.records.find((record) => record.kind === "inspiration_archive")
        ?.sourceRevisionDigest,
    ).not.toBe(
      withSlash.records.find((record) => record.kind === "inspiration_archive")
        ?.sourceRevisionDigest,
    );
  });

  it("uses unambiguous structured identities for composite source records", async () => {
    const left = await packageFor((payload) => {
      payload.auth[0].uid = "a:b";
      payload.users["a:b"] = payload.users["sanitized-owner-uid"];
      delete payload.users["sanitized-owner-uid"];
      payload.events.ABC123.ownerUid = "a:b";
      payload.events.ABC123.data.members[0].uid = "a:b";
      payload.bookings["booking-1"].plannerUid = "a:b";
      const tokens = payload.users["a:b"].fcmTokens as string[];
      tokens[0] = "c";
    });
    const right = await packageFor((payload) => {
      payload.auth[0].uid = "a";
      payload.users.a = payload.users["sanitized-owner-uid"];
      delete payload.users["sanitized-owner-uid"];
      payload.events.ABC123.ownerUid = "a";
      payload.events.ABC123.data.members[0].uid = "a";
      payload.bookings["booking-1"].plannerUid = "a";
      const tokens = payload.users.a.fcmTokens as string[];
      tokens[0] = "b:c";
    });
    const leftRef = left.records.find(
      (record) => record.kind === "device_reauthorization",
    )?.sourceRef;
    const rightRef = right.records.find(
      (record) => record.kind === "device_reauthorization",
    )?.sourceRef;
    expect(leftRef).not.toBe(rightRef);
    const leftMembership = left.records.find((record) => record.kind === "party_membership");
    const rightMembership = right.records.find((record) => record.kind === "party_membership");
    expect(leftMembership?.sourceRef).toBe(rightMembership?.sourceRef);
    expect(leftMembership?.targetRef).toBe(rightMembership?.targetRef);
    expect(leftMembership?.relationshipDigest).not.toBe(rightMembership?.relationshipDigest);
  });

  it("rejects incompatible field-map evidence in ledgers and snapshot comparisons", async () => {
    const bundle = await packageFor();
    const incompatible = clone(bundle);
    incompatible.context.fieldMapDigest = "0".repeat(64);

    const ledger = new InMemoryMigrationLedger();
    ledger.apply(bundle);
    expect(() => ledger.apply(incompatible)).toThrow(
      expect.objectContaining({ code: "INCOMPATIBLE_REHEARSAL" }),
    );
    expect(() => compareFirebaseRehearsalPackages(bundle, incompatible)).toThrow(
      expect.objectContaining({ code: "INCOMPATIBLE_DELTA" }),
    );
  });

  it("detects missing, extra, digest, timestamp, and relationship tampering independently", async () => {
    const bundle = await packageFor();

    const missing = new InMemoryMigrationLedger();
    missing.apply(bundle);
    missing.rows.delete(bundle.records[0].targetRef);
    expect(reconcileFirebaseRehearsal(bundle, missing)).toMatchObject({
      ok: false,
      issueCounts: { missing_target: 1 },
    });

    const extra = new InMemoryMigrationLedger();
    extra.apply(bundle);
    extra.rows.set("f".repeat(64), {
      ...clone(bundle.records[0]),
      sourceRef: "e".repeat(64),
      targetRef: "f".repeat(64),
    });
    expect(reconcileFirebaseRehearsal(bundle, extra)).toMatchObject({
      ok: false,
      issueCounts: { extra_target: 1 },
    });

    for (const [field, code] of [
      ["kind", "kind_mismatch"],
      ["targetRef", "target_ref_mismatch"],
      ["targetRevisionDigest", "target_revision_digest_mismatch"],
      ["sourceTimestampDigest", "source_timestamp_digest_mismatch"],
      ["relationshipDigest", "relationship_digest_mismatch"],
    ] as const) {
      const tampered = new InMemoryMigrationLedger();
      tampered.apply(bundle);
      const ledgerKey = bundle.records[0].targetRef;
      const record = clone(tampered.rows.get(ledgerKey)!);
      record[field] = "0".repeat(64);
      tampered.rows.set(ledgerKey, record);
      expect(reconcileFirebaseRehearsal(bundle, tampered)).toMatchObject({
        ok: false,
        issueCounts: { [code]: 1 },
      });
    }

    for (const [field, value, code] of [
      ["snapshotAt", "2099-01-01T00:00:00.000Z", "snapshot_at_mismatch"],
      ["manifestDigest", "0".repeat(64), "manifest_digest_mismatch"],
    ] as const) {
      const tampered = new InMemoryMigrationLedger();
      tampered.apply(bundle);
      tampered[field] = value;
      expect(reconcileFirebaseRehearsal(bundle, tampered)).toMatchObject({
        ok: false,
        issueCounts: { [code]: 1 },
      });
    }

    for (const [field, value, code] of [
      ["fieldMapDigest", "0".repeat(64), "field_map_digest_context_mismatch"],
      ["tenant", "forged-tenant", "tenant_context_mismatch"],
    ] as const) {
      const contextTampered = new InMemoryMigrationLedger();
      contextTampered.apply(bundle);
      contextTampered.context = {
        ...contextTampered.context!,
        [field]: value,
      };
      expect(reconcileFirebaseRehearsal(bundle, contextTampered)).toMatchObject({
        ok: false,
        issueCounts: { [code]: 1 },
      });
    }

    const partyRecord = bundle.records.find((record) => record.kind === "party")!;
    const contentMutations: Array<{
      code: string;
      mutate: (record: Record<string, unknown>) => void;
    }> = [
      {
        code: "target_payload_content_mismatch",
        mutate: (record) => {
          (record.targetPayload as Record<string, unknown>).name = "tampered";
        },
      },
      {
        code: "relationship_content_mismatch",
        mutate: (record) => {
          record.relationships = ["0".repeat(64)];
        },
      },
      {
        code: "source_timestamp_content_mismatch",
        mutate: (record) => {
          record.sourceTimestamp = "2026-07-28T10:00:00.000Z";
        },
      },
    ];
    for (const { code, mutate } of contentMutations) {
      const tampered = new InMemoryMigrationLedger();
      tampered.apply(bundle);
      const record = clone(tampered.rows.get(partyRecord.targetRef)!);
      mutate(record);
      tampered.rows.set(partyRecord.targetRef, record);
      expect(reconcileFirebaseRehearsal(bundle, tampered)).toMatchObject({
        ok: false,
        issueCounts: { [code]: 1 },
      });
    }
  });

  it("compares compatible snapshots without silently deleting or accepting stale changes", async () => {
    const base = await packageFor();
    const replay = await packageFor();
    expect(compareFirebaseRehearsalPackages(base, replay).counts).toMatchObject({
      added: 0,
      removed: 0,
      changed: 0,
      unchanged: 17,
    });

    const changed = await packageFor((payload) => {
      payload.meta.snapshotAt = "2026-07-28T13:00:00.000Z";
      payload.events.ABC123.updatedAt = "2026-07-28T12:30:00.000Z";
      payload.events.ABC123.data.title = "Changed sanitized title";
    });
    expect(compareFirebaseRehearsalPackages(base, changed).counts.changed).toBeGreaterThan(0);

    const metadataTouch = await packageFor((payload) => {
      payload.meta.snapshotAt = "2026-07-28T13:00:00.000Z";
      payload.events.ABC123.updatedAt = "2026-07-28T12:30:00.000Z";
    });
    expect(
      compareFirebaseRehearsalPackages(base, metadataTouch).counts.metadataTouch,
    ).toBeGreaterThan(0);

    const removed = await packageFor((payload) => {
      payload.meta.snapshotAt = "2026-07-28T13:00:00.000Z";
      delete payload.events["invite:guest@example.invalid"];
    });
    const removal = compareFirebaseRehearsalPackages(base, removed);
    expect(removal.removed).toEqual([
      expect.objectContaining({ disposition: "requires_tombstone_decision" }),
    ]);
    const removalLedger = new InMemoryMigrationLedger();
    removalLedger.apply(base);
    expect(() => removalLedger.apply(removed)).toThrow(
      expect.objectContaining({ code: "TOMBSTONE_DECISION_REQUIRED" }),
    );

    const ambiguous = await packageFor((payload) => {
      payload.meta.snapshotAt = "2026-07-28T13:00:00.000Z";
      payload.events.ABC123.data.title = "Changed without source timestamp";
    });
    expect(() => compareFirebaseRehearsalPackages(base, ambiguous)).toThrow(
      expect.objectContaining({ code: "AMBIGUOUS_ENTITY_REVISION" }),
    );

    const sameSnapshotDifferentContent = await packageFor((payload) => {
      payload.events.ABC123.data.title = "Changed at the exact same snapshot";
    });
    expect(() => compareFirebaseRehearsalPackages(base, sameSnapshotDifferentContent)).toThrow(
      expect.objectContaining({ code: "AMBIGUOUS_SNAPSHOT" }),
    );
    const ledger = new InMemoryMigrationLedger();
    ledger.apply(base);
    expect(() => ledger.apply(sameSnapshotDifferentContent)).toThrow(
      expect.objectContaining({ code: "AMBIGUOUS_SNAPSHOT" }),
    );

    const regressed = await packageFor((payload) => {
      payload.meta.snapshotAt = "2026-07-28T13:00:00.000Z";
      payload.events.ABC123.updatedAt = "2026-07-28T10:00:00.000Z";
      payload.events.ABC123.data.title = "Older changed title";
    });
    expect(() => compareFirebaseRehearsalPackages(base, regressed)).toThrow(
      expect.objectContaining({ code: "REGRESSED_ENTITY_TIMESTAMP" }),
    );
    const pureTimestampRegression = await packageFor((payload) => {
      payload.meta.snapshotAt = "2026-07-28T13:00:00.000Z";
      payload.events.ABC123.updatedAt = "2026-07-28T10:00:00.000Z";
    });
    expect(() => compareFirebaseRehearsalPackages(base, pureTimestampRegression)).toThrow(
      expect.objectContaining({ code: "REGRESSED_ENTITY_TIMESTAMP" }),
    );

    const atomicLedger = new InMemoryMigrationLedger();
    atomicLedger.apply(base);
    const beforeRows = clone([...atomicLedger.rows.entries()]);
    const beforeSnapshot = atomicLedger.snapshotAt;
    const mixedInvalid = await packageFor((payload) => {
      payload.meta.snapshotAt = "2026-07-28T13:00:00.000Z";
      payload.auth[0].disabled = true;
      payload.events.ABC123.updatedAt = "2026-07-28T10:00:00.000Z";
      payload.events.ABC123.data.title = "Stale party after a valid identity change";
    });
    expect(() => atomicLedger.apply(mixedInvalid)).toThrow(
      expect.objectContaining({ code: "STALE_ENTITY_REVISION" }),
    );
    expect([...atomicLedger.rows.entries()]).toEqual(beforeRows);
    expect(atomicLedger.snapshotAt).toBe(beforeSnapshot);

    const sourceOnlyChange = await packageFor((payload) => {
      payload.meta.snapshotAt = "2026-07-28T13:00:00.000Z";
      payload.integrations.canva.accessToken = "ROTATED_SANITIZED_TOKEN";
    });
    const sourceLedger = new InMemoryMigrationLedger();
    sourceLedger.apply(base);
    expect(sourceLedger.apply(sourceOnlyChange).updated).toBeGreaterThan(0);
    expect(reconcileFirebaseRehearsal(sourceOnlyChange, sourceLedger).ok).toBe(true);

    const incompatible = await packageFor(undefined, { hmacKey: OTHER_KEY, keyId: "test-v2" });
    expect(() => compareFirebaseRehearsalPackages(base, incompatible)).toThrow(
      expect.objectContaining({ code: "INCOMPATIBLE_DELTA" }),
    );
  });
});
