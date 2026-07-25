export const CANONICAL_WRANGLER_CONFIG: string;
export const SANDBOX_WRANGLER_CONFIG: string;
export function wranglerConfigCandidates(opts?: { env?: NodeJS.ProcessEnv }): string[];
export function resolveWranglerConfigPath(opts?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  requireExists?: boolean;
}): string;
