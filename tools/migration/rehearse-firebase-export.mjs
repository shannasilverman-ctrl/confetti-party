#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  canonicalHash,
  canonicalize,
  opaqueDigest,
  planFirebaseExport,
  validateHmacKey,
} from "./plan-firebase-export.mjs";

export const REHEARSAL_CONTRACT_VERSION = "firebase-shadow-rehearsal-v1";
export const REVIEWED_FIELD_MAP_DIGEST =
  "e57325311246631510bff518744b72ebcc0e99790037d96cccd271f93028455f";

const ROOT_KEYS = [
  "meta",
  "auth",
  "users",
  "events",
  "vendors",
  "bookings",
  "integrations",
  "storage",
];
const MAX_DEPTH = 16;
const MAX_ARRAY_ITEMS = 20_000;
const MAX_OBJECT_KEYS = 20_000;
const MAX_STRING_BYTES = 256_000;
const CLOCK_TOLERANCE_MS = 60_000;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const PROVIDERS = new Set(["password", "google.com", "apple.com"]);
const MEMBER_ROLES = new Set(["owner", "cohost"]);
const GUEST_KINDS = new Set(["adult", "kid"]);
const RSVP_VALUES = new Set(["invited", "yes", "no", "maybe"]);
const MEMBER_STATUSES = new Set(["active"]);
const TASK_BUCKETS = new Set(["6+ weeks out", "3-5 weeks", "1-2 weeks", "Party week", "Day of"]);
const OCCASIONS = new Map([
  ["birthday", "birthday"],
  ["baby shower", "baby-shower"],
  ["baby-shower", "baby-shower"],
  ["graduation", "graduation"],
  ["holiday", "holiday"],
  ["dinner party", "dinner-party"],
  ["dinner-party", "dinner-party"],
  ["game day", "game-day"],
  ["game-day", "game-day"],
  ["watch party", "game-day"],
  ["bbq", "cookout"],
  ["cookout", "cookout"],
  ["other", "other"],
]);

export const MIGRATED_FIELD_CONSUMERS = Object.freeze({
  "meta.snapshotAt": "manifest.snapshotAt and monotonic ledger clock",
  "meta.sourceTenant": "manifest.sourceTenantRef and package context",
  "auth[].uid": "external_identity_candidate.external_subject_hash",
  "auth[].disabled": "external_identity_candidate.status",
  "users.*.eventCode": "legacy_link_candidate.partyRef",
  "users.*.name": "legacy_link_candidate.displayName",
  "events.*.code": "party source identity",
  "events.*.ownerUid": "party_candidate.ownerIdentityRef",
  "events.*.updatedAt": "party and child source revision clock",
  "events.*.data.kind": "party_candidate.occasion",
  "events.*.data.title": "party_candidate.name",
  "events.*.data.location": "party_candidate.location",
  "events.*.data.time": "party_candidate.start_time",
  "events.*.data.date": "party_candidate.date",
  "events.*.data.categories[]": "party_candidate.budget_categories",
  "events.*.data.categories[].id": "party_candidate.budget_categories[].id",
  "events.*.data.categories[].name": "party_candidate.budget_categories[].name",
  "events.*.data.categories[].budget": "party_candidate.budget_categories[].planned",
  "events.*.data.categories[].spent": "party_candidate.budget_categories[].expenses",
  "events.*.data.guests[]": "party_candidate.guests",
  "events.*.data.guests[].id": "party_candidate.guests[].id",
  "events.*.data.guests[].name": "party_candidate.guests[].name",
  "events.*.data.guests[].kind": "party_candidate.guests[].kind",
  "events.*.data.guests[].rsvp": "party_candidate.guests[].rsvp",
  "events.*.data.guests[].dietary[]": "party_candidate.guests[].dietary",
  "events.*.data.guests[].allergens[]": "party_candidate.guests[].allergens",
  "events.*.data.tasks[]": "party_candidate.tasks",
  "events.*.data.tasks[].id": "party_candidate.tasks[].id",
  "events.*.data.tasks[].title": "party_candidate.tasks[].title",
  "events.*.data.tasks[].done": "party_candidate.tasks[].done",
  "events.*.data.tasks[].bucket": "party_candidate.tasks[].bucket",
  "events.*.data.members[]": "unresolved_membership_candidate records",
  "events.*.data.members[].uid": "unresolved_membership_candidate.identityRef",
  "events.*.data.members[].name": "unresolved_membership_candidate.displayName",
  "events.*.data.members[].role": "unresolved_membership_candidate.role",
  "events.*.data.members[].status": "unresolved_membership_candidate.status",
  "storage.attachments[]": "object_inventory records",
  "storage.attachments[].path": "object_inventory.sourceObjectRef",
  "storage.attachments[].sha256": "object_inventory.contentHashProof",
  "storage.attachments[].size": "object_inventory.size",
  "storage.attachments[].contentType": "object_inventory.contentType",
});

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.safeDetails = details;
  throw error;
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("INVALID_SHAPE", `${label} must be an object`);
  return value;
}

function array(value, label) {
  if (!Array.isArray(value)) fail("INVALID_SHAPE", `${label} must be an array`);
  return value;
}

function string(value, label, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || (!allowEmpty && value.trim().length === 0))
    fail("INVALID_VALUE", `${label} must be a non-empty string`);
  return value;
}

function finiteNumber(value, label, { minimum = 0 } = {}) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (Number.isInteger(value) && !Number.isSafeInteger(value)) ||
    value < minimum
  )
    fail("INVALID_VALUE", `${label} must be a finite number`);
  return value;
}

function nonNegativeSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0)
    fail("INVALID_VALUE", `${label} must be a non-negative safe integer`);
  return value;
}

