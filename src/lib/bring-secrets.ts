// Client-side receipt store for Bring Board claims.
//
// The release RPC is receipt-only: without the claim secret returned by
// claim_bring_item, a guest cannot release a claim. This module owns the
// secret map's lifecycle in localStorage, including:
//   - Zod-validated shape/size so corrupted values can't wedge the UI.
//   - Explicit status returns so the UI can compensate (release the just-
//     minted claim) when persistence fails.
//   - Silent reset on corruption; no data loss beyond the corrupted map.

import { z } from "zod";

const MAX_ITEMS = 200;
const MAX_KEY_LEN = 80;
const MAX_SECRET_LEN = 64;

const KEY = (token: string) => `confetti.bring.secrets.${token}`;

const SecretMapSchema = z.record(
  z.string().min(1).max(MAX_KEY_LEN),
  z.string().min(1).max(MAX_SECRET_LEN),
);
export type SecretMap = z.infer<typeof SecretMapSchema>;

export type StorageStatus = "ok" | "unavailable" | "full" | "corrupt";

export type StorageAdapter = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function adapter(override?: StorageAdapter): StorageAdapter | null {
  if (override) return override;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSecrets(
  token: string,
  storage?: StorageAdapter,
): { map: SecretMap; status: StorageStatus } {
  const a = adapter(storage);
  if (!a) return { map: {}, status: "unavailable" };
  let raw: string | null = null;
  try {
    raw = a.getItem(KEY(token));
  } catch {
    return { map: {}, status: "unavailable" };
  }
  if (!raw) return { map: {}, status: "ok" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    tryRemove(a, token);
    return { map: {}, status: "corrupt" };
  }
  const check = SecretMapSchema.safeParse(parsed);
  if (!check.success || Object.keys(check.data).length > MAX_ITEMS) {
    tryRemove(a, token);
    return { map: {}, status: "corrupt" };
  }
  return { map: check.data, status: "ok" };
}

function tryRemove(a: StorageAdapter, token: string) {
  try {
    a.removeItem(KEY(token));
  } catch {
    /* noop */
  }
}

/** Persist a single claim receipt; returns the effective storage status. */
export function saveSecret(
  token: string,
  itemId: string,
  secret: string,
  storage?: StorageAdapter,
): StorageStatus {
  const a = adapter(storage);
  if (!a) return "unavailable";
  const { map } = loadSecrets(token, a);
  const next = { ...map, [itemId]: secret };
  try {
    a.setItem(KEY(token), JSON.stringify(next));
    return "ok";
  } catch (e) {
    const name = (e as { name?: string } | undefined)?.name ?? "";
    if (/quota|exceeded/i.test(name) || /quota|exceeded/i.test(String(e))) {
      return "full";
    }
    return "unavailable";
  }
}

export function clearSecret(token: string, itemId: string, storage?: StorageAdapter): void {
  const a = adapter(storage);
  if (!a) return;
  const { map } = loadSecrets(token, a);
  if (!(itemId in map)) return;
  delete map[itemId];
  try {
    if (Object.keys(map).length === 0) a.removeItem(KEY(token));
    else a.setItem(KEY(token), JSON.stringify(map));
  } catch {
    /* noop */
  }
}
