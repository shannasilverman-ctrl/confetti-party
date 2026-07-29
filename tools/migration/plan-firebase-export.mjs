#!/usr/bin/env node

import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function defaultMapPath() {
  try {
    return fileURLToPath(new URL("./firebase-field-map-v1.json", import.meta.url));
  } catch {
    // Vitest transforms ESM through an internal URL scheme. The checked-in
    // workspace path remains deterministic in that environment.
    return resolve(process.cwd(), "tools/migration/firebase-field-map-v1.json");
  }
}

const MAP_PATH = defaultMapPath();
const ALLOWED_ACTIONS = new Set(["migrate", "archive", "reauthorize", "retire", "quarantine"]);
const ALLOWED_PII = new Set(["none", "identifier", "personal", "secret", "sensitive"]);

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function canonicalHash(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

export function validateHmacKey(key) {
  if (typeof key !== "string" || Buffer.byteLength(key, "utf8") < 32)
    throw new Error("a 32+ byte migration HMAC key is required");
  return key;
}

export function opaqueDigest(value, key, domain) {
  if (typeof domain !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(domain))
    throw new Error("a stable digest domain is required");
  return createHmac("sha256", validateHmacKey(key))
    .update(`${domain}\0`)
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function leafPaths(value, prefix = "", seen = new WeakSet()) {
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${prefix}[]`];
    return value.flatMap((item) => leafPaths(item, `${prefix}[]`, seen));
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) throw new Error("export contains a cyclic value");
    seen.add(value);
    const entries = Object.entries(value);
    if (entries.length === 0) return [prefix];
    const paths = entries.flatMap(([key, item]) => {
      let safeKey = key;
      if (["users", "vendors", "bookings"].includes(prefix)) safeKey = "*";
      if (prefix === "events") safeKey = key.startsWith("invite:") ? "invite:*" : "*";
      return leafPaths(item, prefix ? `${prefix}.${safeKey}` : safeKey, seen);
    });
    seen.delete(value);
    return paths;
  }
  return [prefix];
}

function patternRegex(pattern) {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    if (pattern.slice(index, index + 2) === "[]") {
      source += "\\[\\]";
      index += 1;
      continue;
    }
    const character = pattern[index];
    if (character === "*") source += "[^.\\[\\]]+";
    else if (/[-/\\^$+?.()|[\]{}]/.test(character)) source += `\\${character}`;
    else source += character;
  }
  return new RegExp(`^${source}$`);
}

export function validateFieldMap(fieldMap) {
  if (!fieldMap || typeof fieldMap !== "object") throw new Error("field map must be an object");
  if (typeof fieldMap.version !== "string" || fieldMap.version.length === 0)
    throw new Error("field map version is required");
  if (typeof fieldMap.sourceTenant !== "string" || fieldMap.sourceTenant.length === 0)
    throw new Error("field map source tenant is required");
  if (!Array.isArray(fieldMap.fields) || fieldMap.fields.length === 0)
    throw new Error("field map fields are required");

  const paths = new Set();
  for (const field of fieldMap.fields) {
    if (!field || typeof field !== "object") throw new Error("field map entry must be an object");
    if (typeof field.path !== "string" || field.path.length === 0)
      throw new Error("field map path is required");
    if (paths.has(field.path)) throw new Error(`field map contains duplicate path: ${field.path}`);
    paths.add(field.path);
    patternRegex(field.path);
    if (!ALLOWED_ACTIONS.has(field.action))
      throw new Error(`field map contains invalid action for ${field.path}`);
    if (!ALLOWED_PII.has(field.pii))
      throw new Error(`field map contains invalid PII classification for ${field.path}`);
    const destinationIsSet = typeof field.destination === "string" && field.destination.length > 0;
    if (field.action === "migrate" && !destinationIsSet)
      throw new Error(`migrated field lacks a destination: ${field.path}`);
    if (["retire", "quarantine"].includes(field.action) && field.destination !== null)
      throw new Error(`non-target field has a destination: ${field.path}`);
  }
  return fieldMap;
}

export function classifyPaths(payload, fieldMap) {
  const validatedMap = validateFieldMap(fieldMap);
  const rules = validatedMap.fields.map((field) => ({
    ...field,
    regex: patternRegex(field.path),
    specificity: field.path.replaceAll("*", "").length,
  }));
  const paths = [...new Set(leafPaths(payload))].sort();
  const matches = new Map(
    paths.map((path) => {
      const matching = rules.filter((rule) => rule.regex.test(path));
      const highestSpecificity = Math.max(...matching.map((rule) => rule.specificity), -1);
      return [
        path,
        matching.filter((rule) => rule.specificity === highestSpecificity).map((rule) => rule.path),
      ];
    }),
  );
  return {
    paths,
    unknownPaths: paths.filter((path) => matches.get(path)?.length === 0),
    ambiguousPaths: paths
      .filter((path) => (matches.get(path)?.length ?? 0) > 1)
      .map((path) => ({ path, rules: matches.get(path) })),
  };
}

function entityCounts(payload) {
  return {
    auth: Array.isArray(payload.auth) ? payload.auth.length : 0,
    users: Object.keys(payload.users ?? {}).length,
    events: Object.keys(payload.events ?? {}).filter((key) => !key.startsWith("invite:")).length,
    invitations: Object.keys(payload.events ?? {}).filter((key) => key.startsWith("invite:"))
      .length,
    vendors: Object.keys(payload.vendors ?? {}).length,
    bookings: Object.keys(payload.bookings ?? {}).length,
    attachments: Array.isArray(payload.storage?.attachments)
      ? payload.storage.attachments.length
      : 0,
  };
}

export async function planFirebaseExport(payload, options = {}) {
  const fieldMap = validateFieldMap(
    options.fieldMap ?? JSON.parse(await readFile(MAP_PATH, { encoding: "utf8" })),
  );
  if (payload?.meta?.sourceTenant !== fieldMap.sourceTenant)
    throw new Error("source tenant does not match field map");
  const { paths, unknownPaths, ambiguousPaths } = classifyPaths(payload, fieldMap);
  if (unknownPaths.length > 0) {
    const error = new Error("export contains unclassified fields");
    error.code = "UNCLASSIFIED_FIELDS";
    error.unknownPaths = unknownPaths;
    throw error;
  }
  if (ambiguousPaths.length > 0) {
    const error = new Error("export fields match multiple classification rules");
    error.code = "AMBIGUOUS_FIELDS";
    error.ambiguousPaths = ambiguousPaths;
    throw error;
  }

  const sanitized = payload?.meta?.sanitized === true;
  const key = validateHmacKey(options.hmacKey);

  return {
    fieldMapVersion: fieldMap.version,
    fieldMapDigest: canonicalHash(fieldMap),
    sourceTenant: fieldMap.sourceTenant,
    snapshotAt: payload.meta.snapshotAt,
    sanitized,
    dryRun: true,
    counts: entityCounts(payload),
    opaquePayloadDigest: opaqueDigest(payload, key, "export-payload"),
    migratedFieldPaths: fieldMap.fields
      .filter((field) => field.action === "migrate")
      .map((field) => field.path)
      .sort(),
    classifiedPathCount: paths.length,
    unknownPathCount: 0,
    ambiguousPathCount: 0,
  };
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    throw new Error("usage: node tools/migration/plan-firebase-export.mjs <sanitized-export.json>");
  }
  const payload = JSON.parse(await readFile(input, "utf8"));
  const plan = await planFirebaseExport(payload, {
    hmacKey: process.env.CONFETTI_MIGRATION_HMAC_KEY,
  });
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    const safe =
      error?.code === "UNCLASSIFIED_FIELDS"
        ? {
            error: "unclassified_fields",
            unknownPaths: error.unknownPaths,
          }
        : error?.code === "AMBIGUOUS_FIELDS"
          ? {
              error: "ambiguous_fields",
              ambiguousPaths: error.ambiguousPaths,
            }
          : { error: String(error?.message ?? "planning failed") };
    process.stderr.write(`${JSON.stringify(safe, null, 2)}\n`);
    process.exitCode = 1;
  });
}
