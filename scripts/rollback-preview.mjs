import { pathToFileURL } from "node:url";
import {
  parseRollbackArguments,
  PREVIEW_URL,
  rollbackArguments,
  runChecked,
} from "./release-operations.mjs";

export function rollbackPreview(argv) {
  const plan = parseRollbackArguments(argv);
  const args = rollbackArguments(plan.versionId, plan.releaseSha);

  if (!plan.execute) {
    console.log(
      [
        "[rollback] dry run only; no Cloudflare state changed",
        `[rollback] worker: confetti-independent-preview`,
        `[rollback] target version: ${plan.versionId}`,
        `[rollback] expected release: ${plan.releaseSha}`,
        "[rollback] repeat with --execute only after incident approval",
      ].join("\n"),
    );
    return plan;
  }

  runChecked("wrangler", args);
  runChecked(process.execPath, ["scripts/verify-deployment.mjs", PREVIEW_URL], {
    env: {
      ...process.env,
      CONFETTI_EXPECTED_RELEASE_SHA: plan.releaseSha,
    },
  });
  return plan;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  try {
    rollbackPreview(process.argv.slice(2));
  } catch (error) {
    console.error(`[rollback] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
