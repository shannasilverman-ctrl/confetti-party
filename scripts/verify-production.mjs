import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolveExpectedReleaseSha, verifyDeploymentWithRetry } from "./verify-deployment.mjs";

export const PRODUCTION_CANONICAL_URL = "https://www.confettiapp.ai";
export const PRODUCTION_APEX_URL = "https://confettiapp.ai";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function assertCanonicalReleaseWorktree(execFile = execFileSync) {
  const branch = execFile("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
  invariant(
    branch === "main",
    `Production verification must run from main, not ${branch || "HEAD"}.`,
  );

  const status = execFile("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
  invariant(!status, "Production verification requires a clean worktree.");

  const local = execFile("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const remote = execFile("git", ["rev-parse", "origin/main"], { encoding: "utf8" }).trim();
  invariant(local === remote, "Production verification requires HEAD to match origin/main.");
  return local.toLowerCase();
}

export async function verifyProductionRelease({
  fetchImpl = fetch,
  expectedReleaseSha = resolveExpectedReleaseSha(),
  verifyImpl = verifyDeploymentWithRetry,
} = {}) {
  const canonical = await verifyImpl(PRODUCTION_CANONICAL_URL, {
    fetchImpl,
    expectedReleaseSha,
  });

  const apexReleaseUrl = new URL("/release.json", `${PRODUCTION_APEX_URL}/`);
  apexReleaseUrl.searchParams.set("verify", `production-${Date.now()}`);
  const apexProbe = await fetchImpl(apexReleaseUrl, {
    redirect: "manual",
    headers: { "cache-control": "no-cache" },
  });

  if ([301, 302, 307, 308].includes(apexProbe.status)) {
    const location = apexProbe.headers.get("location");
    invariant(location, "Production apex redirect is missing a Location header.");
    const destination = new URL(location, apexReleaseUrl);
    invariant(
      destination.origin === PRODUCTION_CANONICAL_URL && destination.pathname === "/release.json",
      `Production apex redirects to unexpected destination: ${destination.toString()}`,
    );
    return { canonical, apex: { mode: "redirect", destination: destination.origin } };
  }

  const apex = await verifyImpl(PRODUCTION_APEX_URL, {
    fetchImpl,
    expectedReleaseSha,
  });
  return { canonical, apex: { mode: "direct", releaseSha: apex.releaseSha } };
}

async function main() {
  const worktreeSha = assertCanonicalReleaseWorktree();
  const configuredSha = resolveExpectedReleaseSha();
  invariant(
    configuredSha === worktreeSha,
    `Configured release ${configuredSha} does not match canonical worktree ${worktreeSha}.`,
  );
  const result = await verifyProductionRelease({ expectedReleaseSha: worktreeSha });
  console.log(
    `[production] ${worktreeSha.slice(0, 12)} verified on ${PRODUCTION_CANONICAL_URL}; apex mode: ${result.apex.mode}`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(`[production] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
