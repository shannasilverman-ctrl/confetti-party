import { spawnSync } from "node:child_process";

export const PREVIEW_WORKER_NAME = "confetti-independent-preview";
export const PREVIEW_URL = "https://confetti-independent-preview.shannasilverman-apps.workers.dev";

export function assertReleaseSha(value) {
  if (!/^[0-9a-f]{40}$/i.test(value ?? "")) {
    throw new Error("Release SHA must be a full 40-character Git commit.");
  }
  return value.toLowerCase();
}

export function assertVersionId(value) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value ?? "")
  ) {
    throw new Error("Cloudflare version must be a valid UUID.");
  }
  return value.toLowerCase();
}

export function deployArguments(releaseSha) {
  const release = assertReleaseSha(releaseSha);
  return [
    "deploy",
    "--config",
    ".output/server/wrangler.json",
    "--name",
    PREVIEW_WORKER_NAME,
    "--message",
    `Confetti release ${release}`,
  ];
}

export function rollbackArguments(versionId, releaseSha) {
  const version = assertVersionId(versionId);
  const release = assertReleaseSha(releaseSha);
  return [
    "rollback",
    version,
    "--name",
    PREVIEW_WORKER_NAME,
    "--message",
    `Confetti rollback to ${release}`,
  ];
}

export function parseRollbackArguments(argv) {
  const result = { execute: false, versionId: "", releaseSha: "" };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--execute") {
      result.execute = true;
      continue;
    }
    if (arg === "--version" || arg === "--release") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      if (arg === "--version") result.versionId = value;
      else result.releaseSha = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown rollback option: ${arg}`);
  }

  result.versionId = assertVersionId(result.versionId);
  result.releaseSha = assertReleaseSha(result.releaseSha);
  return result;
}

export function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? "unknown"}.`);
  }
}
