import type { Party } from "./party-context";
import type { PartyRow } from "./party-persistence";

export const PARTY_OUTBOX_VERSION = 1;
export const PARTY_OUTBOX_MAX_ENTRIES = 20;
export const PARTY_OUTBOX_MAX_TOTAL_ENTRIES = 60;
export const PARTY_OUTBOX_MAX_BYTES = 1024 * 1024;
export const PARTY_OUTBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PendingPartyWrite = {
  v: typeof PARTY_OUTBOX_VERSION;
  userId: string;
  partyId: string;
  savedAt: number;
  latest: Party;
  baseline: PartyRow | null;
  /** Exact row first submitted for a new party. It distinguishes an insert
   * that landed before a crash from one that still needs to be retried. */
  insertBase: PartyRow | null;
};

export interface PartyOutbox {
  put(record: PendingPartyWrite): void;
  remove(userId: string, partyId: string): void;
  load(userId: string): Promise<PendingPartyWrite[]>;
}

type StoredRecord = PendingPartyWrite & { key: string };

function recordKey(userId: string, partyId: string) {
  return `${userId}:${partyId}`;
}

function byteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isParty(value: unknown, partyId: string): value is Party {
  if (!isObject(value)) return false;
  return (
    value.id === partyId &&
    typeof value.name === "string" &&
    typeof value.occasion === "string" &&
    typeof value.date === "string" &&
    typeof value.guestEstimate === "number" &&
    Number.isFinite(value.guestEstimate) &&
    typeof value.budget === "number" &&
    Number.isFinite(value.budget) &&
    typeof value.theme === "string" &&
    Array.isArray(value.tasks) &&
    Array.isArray(value.guests) &&
    Array.isArray(value.budgetCategories) &&
    Array.isArray(value.timeline) &&
    Array.isArray(value.shoppingItems) &&
    Array.isArray(value.pinnedInspiration)
  );
}

function isRow(value: unknown, userId: string, partyId: string): value is PartyRow {
  if (!isObject(value)) return false;
  return (
    value.id === partyId &&
    value.user_id === userId &&
    typeof value.name === "string" &&
    Array.isArray(value.tasks) &&
    Array.isArray(value.guests)
  );
}

function parseRecord(value: unknown, userId: string, now: number): PendingPartyWrite | null {
  if (!isObject(value)) return null;
  const partyId = value.partyId;
  const savedAt = value.savedAt;
  if (
    value.v !== PARTY_OUTBOX_VERSION ||
    value.userId !== userId ||
    typeof partyId !== "string" ||
    !partyId ||
    typeof savedAt !== "number" ||
    !Number.isFinite(savedAt) ||
    savedAt > now + 60_000 ||
    now - savedAt > PARTY_OUTBOX_TTL_MS ||
    !isParty(value.latest, partyId) ||
    (value.baseline !== null && !isRow(value.baseline, userId, partyId)) ||
    (value.insertBase !== null && !isRow(value.insertBase, userId, partyId))
  ) {
    return null;
  }
  const parsed = value as unknown as PendingPartyWrite;
  if (byteLength(parsed) > PARTY_OUTBOX_MAX_BYTES) return null;
  return parsed;
}

/** RSVP tokens are bearer secrets. Pending host writes never need them, so
 * browser recovery storage deliberately omits them. */
export function redactPendingPartyWrite(record: PendingPartyWrite): PendingPartyWrite {
  const latest = { ...record.latest };
  delete latest.rsvpToken;
  const redactRow = (row: PartyRow | null): PartyRow | null => {
    if (!row) return null;
    const copy = { ...row };
    delete copy.rsvp_token;
    return copy;
  };
  return {
    ...record,
    latest,
    baseline: redactRow(record.baseline),
    insertBase: redactRow(record.insertBase),
  };
}

export class MemoryPartyOutbox implements PartyOutbox {
  private records = new Map<string, PendingPartyWrite>();
  constructor(private now: () => number = Date.now) {}

  put(record: PendingPartyWrite) {
    const safe = redactPendingPartyWrite(record);
    if (byteLength(safe) > PARTY_OUTBOX_MAX_BYTES) return;
    try {
      this.records.set(recordKey(safe.userId, safe.partyId), structuredClone(safe));
    } catch {
      return;
    }
    const userRecords = [...this.records.entries()]
      .filter(([, value]) => value.userId === safe.userId)
      .sort((a, b) => b[1].savedAt - a[1].savedAt);
    for (const [key] of userRecords.slice(PARTY_OUTBOX_MAX_ENTRIES)) this.records.delete(key);
    const allRecords = [...this.records.entries()].sort((a, b) => b[1].savedAt - a[1].savedAt);
    for (const [key] of allRecords.slice(PARTY_OUTBOX_MAX_TOTAL_ENTRIES)) {
      this.records.delete(key);
    }
  }

