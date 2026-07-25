export const WRANGLER_CONFIG_CANDIDATES: readonly [string, string];
export function resolveWranglerConfigPath(opts?: { cwd?: string; requireExists?: boolean }): string;
