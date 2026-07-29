import { describe, expect, it } from "vitest";
import {
  collectTwilioParams,
  decryptSmsValue,
  encryptSmsValue,
  keyedDigestHex,
  normalizeE164,
  parseSmsPlanningState,
  readBoundedUtf8Body,
  twimlResponse,
  validateSmsEncryptionKey,
  validateSmsHmacKey,
} from "@/lib/sms-transport";

const KEY = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, index) => index + 1)));
const OTHER_KEY = btoa(
  String.fromCharCode(...Array.from({ length: 32 }, (_, index) => 255 - index)),
);
const SECRET = btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, index) => index + 33)));

describe("SMS transport primitives", () => {
  it.each([
    ["+12125550123", "+12125550123"],
    [" +442071838750 ", "+442071838750"],
    ["12125550123", null],
    ["+0123456789", null],
    ["+1234567", null],
    ["+1234567890123456", null],
    ["+1 (212) 555-0123", null],
  ])("normalizes E.164 without guessing: %s", (input, expected) => {
    expect(normalizeE164(input)).toBe(expected);
  });

  it("preserves every signed form parameter, including repeated values", () => {
    const { params, form } = collectTwilioParams(
      "AccountSid=AC123&Tag=second&Body=hello+there&Tag=first&NumMedia=0",
    );

    expect(params).toEqual({
      AccountSid: "AC123",
      Tag: ["second", "first"],
      Body: "hello there",
      NumMedia: "0",
    });
    expect(form.getAll("Tag")).toEqual(["second", "first"]);
  });

  it("distinguishes invalid UTF-8 and stream failures from oversized bodies", async () => {
    const invalid = new Request("https://example.com", {
      method: "POST",
      body: new Uint8Array([0xff]),
    });
    await expect(readBoundedUtf8Body(invalid, 16)).resolves.toEqual({ status: "invalid" });

    const failedStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("socket failed"));
      },
    });
    const failed = new Request("https://example.com", {
      method: "POST",
      body: failedStream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    await expect(readBoundedUtf8Body(failed, 16)).resolves.toEqual({ status: "read_error" });

    const oversized = new Request("https://example.com", {
      method: "POST",
      body: "x".repeat(17),
    });
    await expect(readBoundedUtf8Body(oversized, 16)).resolves.toEqual({ status: "too_large" });
  });

  it("uses deterministic, purpose-separated keyed digests", async () => {
    const phoneA = await keyedDigestHex(SECRET, "phone", "+12125550123");
    const phoneB = await keyedDigestHex(SECRET, "phone", "+12125550123");
    const body = await keyedDigestHex(SECRET, "body", "+12125550123");
    const receipt = await keyedDigestHex(SECRET, "receipt", "+12125550123");

    expect(phoneA).toMatch(/^[0-9a-f]{64}$/);
    expect(phoneA).toBe(phoneB);
    expect(phoneA).not.toBe(body);
    expect(receipt).not.toBe(phoneA);
    expect(receipt).not.toBe(body);
    expect(phoneA).not.toContain("12125550123");
    await expect(keyedDigestHex("x".repeat(32), "phone", "x")).rejects.toThrow("invalid HMAC key");
  });

  it("validates an exact 256-bit encryption key", () => {
    expect(validateSmsEncryptionKey(KEY)).toBe(true);
    expect(validateSmsEncryptionKey(btoa("short"))).toBe(false);
    expect(validateSmsEncryptionKey("not base64***")).toBe(false);
  });

  it("requires HMAC keys to be base64-encoded random-byte material", () => {
    expect(validateSmsHmacKey(SECRET)).toBe(true);
    expect(validateSmsHmacKey("x".repeat(32))).toBe(false);
    expect(validateSmsHmacKey(btoa("short"))).toBe(false);
  });

  it("round-trips AES-GCM with random IVs and record-bound AAD", async () => {
    const context = "reply:phone-hash:SM123";
    const first = await encryptSmsValue("Confetti reply", KEY, context, "key-2026-07");
    const second = await encryptSmsValue("Confetti reply", KEY, context, "key-2026-07");

    expect(first).not.toBe(second);
    expect(first).toMatch(/^v1\.key-2026-07\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    await expect(decryptSmsValue(first, { "key-2026-07": KEY }, context)).resolves.toBe(
      "Confetti reply",
    );
    await expect(decryptSmsValue(first, { "key-2026-07": KEY }, "phone:other")).rejects.toThrow(
      "invalid ciphertext",
    );
    await expect(decryptSmsValue(first, { "key-2026-07": OTHER_KEY }, context)).rejects.toThrow(
      "invalid ciphertext",
    );
    await expect(
      decryptSmsValue(
        first.replace(/.$/, first.endsWith("A") ? "B" : "A"),
        { "key-2026-07": KEY },
        context,
      ),
    ).rejects.toThrow("invalid ciphertext");
  });

  it("supports key rotation by selecting the ciphertext key id", async () => {
    const oldCiphertext = await encryptSmsValue("old", OTHER_KEY, "phone:hash", "old-key");
    await expect(
      decryptSmsValue(oldCiphertext, { "old-key": OTHER_KEY, current: KEY }, "phone:hash"),
    ).resolves.toBe("old");
    await expect(decryptSmsValue(oldCiphertext, { current: KEY }, "phone:hash")).rejects.toThrow(
      "invalid ciphertext",
    );
  });

  it("escapes TwiML and strips invalid XML controls", () => {
    expect(twimlResponse(`A&B <party> "yes" 'ok'\u0000`)).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>A&amp;B &lt;party&gt; &quot;yes&quot; &apos;ok&apos;</Body></Message></Response>',
    );
    expect(twimlResponse(null)).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    expect(twimlResponse("Track me", "https://example.com/api/sms/status?receipt=a&tag=b")).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Message action="https://example.com/api/sms/status?receipt=a&amp;tag=b" statusCallback="https://example.com/api/sms/status?receipt=a&amp;tag=b" method="POST"><Body>Track me</Body></Message></Response>',
    );
  });

  it("accepts only a bounded, allowlisted SMS planning state", () => {
    expect(
      parseSmsPlanningState({
        status: "active",
        turnCount: 2,
        draft: {
          identity: { occasion: "birthday", honoreeAge: 54 },
          people: { expectedCount: 25 },
        },
      }),
    ).not.toBeNull();
    expect(
      parseSmsPlanningState({
        status: "active",
        turnCount: 2,
        draft: { identity: { occasion: "birthday", privateTranscript: "no" } },
      }),
    ).toBeNull();
    expect(
      parseSmsPlanningState({
        status: "active",
        turnCount: 10_001,
        draft: {},
      }),
    ).toBeNull();
    expect(
      parseSmsPlanningState({
        status: "active",
        turnCount: 1,
        draft: { hostNote: "x".repeat(501) },
      }),
    ).toBeNull();
  });
});
