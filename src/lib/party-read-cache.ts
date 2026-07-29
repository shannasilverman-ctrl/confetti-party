import type { Party } from "./party-context";
import type { PartyRole } from "./collaboration.functions";

export const PARTY_READ_CACHE_VERSION = 1;
export const PARTY_READ_CACHE_MAX_PARTIES = 20;
export const PARTY_READ_CACHE_MAX_USERS = 3;
export const PARTY_READ_CACHE_MAX_BYTES = 1024 * 1024;
export const PARTY_READ_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PartyReadSnapshot = {
  v: typeof PARTY_READ_CACHE_VERSION;
  userId: string;
  syncedAt: number;
  parties: Party[];
  roles: Record<string, PartyRole>;
};

export interface PartyReadCache {
  put(snapshot: PartyReadSnapshot): void;
  remove(userId: string): void;
  load(userId: string): Promise<PartyReadSnapshot | null>;
}

type StoredSnapshot = PartyReadSnapshot & { key: string };

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

function everyObjectWith(
  value: unknown,
  predicate: (item: Record<string, unknown>) => boolean,
): boolean {
  return Array.isArray(value) && value.every((item) => isObject(item) && predicate(item));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isOptionalStringArray(value: unknown): boolean {
  return value === undefined || isStringArray(value);
}

const OCCASIONS = new Set([
  "birthday",
  "baby-shower",
  "graduation",
  "holiday",
  "dinner-party",
  "game-day",
  "cookout",
  "other",
]);
const BUCKETS = new Set(["6+ weeks out", "3-5 weeks", "1-2 weeks", "Party week", "Day of"]);
const RSVP_VALUES = new Set(["invited", "yes", "no", "maybe"]);
const SHOPPING_CATEGORIES = new Set([
  "Venue",
  "Food & Drink",
  "Cake & Desserts",
  "Decorations",
  "Entertainment",
  "Favors",
]);
const SHOPPING_STATES = new Set(["needed", "in-cart", "purchased"]);
const BRING_CATEGORIES = new Set([
  "Main",
  "Sides",
  "Dessert",
  "Drinks",
  "Ice / Serveware",
  "Kids",
  "Décor",
]);
const BRING_STATES = new Set(["open", "claimed", "done"]);
const PHOTO_PROVIDERS = new Set([
  "dropbox_request",
  "google_photos",
  "kululu",
  "guestpix",
  "custom",
]);

function isPlanningProfile(value: unknown): boolean {
  if (value === undefined) return true;
  if (!isObject(value)) return false;
  // Older rows persist the absence of a profile as an empty JSON object.
  if (Object.keys(value).length === 0) return true;
  if (value.version !== 1) return false;
  for (const key of ["honoreeAge", "expectedKids", "expectedAdults", "durationMinutes"] as const) {
    if (value[key] !== undefined && !isFiniteNumber(value[key])) return false;
  }
  if (
    (value.effort !== undefined &&
      !["easy", "balanced", "all-out"].includes(String(value.effort))) ||
    (value.format !== undefined &&
      !["home", "venue", "help-me-choose"].includes(String(value.format))) ||
    (value.foodRole !== undefined &&
      !["light-bites", "full-meal", "grazing"].includes(String(value.foodRole))) ||
    (value.foodServiceStyle !== undefined &&
      !["self-serve", "family-style", "served"].includes(String(value.foodServiceStyle)))
  ) {
    return false;
  }
  return (
    value.localSourcingOptions === undefined ||
    everyObjectWith(
      value.localSourcingOptions,
      (option) =>
        typeof option.id === "string" &&
        typeof option.suggestionId === "string" &&
        ["venue", "food", "experience"].includes(String(option.kind)) &&
        typeof option.providerName === "string" &&
        isOptionalString(option.url) &&
        (option.cost === undefined || isFiniteNumber(option.cost)) &&
        (option.costBasis === undefined ||
          ["host-estimate", "vendor-quote"].includes(String(option.costBasis))) &&
        ["considering", "contacted", "quoted", "booked"].includes(String(option.status)) &&
        isOptionalString(option.notes) &&
        (option.selected === undefined || typeof option.selected === "boolean"),
    )
  );
}

function isParty(value: unknown): value is Party {
  if (!isObject(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    typeof value.occasion === "string" &&
    OCCASIONS.has(value.occasion) &&
    typeof value.date === "string" &&
    isOptionalString(value.startTime) &&
    isOptionalString(value.location) &&
    isFiniteNumber(value.guestEstimate) &&
    value.guestEstimate >= 0 &&
    isFiniteNumber(value.budget) &&
    value.budget >= 0 &&
    typeof value.theme === "string" &&
    isOptionalString(value.themeId) &&
    isOptionalString(value.rsvpToken) &&
    everyObjectWith(
      value.tasks,
      (task) =>
        typeof task.id === "string" &&
        typeof task.title === "string" &&
        typeof task.bucket === "string" &&
        BUCKETS.has(task.bucket) &&
        typeof task.done === "boolean" &&
        isOptionalString(task.owner) &&
        isOptionalString(task.handoffNotes) &&
        isOptionalString(task.reason),
    ) &&
    everyObjectWith(
      value.guests,
      (guest) =>
        typeof guest.id === "string" &&
        typeof guest.name === "string" &&
        (guest.kind === "adult" || guest.kind === "kid") &&
        typeof guest.rsvp === "string" &&
        RSVP_VALUES.has(guest.rsvp) &&
        isOptionalString(guest.household) &&
        isOptionalStringArray(guest.dietary) &&
        isOptionalStringArray(guest.allergens) &&
        (guest.responseDetails === undefined ||
          (isObject(guest.responseDetails) &&
            isOptionalString(guest.responseDetails.arrivalPlan) &&
            isOptionalString(guest.responseDetails.accessNotes))),
    ) &&
    everyObjectWith(
      value.budgetCategories,
      (category) =>
        typeof category.id === "string" &&
        typeof category.name === "string" &&
        isFiniteNumber(category.planned) &&
        everyObjectWith(
          category.expenses,
          (expense) =>
            typeof expense.id === "string" &&
            typeof expense.label === "string" &&
            isFiniteNumber(expense.amount),
        ),
    ) &&
    everyObjectWith(
      value.timeline,
      (item) =>
        typeof item.id === "string" &&
        typeof item.time === "string" &&
        typeof item.activity === "string",
    ) &&
    everyObjectWith(
      value.shoppingItems,
      (item) =>
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.category === "string" &&
        SHOPPING_CATEGORIES.has(item.category) &&
        isFiniteNumber(item.qty) &&
        isFiniteNumber(item.estPrice) &&
        typeof item.status === "string" &&
        SHOPPING_STATES.has(item.status) &&
        isOptionalString(item.linkedExpenseId) &&
        (item.actualPrice === undefined || isFiniteNumber(item.actualPrice)),
    ) &&
    Array.isArray(value.pinnedInspiration) &&
    value.pinnedInspiration.every((item) => typeof item === "string") &&
    isOptionalString(value.hostNote) &&
    (value.households === undefined ||
      everyObjectWith(
        value.households,
        (household) =>
          typeof household.id === "string" &&
          typeof household.label === "string" &&
          isStringArray(household.memberGuestIds),
      )) &&
    (value.bringBoard === undefined ||
      everyObjectWith(
        value.bringBoard,
        (item) =>
          typeof item.id === "string" &&
          typeof item.category === "string" &&
          BRING_CATEGORIES.has(item.category) &&
          typeof item.label === "string" &&
          isFiniteNumber(item.qty) &&
          typeof item.status === "string" &&
          BRING_STATES.has(item.status) &&
          (item.source === "host" || item.source === "guest") &&
          isOptionalString(item.unit) &&
          isOptionalStringArray(item.dietaryTags) &&
          isOptionalString(item.assigneeName) &&
          isOptionalString(item.assigneeHousehold) &&
          isOptionalString(item.claimedAt) &&
          isOptionalString(item.notes),
      )) &&
    (value.hostUpdates === undefined ||
      everyObjectWith(
        value.hostUpdates,
        (update) =>
          typeof update.id === "string" &&
          typeof update.text === "string" &&
          typeof update.at === "string",
      )) &&
    isOptionalString(value.holidayPackId) &&
    isPlanningProfile(value.planningProfile) &&
    (value.photoDrop === undefined ||
      value.photoDrop === null ||
      (isObject(value.photoDrop) &&
        typeof value.photoDrop.provider === "string" &&
        PHOTO_PROVIDERS.has(value.photoDrop.provider) &&
        typeof value.photoDrop.url === "string" &&
        typeof value.photoDrop.updatedAt === "string" &&
        isOptionalString(value.photoDrop.label) &&
        isOptionalString(value.photoDrop.note))) &&
    (value.checkins === undefined ||
      (isObject(value.checkins) &&
        Object.values(value.checkins).every((checkedAt) => typeof checkedAt === "string"))) &&
    (value.retrospective === undefined ||
      value.retrospective === null ||
      (isObject(value.retrospective) &&
        typeof value.retrospective.updatedAt === "string" &&
        isOptionalString(value.retrospective.worked) &&
        isOptionalString(value.retrospective.ranOut) &&
        isOptionalString(value.retrospective.changeNext))) &&
    isOptionalString(value.heroImageUrl) &&
    isOptionalString(value.updatedAt)
  );
}

function redactParty(party: Party): Party {
  const safe = structuredClone(party);
  const topLevel = safe as Party & Record<string, unknown>;
  delete topLevel.rsvpToken;
  delete topLevel.rsvp_token;
  safe.bringBoard = safe.bringBoard?.map((item) => {
    const redacted = { ...item } as typeof item & Record<string, unknown>;
    delete redacted.claimSecret;
    delete redacted.claim_secret;
    return redacted;
  });
  return safe;
}

export function safePartyReadSnapshot(snapshot: PartyReadSnapshot): PartyReadSnapshot | null {
  if (
    snapshot.v !== PARTY_READ_CACHE_VERSION ||
    !snapshot.userId ||
    !isFiniteNumber(snapshot.syncedAt) ||
    snapshot.parties.length > PARTY_READ_CACHE_MAX_PARTIES ||
    !snapshot.parties.every(isParty)
  ) {
    return null;
  }
  const parties = snapshot.parties.map(redactParty);
  const ids = new Set(parties.map((party) => party.id));
  if (ids.size !== parties.length) return null;
  const roleEntries = Object.entries(snapshot.roles);
  if (
    roleEntries.some(
      ([partyId, role]) => !ids.has(partyId) || (role !== "owner" && role !== "cohost"),
    ) ||
    parties.some((party) => !Object.hasOwn(snapshot.roles, party.id))
  ) {
    return null;
  }
  const roles = Object.fromEntries(roleEntries);
  const safe: PartyReadSnapshot = {
    v: PARTY_READ_CACHE_VERSION,
    userId: snapshot.userId,
    syncedAt: snapshot.syncedAt,
    parties,
    roles,
  };
  return byteLength(safe) <= PARTY_READ_CACHE_MAX_BYTES ? safe : null;
}

export function parsePartyReadSnapshot(
  value: unknown,
  userId: string,
  now = Date.now(),
): PartyReadSnapshot | null {
  if (!isObject(value)) return null;
  const syncedAt = value.syncedAt;
  if (
    value.v !== PARTY_READ_CACHE_VERSION ||
    value.userId !== userId ||
    typeof syncedAt !== "number" ||
    !Number.isFinite(syncedAt) ||
    syncedAt > now + 60_000 ||
    now - syncedAt > PARTY_READ_CACHE_TTL_MS ||
    !Array.isArray(value.parties) ||
    value.parties.length > PARTY_READ_CACHE_MAX_PARTIES ||
    !value.parties.every(isParty) ||
    !isObject(value.roles) ||
    byteLength(value) > PARTY_READ_CACHE_MAX_BYTES
  ) {
    return null;
  }
  const partyIds = new Set(value.parties.map((party) => party.id));
  if (partyIds.size !== value.parties.length) return null;
  const roles = value.roles;
  const roleEntries = Object.entries(roles);
  if (
    roleEntries.some(
      ([partyId, role]) => !partyIds.has(partyId) || (role !== "owner" && role !== "cohost"),
    ) ||
    value.parties.some((party) => !Object.hasOwn(roles, party.id))
  ) {
    return null;
  }
  return structuredClone(value) as PartyReadSnapshot;
}

export class MemoryPartyReadCache implements PartyReadCache {
  private records = new Map<string, PartyReadSnapshot>();
  constructor(private now: () => number = Date.now) {}

  put(snapshot: PartyReadSnapshot) {
    const safe = safePartyReadSnapshot(snapshot);
    if (!safe) return;
    this.records.set(safe.userId, safe);
    const newest = [...this.records.values()]
      .sort((a, b) => b.syncedAt - a.syncedAt)
      .slice(0, PARTY_READ_CACHE_MAX_USERS);
    this.records = new Map(newest.map((record) => [record.userId, record]));
  }

  remove(userId: string) {
    this.records.delete(userId);
  }

  async load(userId: string): Promise<PartyReadSnapshot | null> {
    const value = this.records.get(userId);
    if (!value) return null;
    const parsed = parsePartyReadSnapshot(value, userId, this.now());
    if (!parsed) this.records.delete(userId);
    return parsed;
  }
}

const DB_NAME = "confetti-party-read-cache";
const STORE_NAME = "snapshots";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Party read-cache database is blocked"));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export class BrowserPartyReadCache implements PartyReadCache {
  private chain: Promise<void> = Promise.resolve();
  constructor(private now: () => number = Date.now) {}

  private enqueue(operation: () => Promise<void>) {
    this.chain = this.chain.then(operation, operation).catch(() => {
      // Cloud remains authoritative. Storage denial must never crash a host
      // or weaken identity boundaries.
    });
  }

  put(snapshot: PartyReadSnapshot) {
    const safe = safePartyReadSnapshot(snapshot);
    if (!safe) return;
    const stored: StoredSnapshot = { ...safe, key: safe.userId };
    this.enqueue(async () => {
      const db = await openDatabase();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      await new Promise<void>((resolve, reject) => {
        request.onsuccess = () => {
          const records = (request.result as unknown[])
            .filter(
              (candidate): candidate is StoredSnapshot =>
                isObject(candidate) &&
                typeof candidate.key === "string" &&
                typeof candidate.syncedAt === "number" &&
                Number.isFinite(candidate.syncedAt),
            )
            .filter((candidate) => candidate.key !== stored.key);
          store.put(stored, stored.key);
          for (const old of [...records, stored]
            .sort((a, b) => b.syncedAt - a.syncedAt)
            .slice(PARTY_READ_CACHE_MAX_USERS)) {
            store.delete(old.key);
          }
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
      await transactionDone(tx);
      db.close();
    });
  }

  remove(userId: string) {
    this.enqueue(async () => {
      const db = await openDatabase();
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(userId);
      await transactionDone(tx);
      db.close();
    });
  }

  async load(userId: string): Promise<PartyReadSnapshot | null> {
    await this.chain;
    let db: IDBDatabase;
    try {
      db = await openDatabase();
    } catch {
      return null;
    }
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(userId);
    const value = await new Promise<unknown>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(() => undefined);
    const parsed = parsePartyReadSnapshot(value, userId, this.now());
    if (value !== undefined && !parsed) store.delete(userId);
    await transactionDone(tx).catch(() => undefined);
    db.close();
    return parsed;
  }
}

export function makePartyReadCache(): PartyReadCache | undefined {
  if (typeof indexedDB === "undefined") return undefined;
  return new BrowserPartyReadCache();
}

export function canUsePartyReadCacheForError(
  error: unknown,
  online = typeof navigator === "undefined" ? true : navigator.onLine,
): boolean {
  if (!online) return true;
  if (!isObject(error)) return false;
  const status = error.status;
  const code = typeof error.code === "string" ? error.code.toUpperCase() : "";
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  return (
    status === 0 ||
    (typeof status === "number" && status >= 500) ||
    ["PGRST000", "PGRST001", "PGRST002", "NETWORK_ERROR", "FETCH_ERROR"].includes(code) ||
    message.includes("failed to fetch") ||
    message.includes("network")
  );
}

export async function loadTransientPartyReadSnapshot(
  cache: PartyReadCache | undefined,
  userId: string,
  error: unknown,
  online = typeof navigator === "undefined" ? true : navigator.onLine,
): Promise<PartyReadSnapshot | null> {
  if (!cache || !canUsePartyReadCacheForError(error, online)) return null;
  return cache.load(userId);
}
