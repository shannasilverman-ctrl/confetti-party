import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { deployArguments, runChecked } from "./release-operations.mjs";

export function resolveReleaseSha() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  })
    .trim()
    .toLowerCase();
}

export function deployPreview() {
  const releaseSha = resolveReleaseSha();
  runChecked("npm", ["run", "build"]);
  runChecked("wrangler", deployArguments(releaseSha));
  runChecked(process.execPath, ["scripts/verify-deployment.mjs"], {
    env: {
      ...process.env,
      CONFETTI_EXPECTED_RELEASE_SHA: releaseSha,
    },
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  try {
    deployPreview();
  } catch (error) {
    console.error(`[deploy] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
