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
const SANITIZED_TEST_KEY = "sanitized-fixture-only-not-for-real-migration";

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

function leafPaths(value, prefix = "") {
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${prefix}[]`];
    return value.flatMap((item) => leafPaths(item, `${prefix}[]`));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return [prefix];
    return entries.flatMap(([key, item]) => {
      let safeKey = key;
      if (["users", "vendors", "bookings"].includes(prefix)) safeKey = "*";
      if (prefix === "events") safeKey = key.startsWith("invite:") ? "invite:*" : "*";
      return leafPaths(item, prefix ? `${prefix}.${safeKey}` : safeKey);
    });
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

export function classifyPaths(payload, fieldMap) {
  const rules = fieldMap.fields.map((field) => ({
    ...field,
    regex: patternRegex(field.path),
  }));
  const paths = [...new Set(leafPaths(payload))].sort();
  return {
    paths,
    unknownPaths: paths.filter((path) => !rules.some((rule) => rule.regex.test(path))),
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

function opaqueEntityDigest(payload, key) {
  return createHmac("sha256", key)
    .update(JSON.stringify(canonicalize(payload)))
    .digest("hex");
}

export async function planFirebaseExport(payload, options = {}) {
  const fieldMap = options.fieldMap ?? JSON.parse(await readFile(MAP_PATH, { encoding: "utf8" }));
  if (payload?.meta?.sourceTenant !== fieldMap.sourceTenant)
    throw new Error("source tenant does not match field map");
  const { paths, unknownPaths } = classifyPaths(payload, fieldMap);
  if (unknownPaths.length > 0) {
    const error = new Error("export contains unclassified fields");
    error.code = "UNCLASSIFIED_FIELDS";
    error.unknownPaths = unknownPaths;
    throw error;
  }

  const sanitized = payload?.meta?.sanitized === true;
  const key = options.hmacKey ?? (sanitized ? SANITIZED_TEST_KEY : null);
  if (!key || key.length < 32) throw new Error("a 32+ character migration HMAC key is required");

  return {
    fieldMapVersion: fieldMap.version,
    sourceTenant: fieldMap.sourceTenant,
    snapshotAt: payload.meta.snapshotAt,
    sanitized,
    dryRun: true,
    counts: entityCounts(payload),
    canonicalPayloadHash: canonicalHash(payload),
    opaqueEntityDigest: opaqueEntityDigest(payload, key),
    classifiedPathCount: paths.length,
    unknownPathCount: 0,
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
        : { error: String(error?.message ?? "planning failed") };
    process.stderr.write(`${JSON.stringify(safe, null, 2)}\n`);
    process.exitCode = 1;
  });
}
