export const REHEARSAL_CONTRACT_VERSION: string;
export const REVIEWED_FIELD_MAP_DIGEST: string;
export const MIGRATED_FIELD_CONSUMERS: Readonly<Record<string, string>>;

export type SafeManifestRecord = {
  kind: string;
  sourceRef: string;
  sourceRevisionDigest: string;
  sourceTimestampDigest: string | null;
  decision: string;
  targetKinds: string[];
  targetRefs: string[];
  targetRevisionDigests: string[];
  relationshipDigest: string;
  status: "planned";
};

export type FirebaseRehearsalPackage = {
  sensitiveShadowPackage: true;
  context: {
    contractVersion: string;
    fieldMapVersion: string;
    fieldMapDigest: string;
    tenant: string;
    keyId: string;
    sourceTenantRef: string;
  };
  snapshotAt: string;
  records: Array<Record<string, any>>;
  manifest: {
    contractVersion: string;
    fieldMapVersion: string;
    fieldMapDigest: string;
    keyId: string;
    sourceTenantRef: string;
    snapshotAt: string;
    sourceCounts: Record<string, number>;
    decisionCounts: Record<string, number>;
    targetCounts: Record<string, number>;
    sourceRoot: string;
    targetRoot: string;
    records: SafeManifestRecord[];
    manifestDigest: string;
  };
};

export function buildFirebaseRehearsalPackage(
  payload: unknown,
  options: { hmacKey: string; keyId: string; fieldMap?: unknown },
): Promise<FirebaseRehearsalPackage>;

export class InMemoryMigrationLedger {
  context: Record<string, string> | null;
  snapshotAt: string | null;
  manifestDigest: string | null;
  rows: Map<string, Record<string, any>>;
  apply(bundle: FirebaseRehearsalPackage): {
    created: number;
    updated: number;
    unchanged: number;
  };
}

export function reconcileFirebaseRehearsal(
  bundle: FirebaseRehearsalPackage,
  ledger: InMemoryMigrationLedger,
): {
  ok: boolean;
  expectedTargets: number;
  actualTargets: number;
  issueCounts: Record<string, number>;
  issues: Array<{ code: string; ref: string }>;
};

export function compareFirebaseRehearsalPackages(
  previous: FirebaseRehearsalPackage,
  next: FirebaseRehearsalPackage,
): Record<string, any>;

export function runFirebaseRehearsal(
  payload: unknown,
  options: { hmacKey: string; keyId: string; fieldMap?: unknown },
): Promise<Record<string, any>>;
