export const PREVIEW_WORKER_NAME: string;
export const PREVIEW_URL: string;

export function assertReleaseSha(value: string): string;
export function assertVersionId(value: string): string;
export function deployArguments(releaseSha: string): string[];
export function rollbackArguments(versionId: string, releaseSha: string): string[];
export function parseRollbackArguments(argv: string[]): {
  execute: boolean;
  versionId: string;
  releaseSha: string;
};
export function runChecked(
  command: string,
  args: string[],
  options?: { env?: NodeJS.ProcessEnv },
): void;