  remove(userId: string, partyId: string) {
    this.records.delete(recordKey(userId, partyId));
  }

  async load(userId: string): Promise<PendingPartyWrite[]> {
    const valid: PendingPartyWrite[] = [];
    for (const [key, value] of this.records) {
      if (!key.startsWith(`${userId}:`)) continue;
      const parsed = parseRecord(value, userId, this.now());
      if (parsed) valid.push(structuredClone(parsed));
      else this.records.delete(key);
    }
    return valid.sort((a, b) => a.savedAt - b.savedAt).slice(-PARTY_OUTBOX_MAX_ENTRIES);
  }
}

const DB_NAME = "confetti-pending-writes";
const STORE_NAME = "pending";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Pending-write database is blocked"));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** IndexedDB-backed durable outbox. Operations are serialized so an
 * acknowledgement can never be overtaken by an earlier queued write. */
export class BrowserPartyOutbox implements PartyOutbox {
  private chain: Promise<void> = Promise.resolve();
  constructor(private now: () => number = Date.now) {}

  private enqueue(operation: () => Promise<void>) {
    this.chain = this.chain.then(operation, operation).catch(() => {
      // The PartyStore remains authoritative in memory. UI save state already
      // communicates cloud failures; storage denial must not crash the app.
    });
  }

  put(record: PendingPartyWrite) {
    const safe = redactPendingPartyWrite(record);
    if (byteLength(safe) > PARTY_OUTBOX_MAX_BYTES) return;
    const stored: StoredRecord = { ...safe, key: recordKey(safe.userId, safe.partyId) };
    this.enqueue(async () => {
      const db = await openDatabase();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      await new Promise<void>((resolve, reject) => {
        request.onsuccess = () => {
          const records = (request.result as unknown[])
            .filter(
              (value): value is StoredRecord => isObject(value) && typeof value.key === "string",
            )
            .filter((value) => value.key !== stored.key);
          const withCurrent = [...records, stored];
          const keepForUser = new Set(
            withCurrent
              .filter((value) => value.userId === stored.userId)
              .sort((a, b) => b.savedAt - a.savedAt)
              .slice(0, PARTY_OUTBOX_MAX_ENTRIES)
              .map((value) => value.key),
          );
          const keepTotal = new Set(
            withCurrent
              .sort((a, b) => b.savedAt - a.savedAt)
              .slice(0, PARTY_OUTBOX_MAX_TOTAL_ENTRIES)
              .map((value) => value.key),
          );
          store.put(stored, stored.key);
          for (const value of records) {
            if (
              (value.userId === stored.userId && !keepForUser.has(value.key)) ||
              !keepTotal.has(value.key)
            ) {
              store.delete(value.key);
            }
          }
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
      await transactionDone(tx);
      db.close();
    });
  }

  remove(userId: string, partyId: string) {
    this.enqueue(async () => {
      const db = await openDatabase();
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(recordKey(userId, partyId));
      await transactionDone(tx);
      db.close();
    });
  }

  async load(userId: string): Promise<PendingPartyWrite[]> {
    await this.chain;
    let db: IDBDatabase;
    try {
      db = await openDatabase();
    } catch {
      return [];
    }
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    const values = await new Promise<unknown[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(() => []);
    const valid: PendingPartyWrite[] = [];
    for (const value of values) {
      if (!isObject(value) || typeof value.key !== "string") continue;
      if (!value.key.startsWith(`${userId}:`)) continue;
      const parsed = parseRecord(value, userId, this.now());
      if (parsed) valid.push(parsed);
      else store.delete(value.key);
    }
    await transactionDone(tx).catch(() => undefined);
    db.close();
    return valid.sort((a, b) => a.savedAt - b.savedAt).slice(-PARTY_OUTBOX_MAX_ENTRIES);
  }
}

export function makePartyOutbox(): PartyOutbox | undefined {
  if (typeof indexedDB === "undefined") return undefined;
  return new BrowserPartyOutbox();
}
