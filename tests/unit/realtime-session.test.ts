import { describe, expect, it } from "vitest";
import {
  REALTIME_CLIENT_SECRETS_URL,
  REALTIME_MODEL,
  REALTIME_VOICE,
  buildRealtimeSessionBody,
  computeSafetyIdentifier,
  newCorrelationId,
  parseClientSecretResponse,
} from "@/lib/realtime-session";

const SALT = "test-salt-value-strong-enough";

describe("realtime-session contract", () => {
  it("targets the current client_secrets endpoint (not the deprecated one)", () => {
    expect(REALTIME_CLIENT_SECRETS_URL).toBe("https://api.openai.com/v1/realtime/client_secrets");
    expect(REALTIME_CLIENT_SECRETS_URL).not.toContain("/v1/realtime/sessions");
  });

  it("uses gpt-realtime-2.1 and a supported voice", () => {
    expect(REALTIME_MODEL).toBe("gpt-realtime-2.1");
    expect(REALTIME_MODEL).not.toMatch(/gpt-4o-realtime-preview/);
    expect(REALTIME_VOICE).toBe("marin");
  });

  it("builds a nested Realtime session body with the required discriminator", () => {
    const body = buildRealtimeSessionBody({ instructions: "hi" });
    expect(body.session.type).toBe("realtime");
    expect(body.session.model).toBe(REALTIME_MODEL);
    expect(body.session.instructions).toBe("hi");
    expect(body.session.audio.output.voice).toBe(REALTIME_VOICE);
    expect(body.session.audio.input.turn_detection.type).toBe("server_vad");
    expect(body.session.audio.input.transcription.model).not.toBe("whisper-1");
  });

  it("does not put OpenAI-Beta or deprecated fields anywhere in the body", () => {
    const serialized = JSON.stringify(buildRealtimeSessionBody({ instructions: "x" }));
    expect(serialized).not.toMatch(/OpenAI-Beta/i);
    expect(serialized).not.toMatch(/realtime=v1/i);
    expect(serialized).not.toMatch(/modalities/);
  });

  describe("computeSafetyIdentifier", () => {
    it("is stable for the same user id + salt", async () => {
      const a = await computeSafetyIdentifier("user-123", SALT);
      const b = await computeSafetyIdentifier("user-123", SALT);
      expect(a).toBe(b);
    });

    it("differs between users", async () => {
      const a = await computeSafetyIdentifier("user-a", SALT);
      const b = await computeSafetyIdentifier("user-b", SALT);
      expect(a).not.toBe(b);
    });

    it("differs between salts", async () => {
      const a = await computeSafetyIdentifier("user-a", "salt-one-long-enough");
      const b = await computeSafetyIdentifier("user-a", "salt-two-long-enough");
      expect(a).not.toBe(b);
    });

    it("never contains the raw user id or an email substring", async () => {
      const id = "alice@example.com";
      const out = await computeSafetyIdentifier(id, SALT);
      expect(out).not.toContain("alice");
      expect(out).not.toContain("@");
      expect(out).not.toContain(id);
      expect(out).toMatch(/^conf_[0-9a-f]{32}$/);
    });

    it("refuses to hash without a salt (fail closed, no unsalted digest)", async () => {
      await expect(computeSafetyIdentifier("u", "")).rejects.toThrow(/salt/i);
      await expect(computeSafetyIdentifier("u", "short")).rejects.toThrow(/salt/i);
      // @ts-expect-error explicit null must be rejected at runtime
      await expect(computeSafetyIdentifier("u", null)).rejects.toThrow(/salt/i);
    });
  });

  describe("newCorrelationId", () => {
    it("is prefixed and non-user-identifying", () => {
      const a = newCorrelationId();
      const b = newCorrelationId();
      expect(a).toMatch(/^req_[0-9a-f]{16}$/);
      expect(a).not.toBe(b);
    });
  });

  describe("parseClientSecretResponse", () => {
    const now = 1_000_000;
    it("accepts a well-formed, still-valid response", () => {
      const parsed = parseClientSecretResponse(
        {
          value: "ek_test",
          expires_at: now + 60,
          session: { id: "sess_1", model: "gpt-realtime-2.1" },
        },
        now,
      );
      expect(parsed?.value).toBe("ek_test");
      expect(parsed?.session?.model).toBe("gpt-realtime-2.1");
    });

    it("rejects null / wrong shape", () => {
      expect(parseClientSecretResponse(null, now)).toBeNull();
      expect(parseClientSecretResponse({ value: "x" }, now)).toBeNull();
      expect(parseClientSecretResponse({ expires_at: now + 60 }, now)).toBeNull();
    });

    it("rejects empty value", () => {
      expect(parseClientSecretResponse({ value: "", expires_at: now + 60 }, now)).toBeNull();
    });

    it("rejects non-finite / non-positive / past expires_at", () => {
      expect(parseClientSecretResponse({ value: "ek", expires_at: Number.NaN }, now)).toBeNull();
      expect(
        parseClientSecretResponse({ value: "ek", expires_at: Number.POSITIVE_INFINITY }, now),
      ).toBeNull();
      expect(parseClientSecretResponse({ value: "ek", expires_at: -1 }, now)).toBeNull();
      // Already past (or inside skew window):
      expect(parseClientSecretResponse({ value: "ek", expires_at: now }, now)).toBeNull();
      expect(parseClientSecretResponse({ value: "ek", expires_at: now + 1 }, now)).toBeNull();
    });
  });
});
