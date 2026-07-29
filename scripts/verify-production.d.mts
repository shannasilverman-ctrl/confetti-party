export const PRODUCTION_CANONICAL_URL: string;
export const PRODUCTION_APEX_URL: string;

export function assertCanonicalReleaseWorktree(
  execFile?: (command: string, args: string[], options: { encoding: "utf8" }) => string,
): string;

export function verifyProductionRelease(options?: {
  fetchImpl?: typeof fetch;
  expectedReleaseSha?: string;
  verifyImpl?: (
    baseUrl: string,
    options: { fetchImpl: typeof fetch; expectedReleaseSha: string },
  ) => Promise<{
    baseUrl: string;
    releaseSha: string;
    htmlRoutes?: number;
    assets?: number;
  }>;
}): Promise<{
  canonical: {
    baseUrl: string;
    releaseSha: string;
    htmlRoutes?: number;
    assets?: number;
  };
  apex: { mode: "redirect"; destination: string } | { mode: "direct"; releaseSha: string };
}>;