function displayName(value, label) {
  const raw = string(value, label);
  if (/[\u0000-\u001f\u007f]/.test(raw))
    fail("INVALID_DISPLAY_NAME", `${label} contains control characters`);
  const normalized = raw.trim().replace(/\s+/g, " ");
  if (Array.from(normalized).length === 0 || Array.from(normalized).length > 80)
    fail("INVALID_DISPLAY_NAME", `${label} must contain 1-80 characters`);
  return normalized;
}

function validateSafeJson(value, path = "$", depth = 0, seen = new WeakSet()) {
  if (depth > MAX_DEPTH) fail("INPUT_LIMIT", "export nesting is too deep");
  if (typeof value === "number") {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
      fail("INVALID_JSON_NUMBER", "export contains an unsafe number");
    return;
  }
  if (typeof value === "string") {
    if (Buffer.byteLength(value, "utf8") > MAX_STRING_BYTES)
      fail("INPUT_LIMIT", "export contains an oversized string");
    return;
  }
  if (value == null || typeof value === "boolean") return;
  if (typeof value !== "object") fail("INVALID_JSON_VALUE", "export contains a non-JSON value");
  if (seen.has(value)) fail("CYCLIC_INPUT", "export contains a cyclic value");
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) fail("INPUT_LIMIT", "export contains an oversized array");
    value.forEach((item, index) => validateSafeJson(item, `${path}[${index}]`, depth + 1, seen));
  } else {
    const entries = Object.entries(value);
    if (entries.length > MAX_OBJECT_KEYS)
      fail("INPUT_LIMIT", "export contains an oversized object");
    const dynamicKeyContainer = ["$.users", "$.events", "$.vendors", "$.bookings"].includes(path);
    for (const [key, item] of entries) {
      if (
        DANGEROUS_KEYS.has(key) ||
        /[\u0000-\u001f\u007f]/.test(key) ||
        (!dynamicKeyContainer && (key.includes(".") || key.includes("[") || key.includes("]")))
      )
        fail("UNSAFE_KEY", "export contains an unsafe object key");
      validateSafeJson(item, `${path}.${key}`, depth + 1, seen);
    }
  }
  seen.delete(value);
}

function canonicalTimestamp(value, label, snapshotMs, { required = false } = {}) {
  if (value == null && !required) return null;
  const timestamp = string(value, label);
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== timestamp)
    fail("INVALID_TIMESTAMP", `${label} must be canonical RFC3339`);
  if (parsed > snapshotMs + CLOCK_TOLERANCE_MS)
    fail("FUTURE_TIMESTAMP", `${label} is later than the source snapshot`);
  return timestamp;
}

function canonicalDate(value, label) {
  const date = string(value, label);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) fail("INVALID_DATE", `${label} must be an ISO calendar date`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1000 ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  )
    fail("INVALID_DATE", `${label} must be an ISO calendar date`);
  return date;
}

function canonicalTime(value, label) {
  const time = string(value, label);
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
    fail("INVALID_TIME", `${label} must be a 24-hour wall-clock time`);
  return time;
}

function stringArray(value, label, { setLike = false } = {}) {
  const values = array(value, label).map((item, index) => string(item, `${label}[${index}]`));
  return setLike ? [...new Set(values)].sort() : values;
}

function httpsUrl(value, label) {
  const input = string(value, label);
  let url;
  try {
    url = new URL(input);
  } catch {
    fail("INVALID_URL", `${label} must be a valid URL`);
  }
  if (url.protocol !== "https:" || url.username || url.password)
    fail("INVALID_URL", `${label} must be credential-free HTTPS`);
  return url.toString();
}

function assertUniqueIds(values, label) {
  const ids = new Set();
  for (const value of values) {
    if (ids.has(value.id)) fail("DUPLICATE_SOURCE_ENTITY", `${label} contains duplicate ids`);
    ids.add(value.id);
  }
  return values;
}

