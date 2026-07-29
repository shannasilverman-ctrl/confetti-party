export function canonicalize(value: unknown): unknown;
export function canonicalHash(value: unknown): string;
export function classifyPaths(
  payload: unknown,
  fieldMap: { fields: Array<{ path: string }> },
): { paths: string[]; unknownPaths: string[] };
export function planFirebaseExport(
  payload: unknown,
  options?: { fieldMap?: unknown; hmacKey?: string },
): Promise<{
  fieldMapVersion: string;
  sourceTenant: string;
  snapshotAt: string;
  sanitized: boolean;
  dryRun: true;
  counts: Record<string, number>;
  canonicalPayloadHash: string;
  opaqueEntityDigest: string;
  classifiedPathCount: number;
  unknownPathCount: 0;
}>;
