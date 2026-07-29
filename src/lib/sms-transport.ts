import type { SmsPlanningState } from "./sms-planning";
import { z } from "zod";

const SMS_CIPHERTEXT_VERSION = "v1";
const SMS_IV_BYTES = 12;
const SMS_KEY_BYTES = 32;
const HEX_DIGEST = /^[0-9a-f]{64}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const KEY_ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export const SMS_WEBHOOK_RETRY_FRAGMENT = "rc=2&rp=ct,rt,5xx&ct=2000&rt=5000&tt=15000";

export type TwilioFormParams = Record<string, string | string[]>;
export type BoundedBodyResult =
  | { status: "ok"; body: string }
  | { status: "too_large" | "invalid" | "read_error" };

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!value || !BASE64URL.test(value)) throw new Error("invalid ciphertext");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new Error("invalid ciphertext");
  }
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64ToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error("invalid encryption key");
  }
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error("invalid encryption key");
  }
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

async function importEncryptionKey(encodedKey: string): Promise<CryptoKey> {
  const bytes = base64ToBytes(encodedKey);
  if (bytes.byteLength !== SMS_KEY_BYTES) throw new Error("invalid encryption key");
  return crypto.subtle.importKey("raw", arrayBuffer(bytes), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export function validateSmsEncryptionKey(encodedKey: string): boolean {
  try {
    return base64ToBytes(encodedKey).byteLength === SMS_KEY_BYTES;
  } catch {
    return false;
  }
}

export function validateSmsHmacKey(encodedKey: string): boolean {
  try {
    return base64ToBytes(encodedKey).byteLength === SMS_KEY_BYTES;
  } catch {
    return false;
  }
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function normalizeE164(value: string): string | null {
  const normalized = value.trim();
  return /^\+[1-9][0-9]{7,14}$/.test(normalized) ? normalized : null;
}

/**
 * Parse form-urlencoded input once and preserve repeated parameters exactly in
 * the shape accepted by Twilio's maintained signature validator.
 */
export function collectTwilioParams(raw: string): {
  params: TwilioFormParams;
  form: URLSearchParams;
} {
  const form = new URLSearchParams(raw);
  const params: TwilioFormParams = {};
  for (const [key, value] of form.entries()) {
    const existing = params[key];
    if (existing === undefined) {
      params[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      params[key] = [existing, value];
    }
  }
  return { params, form };
}

export async function readBoundedUtf8Body(
  request: Request,
  maxBytes: number,
): Promise<BoundedBodyResult> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { status: "too_large" };
  if (!request.body) return { status: "ok", body: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return { status: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { status: "read_error" };
  }

  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return {
      status: "ok",
      body: new TextDecoder("utf-8", { fatal: true }).decode(merged),
    };
  } catch {
    return { status: "invalid" };
  }
}

export async function keyedDigestHex(
  encodedKey: string,
  purpose: "phone" | "body" | "receipt",
  value: string,
): Promise<string> {
  const keyBytes = base64ToBytes(encodedKey);
  if (keyBytes.byteLength !== SMS_KEY_BYTES) throw new Error("invalid HMAC key");
  const key = await crypto.subtle.importKey(
    "raw",
    arrayBuffer(keyBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    arrayBuffer(utf8(`confetti:sms:${purpose}:v1:${value}`)),
  );
  return Array.from(new Uint8Array(signed), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function encryptionAad(keyId: string, context: string): Uint8Array {
  if (!KEY_ID.test(keyId) || !context || utf8(context).byteLength > 256) {
    throw new Error("invalid encryption context");
  }
  return utf8(`confetti:sms:aes:v1:${keyId}:${context}`);
}

export async function encryptSmsValue(
  value: string,
  encodedKey: string,
  context: string,
  keyId = "current",
): Promise<string> {
  const key = await importEncryptionKey(encodedKey);
  const iv = crypto.getRandomValues(new Uint8Array(SMS_IV_BYTES));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: arrayBuffer(iv),
      additionalData: arrayBuffer(encryptionAad(keyId, context)),
    },
    key,
    arrayBuffer(utf8(value)),
  );
  return `${SMS_CIPHERTEXT_VERSION}.${keyId}.${bytesToBase64Url(iv)}.${bytesToBase64Url(
    new Uint8Array(encrypted),
  )}`;
}

export async function decryptSmsValue(
  ciphertext: string,
  keysById: Readonly<Record<string, string>>,
  context: string,
): Promise<string> {
  const [version, keyId, encodedIv, encodedPayload, ...extra] = ciphertext.split(".");
  if (
    version !== SMS_CIPHERTEXT_VERSION ||
    !keyId ||
    !encodedIv ||
    !encodedPayload ||
    extra.length > 0
  ) {
    throw new Error("invalid ciphertext");
  }
  const iv = base64UrlToBytes(encodedIv);
  const payload = base64UrlToBytes(encodedPayload);
  if (iv.byteLength !== SMS_IV_BYTES || payload.byteLength < 16) {
    throw new Error("invalid ciphertext");
  }
  const encodedKey = keysById[keyId];
  if (!encodedKey) throw new Error("invalid ciphertext");
  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: arrayBuffer(iv),
        additionalData: arrayBuffer(encryptionAad(keyId, context)),
      },
      await importEncryptionKey(encodedKey),
      arrayBuffer(payload),
    );
    return new TextDecoder("utf-8", { fatal: true }).decode(decrypted);
  } catch {
    throw new Error("invalid ciphertext");
  }
}

function escapeXml(value: string): string {
  let validXml = "";
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    if (
      point === 0x09 ||
      point === 0x0a ||
      point === 0x0d ||
      (point >= 0x20 && point <= 0xd7ff) ||
      (point >= 0xe000 && point <= 0xfffd) ||
      (point >= 0x10000 && point <= 0x10ffff)
    ) {
      validXml += character;
    }
  }
  return validXml
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function twimlResponse(reply: string | null, statusCallbackUrl?: string): string {
  const declaration = '<?xml version="1.0" encoding="UTF-8"?>';
  if (!reply) return `${declaration}<Response></Response>`;
  const callbackAttributes = statusCallbackUrl
    ? ` action="${escapeXml(statusCallbackUrl)}" statusCallback="${escapeXml(
        statusCallbackUrl,
      )}" method="POST"`
    : "";
  return `${declaration}<Response><Message${callbackAttributes}><Body>${escapeXml(
    reply,
  )}</Body></Message></Response>`;
}

const shortText = z.string().trim().min(1).max(200);
const stringList = z.array(shortText).max(20);
const draftSchema = z
  .object({
    identity: z
      .object({
        workingTitle: shortText.optional(),
        occasion: z.string().trim().min(1).max(64).optional(),
        holidayPackId: z.string().trim().min(1).max(64).optional(),
        tone: shortText.optional(),
        honoreeAge: z.number().int().min(0).max(120).optional(),
      })
      .strict()
      .optional(),
    when: z
      .object({
        date: z.string().trim().min(1).max(40).optional(),
        startTime: z.string().trim().min(1).max(40).optional(),
        dateCertainty: z.enum(["fixed", "window", "tbd"]).optional(),
        anchors: z
          .array(
            z
              .object({
                label: shortText,
                at: z.string().trim().min(1).max(80),
                kind: z.string().trim().min(1).max(64).optional(),
              })
              .strict(),
          )
          .max(20)
          .optional(),
      })
      .strict()
      .optional(),
    where: z
      .object({
        display: shortText.optional(),
        venueKind: z.enum(["home", "backyard", "park", "venue", "virtual", "unknown"]).optional(),
        contingency: z
          .object({
            needed: z.boolean(),
            kind: z.string().trim().min(1).max(64).optional(),
            plan: shortText.optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    people: z
      .object({
        expectedCount: z.number().int().min(0).max(10_000).optional(),
        households: z.number().int().min(0).max(10_000).optional(),
        kids: z.number().int().min(0).max(10_000).optional(),
        adults: z.number().int().min(0).max(10_000).optional(),
      })
      .strict()
      .optional(),
    effort: z
      .object({
        level: z.enum(["low", "medium", "high"]).optional(),
        hostReadyTarget: z.string().trim().min(1).max(80).optional(),
      })
      .strict()
      .optional(),
    budget: z
      .object({
        total: z.number().min(0).max(100_000_000).optional(),
        stance: z.enum(["strict", "flexible", "no-limit"]).optional(),
      })
      .strict()
      .optional(),
    food: z
      .object({
        approach: shortText.optional(),
        peakMoment: shortText.optional(),
        portionModel: z.enum(["per-guest", "per-adult+kid", "family-style", "unknown"]).optional(),
      })
      .strict()
      .optional(),
    constraints: z
      .object({
        dietary: stringList.optional(),
        accessibility: stringList.optional(),
        observance: stringList.optional(),
        allergies: stringList.optional(),
      })
      .strict()
      .optional(),
    contributions: z
      .object({
        mode: z.enum(["none", "open-signup", "assigned", "potluck-list"]).optional(),
        seeds: z
          .array(
            z
              .object({
                label: shortText,
                qty: z.number().min(0).max(10_000).optional(),
                category: z.string().trim().min(1).max(64).optional(),
              })
              .strict(),
          )
          .max(20)
          .optional(),
      })
      .strict()
      .optional(),
    vibe: z
      .object({
        activities: stringList.optional(),
        creativeDirection: z
          .object({
            palette: stringList.optional(),
            vibe: shortText.optional(),
          })
          .strict()
          .optional(),
        broadcast: z
          .object({
            source: z.enum(["tv", "stream", "none"]).optional(),
            channel: shortText.optional(),
            needsSoundCheck: z.boolean().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    rituals: z
      .array(
        z
          .object({
            label: shortText,
            instruction: shortText.optional(),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    hostNote: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

const planningStateSchema = z
  .object({
    status: z.enum(["active", "stopped"]),
    draft: draftSchema,
    turnCount: z.number().int().min(0).max(10_000),
  })
  .strict();

export function parseSmsPlanningState(value: unknown): SmsPlanningState | null {
  const parsed = planningStateSchema.safeParse(value);
  if (!parsed.success) return null;
  let serialized: string;
  try {
    serialized = JSON.stringify(parsed.data.draft);
  } catch {
    return null;
  }
  if (utf8(serialized).byteLength > 16_384) return null;
  return parsed.data as SmsPlanningState;
}

export function isHexDigest(value: string): boolean {
  return HEX_DIGEST.test(value);
}
