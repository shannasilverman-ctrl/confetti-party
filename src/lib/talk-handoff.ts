// Device-local signed-out → signed-in Talk handoff.
//
// Contract:
//   - localStorage only, no network, no audio, no provider blobs, no
//     secrets/tokens. Anything captured here is user-visible plain text.
//   - Versioned + strictly Zod-validated on read. Any failure returns null;
//     UI never throws on corrupt/oversized/expired state.
//   - TTL: HANDOFF_TTL_MS (24h) from createdAt.
//   - Idempotency: each save mints/keeps a UUID that becomes the server-side
//     import key. Continue that finds an existing draft with the same key
//     reuses it, so refresh / double-click / retry never create duplicates.
//   - Cross-account: the handoff has no user identity until markClaimedBy
//     runs. Once claimed by a user, subsequent readers on the same device
//     under a DIFFERENT user must not see a Resume card (see readHandoff).

import { z } from "zod";
import { DraftPatchZ } from "./talk-schemas";

export const HANDOFF_STORAGE_KEY = "confetti:talk-handoff:v1";
export const HANDOFF_TTL_MS = 24 * 60 * 60 * 1000; // 24h
export const HANDOFF_MAX_BYTES = 32 * 1024; // 32 KB serialized
export const HANDOFF_MAX_MESSAGES = 60;
export const HANDOFF_MAX_MSG_BYTES = 2 * 1024; // 2 KB UTF-8 per message

const MessageZ = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1),
});

const HandoffV1Z = z
  .object({
    version: z.literal(1),
    createdAt: z.number().int().positive(),
    idempotencyKey: z.string().uuid(),
    summary: z.string().max(500).default(""),
    messages: z.array(MessageZ).max(HANDOFF_MAX_MESSAGES),
    patch: DraftPatchZ,
    claimedBy: z.string().uuid().nullable().optional(),
  })
  .strict();

export type TalkHandoffV1 = z.infer<typeof HandoffV1Z>;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).byteLength;
}

function nowMs(): number {
  return Date.now();
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Test/SSR fallback — non-cryptographic but shape-valid.
  return "00000000-0000-4000-8000-" + Math.random().toString(16).slice(2, 14).padEnd(12, "0");
}

export type SaveHandoffInput = {
  messages: Array<{ role: "user" | "assistant"; text: string }>;
  patch: unknown;
  summary?: string;
  /** Reuse a prior idempotency key so refreshes don't remint. */
  previousKey?: string;
};

/** Persist the handoff. Returns the record actually stored, or null on failure. */
export function saveHandoff(
  input: SaveHandoffInput,
  storage: StorageLike | null = getStorage(),
): TalkHandoffV1 | null {
  if (!storage) return null;

  // Cap and trim messages before validating.
  const cappedMessages = input.messages
    .slice(-HANDOFF_MAX_MESSAGES)
    .map((m) => {
      const text = (m.text ?? "").toString();
      if (utf8Bytes(text) > HANDOFF_MAX_MSG_BYTES) {
        // Byte-trim conservatively: slice by chars first, then re-check.
        // Losing tail characters is preferable to dropping the whole
        // message.
        let truncated = text.slice(0, HANDOFF_MAX_MSG_BYTES);
        while (utf8Bytes(truncated) > HANDOFF_MAX_MSG_BYTES && truncated.length > 0) {
          truncated = truncated.slice(0, -1);
        }
        return { role: m.role, text: truncated };
      }
      return { role: m.role, text };
    })
    .filter((m) => m.text.length > 0);

  const patchResult = DraftPatchZ.safeParse(input.patch ?? {});
  const patch = patchResult.success ? patchResult.data : {};

  const record: TalkHandoffV1 = {
    version: 1,
    createdAt: nowMs(),
    idempotencyKey: input.previousKey ?? newIdempotencyKey(),
    summary: (input.summary ?? "").slice(0, 500),
    messages: cappedMessages,
    patch,
    claimedBy: null,
  };

  const parsed = HandoffV1Z.safeParse(record);
  if (!parsed.success) return null;

  const json = JSON.stringify(parsed.data);
  if (utf8Bytes(json) > HANDOFF_MAX_BYTES) return null;

  try {
    storage.setItem(HANDOFF_STORAGE_KEY, json);
    return parsed.data;
  } catch {
    return null;
  }
}

/**
 * Read + validate the handoff. Returns null on: absent, corrupt JSON,
 * schema mismatch, oversized payload, expired TTL. The optional
 * `currentUserId` argument enforces cross-account isolation: if the stored
 * record was already claimed by a DIFFERENT user, we return null so the
 * new signer never sees another account's work.
 */
export function readHandoff(
  currentUserId?: string | null,
  storage: StorageLike | null = getStorage(),
): TalkHandoffV1 | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(HANDOFF_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  if (utf8Bytes(raw) > HANDOFF_MAX_BYTES) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const outcome = HandoffV1Z.safeParse(parsed);
  if (!outcome.success) return null;
  const rec = outcome.data;

  if (nowMs() - rec.createdAt > HANDOFF_TTL_MS) return null;

  if (
    rec.claimedBy &&
    currentUserId != null &&
    rec.claimedBy !== currentUserId
  ) {
    return null;
  }
  return rec;
}

export function clearHandoff(storage: StorageLike | null = getStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(HANDOFF_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Bind the on-disk handoff to a specific user. Idempotent: a second call
 * with the same userId is a no-op. Returns the updated record, or null if
 * there is nothing to claim or the claim would conflict with a different
 * previous claimer.
 */
export function markClaimedBy(
  userId: string,
  storage: StorageLike | null = getStorage(),
): TalkHandoffV1 | null {
  if (!storage) return null;
  const current = readHandoff(userId, storage);
  if (!current) return null;
  if (current.claimedBy === userId) return current;
  const updated: TalkHandoffV1 = { ...current, claimedBy: userId };
  const json = JSON.stringify(updated);
  try {
    storage.setItem(HANDOFF_STORAGE_KEY, json);
    return updated;
  } catch {
    return null;
  }
}
