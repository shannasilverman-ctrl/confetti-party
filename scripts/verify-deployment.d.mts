export const DEFAULT_DEPLOYMENT_URL: string;

export function normalizeDeploymentUrl(value: string): string;

export function assertHtmlSecurityHeaders(headers: Headers, route: string): void;

export function verifyDeployment(
  baseUrl: string,
  options?: { fetchImpl?: typeof fetch },
): Promise<{
  baseUrl: string;
  htmlRoutes: number;
  assets: number;
}>;
