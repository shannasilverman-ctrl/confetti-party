export const DEFAULT_DEPLOYMENT_URL: string;

export function normalizeDeploymentUrl(value: string): string;

export function resolveExpectedReleaseSha(env?: Record<string, string | undefined>): string;

export function assertHtmlSecurityHeaders(headers: Headers, route: string): void;

export function verifyDeployment(
  baseUrl: string,
  options?: { fetchImpl?: typeof fetch; expectedReleaseSha?: string },
): Promise<{
  baseUrl: string;
  releaseSha: string;
  htmlRoutes: number;
  assets: number;
}>;

export function verifyDeploymentWithRetry(
  baseUrl: string,
  options?: {
    attempts?: number;
    delayMs?: number;
    fetchImpl?: typeof fetch;
    expectedReleaseSha?: string;
    onRetry?: (context: { attempt: number; error: Error }) => void;
  },
): Promise<{
  baseUrl: string;
  releaseSha: string;
  htmlRoutes: number;
  assets: number;
}>;
