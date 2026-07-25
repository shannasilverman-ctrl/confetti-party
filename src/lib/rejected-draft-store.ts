// Versioned, size-capped, user-isolated recoverable draft store.
//
// Purpose: when an authenticated party INSERT permanently fails, the
// in-memory party still exists in React state but is lost on reload.
// This module durably persists a MINIMAL sanitized draft so the user can
// resume on the next boot for the same account. No guests, no bring
// board, no claim secrets, no auth tokens. See PERSISTENCE SECOND-PASS
// batch item 4 for the security rationale.
//
// Storage isolation: the storage key is scoped by a stable 16-hex prefix
// of a SHA-256 of the user id (never the raw id). User A → User B on the
// same device therefore see disjoint draft sets even if both drafts fit
// under the size cap.

import { z } from "zod";

const STORAGE_KEY = "confetti.rejectedDraft.v1";
const MAX_BYTES_PER_USER = 4096;

const DraftSchema = z.object({
  id: z.string().min(8).max(64),
  name: z.string().min(1).max(120),
  occasion: z.string().min(1).max(40),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().max(10).optional(),
  location: z.string().max(200).optional(),
  guestEstimate: z.number().int().nonnegative().max(2000),
  budget: z.number().nonnegative().max(1_000_000),
  themeId: z.string().max(60).optional(),
  holidayPackId: z.string().max(60).optional(),
  hostNote: z.string().max(500).optional(),
  timeZone: z.string().max(60).optional(),
  savedAt: z.string(),
});

export type RejectedDraft = z.infer<typeof DraftSchema>;

const FileSchema = z.object({
  version: z.literal(1),
  drafts: z.record(z.string().length(16), DraftSchema),
});

type FileShape = z.infer<typeof FileSchema>;

export type SaveDraftInput = Omit<RejectedDraft, "savedAt">;
export type SaveDraftResult =
  | { ok: true; draft: RejectedDraft }
  | { ok: false; reason: "too_large" | "unavailable" | "invalid" };

// Tiny prototype-pollution guard for the outer JSON parse. `Object.hasOwn`
// avoids false positives from Object.prototype accessors that would fire
// for every parsed JSON object under the `in` operator.
function safeParse(raw: string): unknown {
  const value = JSON.parse(raw);
  if (
    value &&
    typeof value === "object" &&
    (Object.hasOwn(value, "__proto__") || Object.hasOwn(value, "constructor"))
  ) {
    return null;
  }
  return value;
}

function readFile(storage: Storage): FileShape {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return { version: 1, drafts: {} };
  try {
    const parsed = safeParse(raw);
    const validated = FileSchema.safeParse(parsed);
    if (!validated.success) {
      storage.removeItem(STORAGE_KEY);
      return { version: 1, drafts: {} };
    }
    return validated.data;
  } catch {
    // Corrupt payload — reset silently.
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    return { version: 1, drafts: {} };
  }
}

async function hashUserId(userId: string): Promise<string> {
  // Prefer WebCrypto — available in both browser and Node 20 test env.
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const bytes = new TextEncoder().encode(userId);
    const buf = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    const hex = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hex.slice(0, 16);
  }
  // Deterministic fallback — never reached in production; kept so tests
  // in restricted environments still isolate users.
  let h = 0xdeadbeef;
  for (let i = 0; i < userId.length; i++) {
    h = Math.imul(h ^ userId.charCodeAt(i), 2654435761);
  }
  return (h >>> 0).toString(16).padStart(16, "0").slice(0, 16);
}

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export async function saveRejectedDraft(
  userId: string,
  input: SaveDraftInput,
): Promise<SaveDraftResult> {
  const storage = getStorage();
  if (!storage) return { ok: false, reason: "unavailable" };

  const parsed = DraftSchema.omit({ savedAt: true }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  const draft: RejectedDraft = { ...parsed.data, savedAt: new Date().toISOString() };
  const encoded = JSON.stringify(draft);
  if (encoded.length > MAX_BYTES_PER_USER) return { ok: false, reason: "too_large" };

  const key = await hashUserId(userId);
  const file = readFile(storage);
  file.drafts[key] = draft;

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(file));
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, draft };
}

export async function loadRejectedDraft(userId: string): Promise<RejectedDraft | null> {
  const storage = getStorage();
  if (!storage) return null;
  const key = await hashUserId(userId);
  const file = readFile(storage);
  return file.drafts[key] ?? null;
}

export async function clearRejectedDraft(userId: string): Promise<void> {
  const storage = getStorage();
  if (!storage) return;
  const key = await hashUserId(userId);
  const file = readFile(storage);
  if (!(key in file.drafts)) return;
  delete file.drafts[key];
  try {
    if (Object.keys(file.drafts).length === 0) storage.removeItem(STORAGE_KEY);
    else storage.setItem(STORAGE_KEY, JSON.stringify(file));
  } catch {
    // ignore
  }
}

// Test-only helper — never called from production code.
export function __resetForTests(): void {
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

// Exported for tests + wizard batch coordination.
export const REJECTED_DRAFT_STORAGE_KEY = STORAGE_KEY;
export const REJECTED_DRAFT_MAX_BYTES = MAX_BYTES_PER_USER;
