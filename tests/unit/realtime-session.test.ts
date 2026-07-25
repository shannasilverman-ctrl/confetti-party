import { describe, expect, it } from "vitest";
import {
  REALTIME_CLIENT_SECRETS_URL,
  REALTIME_MODEL,
  REALTIME_VOICE,
  buildRealtimeSessionBody,
  computeSafetyIdentifier,
  parseClientSecretResponse,
} from "@/lib/realtime-session";

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
    // Do not carry whisper-1 forward — must be a currently supported transcription model.
    expect(body.session.audio.input.transcription.model).not.toBe("whisper-1");
  });

  it("does not put OpenAI-Beta or deprecated fields anywhere in the body", () => {
    const serialized = JSON.stringify(buildRealtimeSessionBody({ instructions: "x" }));
    expect(serialized).not.toMatch(/OpenAI-Beta/i);
    expect(serialized).not.toMatch(/realtime=v1/i);
    expect(serialized).not.toMatch(/modalities/);
  });

  describe("computeSafetyIdentifier", () => {
    it("is stable for the same user id", async () => {
      const a = await computeSafetyIdentifier("user-123", "salt");
      const b = await computeSafetyIdentifier("user-123", "salt");
      expect(a).toBe(b);
    });

    it("differs between users", async () => {
      const a = await computeSafetyIdentifier("user-a", "salt");
      const b = await computeSafetyIdentifier("user-b", "salt");
      expect(a).not.toBe(b);
    });

    it("differs between salts", async () => {
      const a = await computeSafetyIdentifier("user-a", "s1");
      const b = await computeSafetyIdentifier("user-a", "s2");
      expect(a).not.toBe(b);
    });

    it("never contains the raw user id or an email substring", async () => {
      const id = "alice@example.com";
      const out = await computeSafetyIdentifier(id, null);
      expect(out).not.toContain("alice");
      expect(out).not.toContain("@");
      expect(out).not.toContain(id);
      expect(out).toMatch(/^conf_[0-9a-f]{32}$/);
    });
  });

  describe("parseClientSecretResponse", () => {
    it("accepts the current shape", () => {
      const parsed = parseClientSecretResponse({
        value: "ek_test",
        expires_at: 1234,
        session: { id: "sess_1", model: "gpt-realtime-2.1" },
      });
      expect(parsed?.value).toBe("ek_test");
      expect(parsed?.session?.model).toBe("gpt-realtime-2.1");
    });

    it("rejects malformed responses", () => {
      expect(parseClientSecretResponse(null)).toBeNull();
      expect(parseClientSecretResponse({ value: "x" })).toBeNull();
      expect(parseClientSecretResponse({ expires_at: 1 })).toBeNull();
    });
  });
});