function sameCanonicalValue(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function countBy(values, readKey) {
  const counts = {};
  for (const value of values) {
    const key = readKey(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function normalizeOccasion(value) {
  const source = string(value, "event kind").trim().toLowerCase();
  const occasion = OCCASIONS.get(source);
  if (!occasion) fail("UNKNOWN_OCCASION", "event kind needs an explicit migration decision");
  return occasion;
}

function deterministicUuid(digest) {
  const hex = digest.slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ["8", "9", "a", "b"][Number.parseInt(hex[16], 16) % 4];
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(
    16,
    20,
  )}-${value.slice(20)}`;
}

function safeKeyId(value) {
  const keyId = string(value, "migration HMAC key id");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(keyId))
    fail("INVALID_KEY_ID", "migration HMAC key id is invalid");
  return keyId;
}

function validateRoot(payload) {
  validateSafeJson(payload);
  const root = object(payload, "export");
  const actualKeys = Object.keys(root).sort();
  const expectedKeys = [...ROOT_KEYS].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys))
    fail("INVALID_ROOT", "export root containers do not match the rehearsal contract");
  object(root.meta, "meta");
  array(root.auth, "auth");
  object(root.users, "users");
  object(root.events, "events");
  object(root.vendors, "vendors");
  object(root.bookings, "bookings");
  object(root.integrations, "integrations");
  const storage = object(root.storage, "storage");
  array(storage.attachments, "storage.attachments");
  return root;
}

function transformTask(value, index) {
  const task = object(value, `task ${index}`);
  const bucket = string(task.bucket, `task ${index} bucket`);
  if (!TASK_BUCKETS.has(bucket)) fail("UNKNOWN_TASK_BUCKET", "task bucket needs a mapping");
  if (typeof task.done !== "boolean") fail("INVALID_VALUE", "task done must be boolean");
  return {
    id: string(task.id, `task ${index} id`),
    title: string(task.title, `task ${index} title`),
    bucket,
    done: task.done,
  };
}

function transformGuest(value, index) {
  const guest = object(value, `guest ${index}`);
  const kind = string(guest.kind, `guest ${index} kind`);
  const rsvp = string(guest.rsvp, `guest ${index} RSVP`);
  if (!GUEST_KINDS.has(kind)) fail("UNKNOWN_GUEST_KIND", "guest kind needs a mapping");
  if (!RSVP_VALUES.has(rsvp)) fail("UNKNOWN_RSVP", "guest RSVP needs a mapping");
  return {
    id: string(guest.id, `guest ${index} id`),
    name: string(guest.name, `guest ${index} name`),
    kind,
    rsvp,
    dietary: guest.dietary == null ? [] : stringArray(guest.dietary, `guest ${index} dietary`),
    allergens:
      guest.allergens == null ? [] : stringArray(guest.allergens, `guest ${index} allergens`),
  };
}

function transformCategory(value, index, refFor) {
  const category = object(value, `category ${index}`);
  const spent = finiteNumber(category.spent, `category ${index} spent`);
  return {
    id: string(category.id, `category ${index} id`),
    name: string(category.name, `category ${index} name`),
    planned: finiteNumber(category.budget, `category ${index} budget`),
    expenses:
      spent === 0
        ? []
        : [
            {
              id: deterministicUuid(
                refFor("legacy-expense", { categoryId: category.id, purpose: "spent" }),
              ),
              label: "Legacy recorded spend",
              amount: spent,
            },
          ],
  };
}

function publicSafeError(error) {
  return {
    error:
      typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code)
        ? error.code.toLowerCase()
        : "rehearsal_failed",
    ...(error?.safeDetails && typeof error.safeDetails === "object" ? error.safeDetails : {}),
    rehearsalOnly: true,
    databaseWrites: false,
    productionReady: false,
  };
}

export async function buildFirebaseRehearsalPackage(payload, options = {}) {
  const root = validateRoot(payload);
  const hmacKey = validateHmacKey(options.hmacKey);
  const keyId = safeKeyId(options.keyId);
  const plan = await planFirebaseExport(root, {
    fieldMap: options.fieldMap,
    hmacKey,
  });
  const declaredMigratedFields = [...plan.migratedFieldPaths].sort();
  const consumedMigratedFields = Object.keys(MIGRATED_FIELD_CONSUMERS).sort();
  if (!sameCanonicalValue(declaredMigratedFields, consumedMigratedFields))
    fail(
      "TRANSFORM_CONTRACT_MISMATCH",
      "field-map migrate decisions do not match reviewed transform consumers",
      {
        declaredCount: declaredMigratedFields.length,
        consumerCount: consumedMigratedFields.length,
      },
    );
  if (plan.fieldMapDigest !== REVIEWED_FIELD_MAP_DIGEST)
    fail("FIELD_MAP_CONTRACT_MISMATCH", "field map differs from the reviewed transform contract");
  if (root.meta.sanitized !== true)
    fail("SANITIZED_INPUT_REQUIRED", "credential-free rehearsal accepts sanitized input only");

  const snapshotAt = canonicalTimestamp(root.meta.snapshotAt, "meta.snapshotAt", Infinity, {
    required: true,
  });
  const snapshotMs = Date.parse(snapshotAt);
  const tenant = string(root.meta.sourceTenant, "meta.sourceTenant");
  const context = {
    contractVersion: REHEARSAL_CONTRACT_VERSION,
    fieldMapVersion: plan.fieldMapVersion,
    fieldMapDigest: plan.fieldMapDigest,
    tenant,
  };
  const refFor = (kind, sourceKey) =>
    opaqueDigest({ ...context, kind, sourceKey }, hmacKey, "entity-ref");
  const revisionFor = (kind, value) =>
    opaqueDigest({ ...context, kind, value }, hmacKey, "source-revision");
  const timestampFor = (value) =>
    value == null ? null : opaqueDigest({ ...context, value }, hmacKey, "source-timestamp");
  const relationshipFor = (refs) =>
    opaqueDigest([...new Set(refs)].sort(), hmacKey, "relationship");
  const targetRefFor = (targetKind, sourceRef) =>
    opaqueDigest({ ...context, targetKind, sourceRef }, hmacKey, "target-ref");
  const targetRevisionFor = (targetKind, payloadValue) =>
    opaqueDigest({ ...context, targetKind, payload: payloadValue }, hmacKey, "target-revision");

  const auth = array(root.auth, "auth");
  const authUids = new Set();
  for (const [index, item] of auth.entries()) {
    const identity = object(item, `auth[${index}]`);
    const uid = string(identity.uid, `auth[${index}].uid`);
    if (authUids.has(uid)) fail("DUPLICATE_SOURCE_ENTITY", "duplicate Firebase auth identity");
    authUids.add(uid);
  }
  for (const uid of Object.keys(root.users)) {
    if (!authUids.has(uid)) fail("DANGLING_IDENTITY", "user profile lacks an Auth identity");
  }

  const records = [];
  const addRecord = ({
    kind,
    sourceKey,
    sourceValue,
    sourceTimestamp = null,
    decision,
    targetKind,
    targetPayload,
    relationships = [],
  }) => {
    const sourceRef = refFor(kind, sourceKey);
    const targetRef = targetRefFor(targetKind, sourceRef);
    const sourceRevisionDigest = revisionFor(kind, sourceValue);
    const sourceTimestampDigest = timestampFor(sourceTimestamp);
    const targetRevisionDigest = targetRevisionFor(targetKind, targetPayload);
    const relationshipDigest = relationshipFor(relationships);
    records.push({
      kind,
      sourceRef,
      sourceRevisionDigest,
      sourceTimestamp,
      sourceTimestampDigest,
      decision,
      targetKind,
      targetRef,
      targetRevisionDigest,
      relationshipDigest,
      relationships: [...new Set(relationships)].sort(),
      targetPayload,
    });
    return { sourceRef, targetRef };
  };

  for (const [index, item] of auth.entries()) {
    const identity = object(item, `auth[${index}]`);
    const uid = string(identity.uid, `auth[${index}].uid`);
    const providers = stringArray(identity.providers, `auth[${index}].providers`, {
      setLike: true,
    });
    if (providers.some((provider) => !PROVIDERS.has(provider)))
      fail("UNKNOWN_AUTH_PROVIDER", "auth provider needs an explicit reauthorization decision");
    if (typeof identity.disabled !== "boolean")
      fail("INVALID_VALUE", "auth disabled flag must be boolean");
    const identityRef = refFor("auth_identity", uid);
    addRecord({
      kind: "auth_identity",
      sourceKey: uid,
      sourceValue: identity,
      decision: "migrate",
      targetKind: "external_identity_candidate",
      targetPayload: {
        source_system: "firebase",
        source_tenant: tenant,
        external_subject_hash: identityRef,
        status: identity.disabled ? "revoked" : "pending",
      },
    });
    for (const provider of providers) {
      addRecord({
        kind: "auth_reauthorization",
        sourceKey: { uid, provider },
        sourceValue: { provider },
        decision: "reauthorize",
        targetKind: "reauthorization_requirement",
        targetPayload: { identityRef, provider },
        relationships: [identityRef],
      });
    }
  }

  for (const [uid, value] of Object.entries(root.users)) {
    const profile = object(value, "user profile");
    const eventCode = string(profile.eventCode, "user event code");
    if (!(eventCode in root.events) || eventCode.startsWith("invite:"))
      fail("DANGLING_EVENT", "user profile points to a missing event");
    const identityRef = refFor("auth_identity", uid);
    const partyRef = refFor("party", eventCode);
    addRecord({
      kind: "user_profile",
      sourceKey: uid,
      sourceValue: profile,
      decision: "migrate",
      targetKind: "legacy_link_candidate",
      targetPayload: {
        identityRef,
        partyRef,
        displayName: displayName(profile.name, "user profile name"),
        status: "requires_identity_proof",
      },
      relationships: [identityRef, partyRef],
    });
    for (const token of array(profile.fcmTokens, "user FCM tokens")) {
      const tokenValue = string(token, "FCM token");
      addRecord({
        kind: "device_reauthorization",
        sourceKey: { uid, token: tokenValue },
        sourceValue: { token: tokenValue },
        decision: "reauthorize",
        targetKind: "reauthorization_requirement",
        targetPayload: { identityRef, capability: "push-notifications" },
        relationships: [identityRef],
      });
    }
  }

  for (const [eventKey, value] of Object.entries(root.events)) {
    if (eventKey.startsWith("invite:")) {
      const invitation = object(value, "legacy invitation");
      const eventCode = string(invitation.code, "legacy invitation event code");
      if (!(eventCode in root.events) || eventCode.startsWith("invite:"))
        fail("DANGLING_EVENT", "legacy invitation points to a missing event");
      const partyRef = refFor("party", eventCode);
      addRecord({
        kind: "legacy_invitation",
        sourceKey: eventKey,
        sourceValue: {
          code: invitation.code,
          role: invitation.role,
        },
        sourceTimestamp: canonicalTimestamp(
          invitation.at,
          "legacy invitation timestamp",
          snapshotMs,
          { required: true },
        ),
        decision: "archive",
        targetKind: "archive_manifest",
        targetPayload: {
          archiveRevision: revisionFor("legacy_invitation_archive", invitation),
          relationshipRef: partyRef,
        },
        relationships: [partyRef],
      });
      continue;
    }

    const event = object(value, "event");
    if (string(event.code, "event code") !== eventKey)
      fail("SOURCE_KEY_MISMATCH", "event code does not match its source key");
    const ownerUid = string(event.ownerUid, "event owner UID");
    if (!authUids.has(ownerUid)) fail("DANGLING_OWNER", "event owner lacks an Auth identity");
    const updatedAt = canonicalTimestamp(event.updatedAt, "event updatedAt", snapshotMs, {
      required: true,
    });
    const data = object(event.data, "event data");
    if (data.setup !== true) fail("INCOMPLETE_EVENT", "event setup is not complete");
    const guests = assertUniqueIds(
      array(data.guests, "event guests").map(transformGuest),
      "event guests",
    );
    const tasks = assertUniqueIds(
      array(data.tasks, "event tasks").map(transformTask),
      "event tasks",
    );
    const categories = assertUniqueIds(
      array(data.categories, "event categories").map((item, index) =>
        transformCategory(item, index, refFor),
      ),
      "event categories",
    );
    const ownerIdentityRef = refFor("auth_identity", ownerUid);
    const partySourceRef = refFor("party", eventKey);
    const partyId = deterministicUuid(refFor("party-target-id", eventKey));
    const partyTarget = {
      id: partyId,
      ownerIdentityRef,
      name: string(data.title, "event title"),
      occasion: normalizeOccasion(data.kind),
      date: canonicalDate(data.date, "event date"),
      start_time: canonicalTime(data.time, "event time"),
      location: string(data.location, "event location"),
      guest_estimate: guests.length,
      budget: categories.reduce((total, category) => total + category.planned, 0),
      theme: "",
      tasks,
      guests,
      budget_categories: categories,
      pinned_inspiration: [],
    };
    addRecord({
      kind: "party",
      sourceKey: eventKey,
      sourceValue: {
        code: event.code,
        ownerUid: event.ownerUid,
        data,
      },
      sourceTimestamp: updatedAt,
      decision: "migrate",
      targetKind: "party_candidate",
      targetPayload: partyTarget,
      relationships: [ownerIdentityRef],
    });

    const members = array(data.members, "event members");
    const memberKeys = new Set();
    const memberSourceIds = new Set();
    let ownerCount = 0;
    for (const [memberIndex, item] of members.entries()) {
      const member = object(item, `member ${memberIndex}`);
      const memberUid = string(member.uid, `member ${memberIndex} UID`);
      const memberId = string(member.id, `member ${memberIndex} id`);
      if (!authUids.has(memberUid)) fail("DANGLING_MEMBER", "party member lacks an Auth identity");
      if (memberKeys.has(memberUid)) fail("DUPLICATE_SOURCE_ENTITY", "duplicate event membership");
      memberKeys.add(memberUid);
      if (memberSourceIds.has(memberId))
        fail("DUPLICATE_SOURCE_ENTITY", "duplicate legacy membership id");
      memberSourceIds.add(memberId);
      const role = string(member.role, `member ${memberIndex} role`);
      if (!MEMBER_ROLES.has(role)) fail("UNKNOWN_MEMBER_ROLE", "member role needs a mapping");
      if (role === "owner") {
        ownerCount += 1;
        if (memberUid !== ownerUid) fail("OWNER_MISMATCH", "event owner membership does not match");
      }
      const status = string(member.status, `member ${memberIndex} status`);
      if (!MEMBER_STATUSES.has(status))
        fail("UNSAFE_MEMBER_STATUS", "member status needs an explicit authorization decision");
      const memberIdentityRef = refFor("auth_identity", memberUid);
      addRecord({
        kind: "party_membership",
        sourceKey: { eventKey, memberId },
        sourceValue: member,
        sourceTimestamp: updatedAt,
        decision: "migrate",
        targetKind: "unresolved_membership_candidate",
        targetPayload: {
          partyRef: partySourceRef,
          identityRef: memberIdentityRef,
          role,
          displayName: displayName(member.name, `member ${memberIndex} name`),
          status,
        },
        relationships: [partySourceRef, memberIdentityRef],
      });
      const memberArchive = {
        id: memberId,
        ...(member.email == null
          ? {}
          : { email: string(member.email, `member ${memberIndex} email`) }),
      };
      addRecord({
        kind: "member_metadata_archive",
        sourceKey: { eventKey, memberId },
        sourceValue: memberArchive,
        sourceTimestamp: updatedAt,
        decision: "archive",
        targetKind: "archive_manifest",
        targetPayload: {
          archiveRevision: revisionFor("member_metadata_archive", memberArchive),
        },
        relationships: [partySourceRef, memberIdentityRef],
      });
    }
    if (ownerCount !== 1) fail("OWNER_CARDINALITY", "event must have exactly one owner membership");

    for (const [guestIndex, guestValue] of array(data.guests, "event guests").entries()) {
      const guest = object(guestValue, `guest ${guestIndex}`);
      if (guest.email != null) {
        addRecord({
          kind: "guest_contact_archive",
          sourceKey: { eventKey, guestId: string(guest.id, `guest ${guestIndex} id`) },
          sourceValue: { email: string(guest.email, `guest ${guestIndex} email`) },
          sourceTimestamp: updatedAt,
          decision: "archive",
          targetKind: "archive_manifest",
          targetPayload: {
            archiveRevision: revisionFor("guest_contact_archive", { email: guest.email }),
          },
          relationships: [partySourceRef],
        });
      }
    }

    for (const [pinIndex, pinValue] of array(data.pins, "event pins").entries()) {
      const pin = object(pinValue, `pin ${pinIndex}`);
      const rawUrl = string(pin.url, `pin ${pinIndex} URL`);
      httpsUrl(rawUrl, `pin ${pinIndex} URL`);
      const archivedPin = {
        id: string(pin.id, `pin ${pinIndex} id`),
        url: rawUrl,
      };
      addRecord({
        kind: "inspiration_archive",
        sourceKey: { eventKey, pinId: archivedPin.id },
        sourceValue: archivedPin,
        sourceTimestamp: updatedAt,
        decision: "archive",
        targetKind: "archive_manifest",
        targetPayload: {
          archiveRevision: revisionFor("inspiration_archive", archivedPin),
        },
        relationships: [partySourceRef],
      });
    }

    for (const [vendorIndex, vendorValue] of array(data.vendors, "event vendors").entries()) {
      const vendor = object(vendorValue, `event vendor ${vendorIndex}`);
      addRecord({
        kind: "event_vendor_archive",
        sourceKey: {
          eventKey,
          vendorId: string(vendor.id, `event vendor ${vendorIndex} id`),
        },
        sourceValue: vendor,
        sourceTimestamp: updatedAt,
        decision: "archive",
        targetKind: "archive_manifest",
        targetPayload: {
          archiveRevision: revisionFor("event_vendor_archive", vendor),
        },
        relationships: [partySourceRef],
      });
    }

    addRecord({
      kind: "event_metadata_archive",
      sourceKey: eventKey,
      sourceValue: {
        emoji: data.emoji,
        categoryProgress: categories.map(
          (_, index) => object(data.categories[index], `category ${index}`).progress,
        ),
      },
      sourceTimestamp: updatedAt,
      decision: "archive",
      targetKind: "archive_manifest",
      targetPayload: {
        archiveRevision: revisionFor("event_metadata_archive", {
          emoji: data.emoji,
          categoryProgress: categories.map(
            (_, index) => object(data.categories[index], `category ${index}`).progress,
          ),
        }),
      },
      relationships: [partySourceRef],
    });
  }

  for (const [vendorUid, value] of Object.entries(root.vendors)) {
    const vendor = object(value, "vendor profile");
    if (vendor.uid != null && string(vendor.uid, "vendor UID") !== vendorUid)
      fail("SOURCE_KEY_MISMATCH", "vendor UID does not match its source key");
    addRecord({
      kind: "vendor_profile",
      sourceKey: vendorUid,
      sourceValue: vendor,
      decision: "archive",
      targetKind: "archive_manifest",
      targetPayload: { archiveRevision: revisionFor("vendor_profile_archive", vendor) },
    });
  }

  for (const [bookingId, value] of Object.entries(root.bookings)) {
    const booking = object(value, "booking");
    const { updatedAt: _updatedAt, ...bookingRevision } = booking;
    const plannerUid = string(booking.plannerUid, "booking planner UID");
    const vendorUid = string(booking.vendorUid, "booking vendor UID");
    if (!authUids.has(plannerUid)) fail("DANGLING_BOOKING_PLANNER", "booking planner is missing");
    if (!(vendorUid in root.vendors)) fail("DANGLING_BOOKING_VENDOR", "booking vendor is missing");
    const updatedAt = canonicalTimestamp(booking.updatedAt, "booking updatedAt", snapshotMs, {
      required: true,
    });
    const createdAt = canonicalTimestamp(booking.createdAt, "booking createdAt", snapshotMs, {
      required: true,
    });
    if (Date.parse(createdAt) > Date.parse(updatedAt))
      fail("INVALID_TIMESTAMP_ORDER", "booking createdAt cannot be later than updatedAt");
    const plannerRef = refFor("auth_identity", plannerUid);
    const vendorRef = refFor("vendor_profile", vendorUid);
    addRecord({
      kind: "booking",
      sourceKey: bookingId,
      sourceValue: bookingRevision,
      sourceTimestamp: updatedAt,
      decision: "archive",
      targetKind: "archive_manifest",
      targetPayload: {
        archiveRevision: revisionFor("booking_archive", booking),
        relationshipRefs: [plannerRef, vendorRef].sort(),
      },
      relationships: [plannerRef, vendorRef],
    });
  }

  for (const [provider, value] of Object.entries(root.integrations)) {
    const integration = object(value, "integration");
    addRecord({
      kind: "integration_reauthorization",
      sourceKey: provider,
      sourceValue: integration,
      decision: "reauthorize",
      targetKind: "reauthorization_requirement",
      targetPayload: { provider },
    });
  }

  const storageKeys = new Set();
  for (const [index, item] of array(root.storage.attachments, "storage attachments").entries()) {
    const attachment = object(item, `storage attachment ${index}`);
    const path = string(attachment.path, `storage attachment ${index} path`);
    if (storageKeys.has(path)) fail("DUPLICATE_SOURCE_ENTITY", "duplicate storage object");
    storageKeys.add(path);
    const sha256 = string(attachment.sha256, `storage attachment ${index} hash`);
    if (!/^[0-9a-f]{64}$/.test(sha256))
      fail("INVALID_CONTENT_HASH", "storage object hash must be lowercase SHA-256");
    addRecord({
      kind: "storage_object",
      sourceKey: path,
      sourceValue: attachment,
      decision: "migrate",
      targetKind: "object_inventory",
      targetPayload: {
        sourceObjectRef: refFor("storage_object", path),
        size: nonNegativeSafeInteger(attachment.size, `storage attachment ${index} size`),
        contentType: string(attachment.contentType, `storage attachment ${index} content type`),
        contentHashProof: opaqueDigest(sha256, hmacKey, "storage-content-proof"),
      },
    });
  }

  records.sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) || left.sourceRef.localeCompare(right.sourceRef),
  );
  const duplicateSourceRecords = new Set();
  const duplicateTargetRecords = new Set();
  for (const record of records) {
    const sourceKey = `${record.kind}:${record.sourceRef}`;
    if (duplicateSourceRecords.has(sourceKey))
      fail("DUPLICATE_SOURCE_ENTITY", "duplicate logical source record");
    duplicateSourceRecords.add(sourceKey);
    if (duplicateTargetRecords.has(record.targetRef))
      fail("TARGET_REF_COLLISION", "two source records resolve to one shadow target");
    duplicateTargetRecords.add(record.targetRef);
  }

  const safeRecords = records.map((record) => ({
    kind: record.kind,
    sourceRef: record.sourceRef,
    sourceRevisionDigest: record.sourceRevisionDigest,
    sourceTimestampDigest: record.sourceTimestampDigest,
    decision: record.decision,
    targetKinds: [record.targetKind],
    targetRefs: [record.targetRef],
    targetRevisionDigests: [record.targetRevisionDigest],
    relationshipDigest: record.relationshipDigest,
    status: "planned",
  }));
  const manifestBase = {
    contractVersion: REHEARSAL_CONTRACT_VERSION,
    fieldMapVersion: plan.fieldMapVersion,
    fieldMapDigest: plan.fieldMapDigest,
    keyId,
    sourceTenantRef: opaqueDigest(tenant, hmacKey, "source-tenant"),
    snapshotAt,
    sourceCounts: countBy(safeRecords, (record) => record.kind),
    decisionCounts: countBy(safeRecords, (record) => record.decision),
    targetCounts: countBy(records, (record) => record.targetKind),
    sourceRoot: opaqueDigest(
      safeRecords.map((record) => ({
        kind: record.kind,
        ref: record.sourceRef,
        revision: record.sourceRevisionDigest,
      })),
      hmacKey,
      "source-root",
    ),
    targetRoot: opaqueDigest(
      safeRecords.map((record) => ({
        refs: record.targetRefs,
        revisions: record.targetRevisionDigests,
      })),
      hmacKey,
      "target-root",
    ),
    records: safeRecords,
  };
  const manifest = {
    ...manifestBase,
    manifestDigest: canonicalHash(manifestBase),
  };
  return deepFreeze({
    sensitiveShadowPackage: true,
    context: { ...context, keyId, sourceTenantRef: manifest.sourceTenantRef },
    snapshotAt,
    records,
    manifest,
  });
}

export class InMemoryMigrationLedger {
  constructor() {
    this.context = null;
    this.snapshotAt = null;
    this.manifestDigest = null;
    this.rows = new Map();
  }

  apply(bundle) {
    if (!bundle?.sensitiveShadowPackage) fail("INVALID_PACKAGE", "invalid rehearsal package");
    let nextContext;
    if (this.context) {
      for (const key of [
        "contractVersion",
        "fieldMapVersion",
        "fieldMapDigest",
        "keyId",
        "sourceTenantRef",
        "tenant",
      ]) {
        if (this.context[key] !== bundle.context[key])
          fail("INCOMPATIBLE_REHEARSAL", "rehearsal package is incompatible with the ledger");
      }
      nextContext = this.context;
    } else {
      nextContext = { ...bundle.context };
    }

    const incomingSnapshot = Date.parse(bundle.snapshotAt);
    const currentSnapshot = this.snapshotAt == null ? null : Date.parse(this.snapshotAt);
    if (currentSnapshot != null && incomingSnapshot < currentSnapshot)
      fail("STALE_SNAPSHOT", "older snapshot cannot update the rehearsal ledger");
    if (
      currentSnapshot != null &&
      incomingSnapshot === currentSnapshot &&
      this.manifestDigest !== bundle.manifest.manifestDigest
    )
      fail("AMBIGUOUS_SNAPSHOT", "same snapshot timestamp has different source evidence");

    const nextRows = new Map(
      [...this.rows].map(([targetRef, record]) => [targetRef, structuredClone(record)]),
    );
    if (nextRows.size > 0) {
      const incomingRefs = new Set(bundle.records.map((record) => record.targetRef));
      const removed = [...nextRows.keys()].find((targetRef) => !incomingRefs.has(targetRef));
      if (removed)
        fail("TOMBSTONE_DECISION_REQUIRED", "shadow target removal requires an explicit decision", {
          ref: nextRows.get(removed).sourceRef,
        });
    }

    const stats = { created: 0, updated: 0, unchanged: 0 };
    for (const record of bundle.records) {
      const current = nextRows.get(record.targetRef);
      if (!current) {
        nextRows.set(record.targetRef, structuredClone(record));
        stats.created += 1;
        continue;
      }
      if (current.sourceRef !== record.sourceRef || current.targetKind !== record.targetKind)
        fail("TARGET_REF_COLLISION", "shadow target reference collision");
      if (
        current.sourceRevisionDigest === record.sourceRevisionDigest &&
        current.targetRevisionDigest === record.targetRevisionDigest &&
        current.relationshipDigest === record.relationshipDigest &&
        current.sourceTimestampDigest === record.sourceTimestampDigest &&
        current.decision === record.decision
      ) {
        stats.unchanged += 1;
        continue;
      }

      const currentTime =
        current.sourceTimestamp == null ? currentSnapshot : Date.parse(current.sourceTimestamp);
      const incomingTime =
        record.sourceTimestamp == null ? incomingSnapshot : Date.parse(record.sourceTimestamp);
      if (incomingTime < currentTime)
        fail("STALE_ENTITY_REVISION", "older entity revision cannot update the rehearsal ledger", {
          ref: record.sourceRef,
        });
      if (incomingTime === currentTime)
        fail("AMBIGUOUS_ENTITY_REVISION", "same timestamp has different entity content", {
          ref: record.sourceRef,
        });
      nextRows.set(record.targetRef, structuredClone(record));
      stats.updated += 1;
    }
    this.rows = nextRows;
    this.context = nextContext;
    this.snapshotAt =
      currentSnapshot == null || incomingSnapshot >= currentSnapshot
        ? bundle.snapshotAt
        : this.snapshotAt;
    this.manifestDigest = bundle.manifest.manifestDigest;
    return stats;
  }
}

export function reconcileFirebaseRehearsal(bundle, ledger) {
  if (!bundle?.sensitiveShadowPackage || !(ledger instanceof InMemoryMigrationLedger))
    fail("INVALID_RECONCILIATION", "invalid rehearsal reconciliation inputs");
  const issues = [];
  const contextRef = bundle.manifest.sourceTenantRef;
  for (const field of [
    "contractVersion",
    "fieldMapVersion",
    "fieldMapDigest",
    "keyId",
    "sourceTenantRef",
    "tenant",
  ]) {
    if (ledger.context?.[field] !== bundle.context[field])
      issues.push({
        code: `${field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}_context_mismatch`,
        ref: contextRef,
      });
  }
  if (ledger.snapshotAt !== bundle.snapshotAt)
    issues.push({ code: "snapshot_at_mismatch", ref: contextRef });
  if (ledger.manifestDigest !== bundle.manifest.manifestDigest)
    issues.push({ code: "manifest_digest_mismatch", ref: contextRef });
  const expected = new Map(bundle.records.map((record) => [record.targetRef, record]));
  for (const [targetRef, record] of expected) {
    const actual = ledger.rows.get(targetRef);
    if (!actual) {
      issues.push({ code: "missing_target", ref: record.sourceRef });
      continue;
    }
    for (const field of [
      "kind",
      "sourceRef",
      "sourceRevisionDigest",
      "sourceTimestampDigest",
      "targetKind",
      "targetRevisionDigest",
      "relationshipDigest",
      "decision",
      "targetRef",
    ]) {
      if (actual[field] !== record[field]) {
        issues.push({
          code: `${field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}_mismatch`,
          ref: record.sourceRef,
        });
      }
    }
    if (!sameCanonicalValue(actual.targetPayload, record.targetPayload))
      issues.push({ code: "target_payload_content_mismatch", ref: record.sourceRef });
    if (!sameCanonicalValue(actual.relationships, record.relationships))
      issues.push({ code: "relationship_content_mismatch", ref: record.sourceRef });
    if (actual.sourceTimestamp !== record.sourceTimestamp)
      issues.push({ code: "source_timestamp_content_mismatch", ref: record.sourceRef });
  }
  for (const [targetRef, actual] of ledger.rows) {
    if (!expected.has(targetRef)) issues.push({ code: "extra_target", ref: actual.sourceRef });
  }
  issues.sort(
    (left, right) => left.code.localeCompare(right.code) || left.ref.localeCompare(right.ref),
  );
  return {
    ok: issues.length === 0,
    expectedTargets: expected.size,
    actualTargets: ledger.rows.size,
    issueCounts: countBy(issues, (issue) => issue.code),
    issues,
  };
}

export function compareFirebaseRehearsalPackages(previous, next) {
  for (const key of [
    "contractVersion",
    "fieldMapVersion",
    "fieldMapDigest",
    "keyId",
    "sourceTenantRef",
    "tenant",
  ]) {
    if (previous.context[key] !== next.context[key])
      fail("INCOMPATIBLE_DELTA", "migration snapshots are not comparable");
  }
  const previousSnapshot = Date.parse(previous.snapshotAt);
  const nextSnapshot = Date.parse(next.snapshotAt);
  if (nextSnapshot < previousSnapshot) fail("STALE_SNAPSHOT", "delta snapshot moved backwards");
  if (
    nextSnapshot === previousSnapshot &&
    previous.manifest.manifestDigest !== next.manifest.manifestDigest
  )
    fail("AMBIGUOUS_SNAPSHOT", "same snapshot timestamp has different source evidence");

  const prior = new Map(
    previous.records.map((record) => [`${record.kind}:${record.sourceRef}`, record]),
  );
  const current = new Map(
    next.records.map((record) => [`${record.kind}:${record.sourceRef}`, record]),
  );
  const delta = {
    added: [],
    removed: [],
    changed: [],
    metadataTouch: [],
    relationshipChanged: [],
    unchanged: [],
  };
  for (const [key, record] of current) {
    const before = prior.get(key);
    if (!before) {
      delta.added.push({ kind: record.kind, ref: record.sourceRef });
      continue;
    }
    const beforeTime =
      before.sourceTimestamp == null ? previousSnapshot : Date.parse(before.sourceTimestamp);
    const afterTime =
      record.sourceTimestamp == null ? nextSnapshot : Date.parse(record.sourceTimestamp);
    if (afterTime < beforeTime)
      fail("REGRESSED_ENTITY_TIMESTAMP", "entity timestamp moved backwards", {
        ref: record.sourceRef,
      });
    if (
      before.sourceRevisionDigest === record.sourceRevisionDigest &&
      before.relationshipDigest === record.relationshipDigest
    ) {
      if (before.sourceTimestampDigest === record.sourceTimestampDigest)
        delta.unchanged.push({ kind: record.kind, ref: record.sourceRef });
      else delta.metadataTouch.push({ kind: record.kind, ref: record.sourceRef });
      continue;
    }
    if (afterTime === beforeTime)
      fail("AMBIGUOUS_ENTITY_REVISION", "changed entity reused its prior timestamp", {
        ref: record.sourceRef,
      });
    delta.changed.push({ kind: record.kind, ref: record.sourceRef });
    if (before.relationshipDigest !== record.relationshipDigest)
      delta.relationshipChanged.push({ kind: record.kind, ref: record.sourceRef });
  }
  for (const [key, record] of prior) {
    if (!current.has(key))
      delta.removed.push({
        kind: record.kind,
        ref: record.sourceRef,
        disposition: "requires_tombstone_decision",
      });
  }
  for (const values of Object.values(delta))
    values.sort(
      (left, right) => left.kind.localeCompare(right.kind) || left.ref.localeCompare(right.ref),
    );
  return {
    compatible: true,
    counts: Object.fromEntries(Object.entries(delta).map(([key, values]) => [key, values.length])),
    ...delta,
  };
}

export async function runFirebaseRehearsal(payload, options = {}) {
  const bundle = await buildFirebaseRehearsalPackage(payload, options);
  const ledger = new InMemoryMigrationLedger();
  const firstApply = ledger.apply(bundle);
  const secondApply = ledger.apply(bundle);
  const reconciliation = reconcileFirebaseRehearsal(bundle, ledger);
  if (!reconciliation.ok)
    fail("RECONCILIATION_FAILED", "shadow reconciliation failed", {
      issueCounts: reconciliation.issueCounts,
    });
  return {
    rehearsalOnly: true,
    databaseWrites: false,
    productionReady: false,
    manifest: bundle.manifest,
    idempotency: {
      firstApply,
      identicalReplay: secondApply,
    },
    reconciliation,
  };
}

async function main() {
  const input = process.argv[2];
  if (!input)
    fail(
      "USAGE",
      "usage: node tools/migration/rehearse-firebase-export.mjs <sanitized-export.json>",
    );
  const payload = JSON.parse(await readFile(input, "utf8"));
  const report = await runFirebaseRehearsal(payload, {
    hmacKey: process.env.CONFETTI_MIGRATION_HMAC_KEY,
    keyId: process.env.CONFETTI_MIGRATION_KEY_ID,
  });
  process.stdout.write(`${JSON.stringify(canonicalize(report), null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify(publicSafeError(error), null, 2)}\n`);
    process.exitCode = 1;
  });
}
