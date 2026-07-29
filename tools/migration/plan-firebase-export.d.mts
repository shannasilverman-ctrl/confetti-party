export function canonicalize(value: unknown): unknown;
export function canonicalHash(value: unknown): string;
export function validateHmacKey(key: unknown): string;
export function opaqueDigest(value: unknown, key: string, domain: string): string;
export function validateFieldMap<T>(fieldMap: T): T;
export function classifyPaths(
  payload: unknown,
  fieldMap: { fields: Array<{ path: string }> },
): {
  paths: string[];
  unknownPaths: string[];
  ambiguousPaths: Array<{ path: string; rules: string[] }>;
};
export function planFirebaseExport(
  payload: unknown,
  options?: { fieldMap?: unknown; hmacKey?: string },
): Promise<{
  fieldMapVersion: string;
  fieldMapDigest: string;
  sourceTenant: string;
  snapshotAt: string;
  sanitized: boolean;
  dryRun: true;
  counts: Record<string, number>;
  opaquePayloadDigest: string;
  migratedFieldPaths: string[];
  classifiedPathCount: number;
  unknownPathCount: 0;
  ambiguousPathCount: 0;
}>;
