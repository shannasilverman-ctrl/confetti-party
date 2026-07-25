import { describe, it, expect } from "vitest";
import type { StorageAdapter } from "@/lib/bring-secrets";
import { loadSecrets, saveSecret, clearSecret } from "@/lib/bring-secrets";

function makeStorage(opts?: {
  throwOnSet?: "quota" | "any";
  throwOnGet?: boolean;
  seed?: Record<string, string>;
}): StorageAdapter & { data: Record<string, string> } {
  const data: Record<string, string> = { ...(opts?.seed ?? {}) };
  return {
    data,
    getItem(k) {
      if (opts?.throwOnGet) throw new Error("blocked");
      return k in data ? data[k] : null;
    },
    setItem(k, v) {
      if (opts?.throwOnSet === "quota") {
        const err = new Error("Quota exceeded");
        (err as { name?: string }).name = "QuotaExceededError";
        throw err;
      }
      if (opts?.throwOnSet === "any") throw new Error("blocked");
      data[k] = v;
    },
    removeItem(k) {
      delete data[k];
    },
  };
}

const TOKEN = "00000000-0000-0000-0000-000000000000";
const KEY = `confetti.bring.secrets.${TOKEN}`;

describe("bring-secrets", () => {
  it("returns empty map with 'ok' when storage has nothing", () => {
    const s = makeStorage();
    expect(loadSecrets(TOKEN, s)).toEqual({ map: {}, status: "ok" });
  });

  it("saves and reloads secrets round-trip", () => {
    const s = makeStorage();
    expect(saveSecret(TOKEN, "item-1", "abc", s)).toBe("ok");
    expect(saveSecret(TOKEN, "item-2", "xyz", s)).toBe("ok");
    expect(loadSecrets(TOKEN, s)).toEqual({
      map: { "item-1": "abc", "item-2": "xyz" },
      status: "ok",
    });
  });

  it("returns 'full' when quota is exceeded, so caller can compensate", () => {
    const s = makeStorage({ throwOnSet: "quota" });
    expect(saveSecret(TOKEN, "item-1", "abc", s)).toBe("full");
  });

  it("returns 'unavailable' when storage is blocked (private mode)", () => {
    const s = makeStorage({ throwOnSet: "any" });
    expect(saveSecret(TOKEN, "item-1", "abc", s)).toBe("unavailable");
  });

  it("resets and returns 'corrupt' on invalid JSON", () => {
    const s = makeStorage({ seed: { [KEY]: "{not-json" } });
    expect(loadSecrets(TOKEN, s)).toEqual({ map: {}, status: "corrupt" });
    expect(s.data[KEY]).toBeUndefined();
  });

  it("resets and returns 'corrupt' on shape violation", () => {
    const s = makeStorage({ seed: { [KEY]: JSON.stringify({ x: 123 }) } });
    expect(loadSecrets(TOKEN, s)).toEqual({ map: {}, status: "corrupt" });
  });

  it("resets when the stored map exceeds the item cap", () => {
    const big: Record<string, string> = {};
    for (let i = 0; i < 500; i++) big[`i${i}`] = "s";
    const s = makeStorage({ seed: { [KEY]: JSON.stringify(big) } });
    expect(loadSecrets(TOKEN, s).status).toBe("corrupt");
  });

  it("clearSecret removes just the one entry", () => {
    const s = makeStorage();
    saveSecret(TOKEN, "a", "1", s);
    saveSecret(TOKEN, "b", "2", s);
    clearSecret(TOKEN, "a", s);
    expect(loadSecrets(TOKEN, s).map).toEqual({ b: "2" });
  });

  it("clearSecret removes the whole key when it empties the map", () => {
    const s = makeStorage();
    saveSecret(TOKEN, "a", "1", s);
    clearSecret(TOKEN, "a", s);
    expect(s.data[KEY]).toBeUndefined();
  });
});
