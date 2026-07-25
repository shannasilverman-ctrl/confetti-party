import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { TalkClient } from "@/lib/talk-client";

// Minimal fakes for the WebRTC APIs the client touches. We are not testing
// the browser stack — just that TalkClient hits the right URL/headers and
// parses realtime events into our TalkEvent shape.

class FakeDataChannel {
  readyState = "open";
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.onclose?.();
  }
  emit(data: unknown) {
    this.onmessage?.({ data });
  }
}

class FakePC {
  ontrack: ((e: { streams: MediaStream[] }) => void) | null = null;
  dc = new FakeDataChannel();
  addTrack = vi.fn();
  createDataChannel = vi.fn(() => this.dc);
  createOffer = vi.fn(async () => ({ type: "offer", sdp: "OFFER_SDP" }));
  setLocalDescription = vi.fn(async () => {});
  setRemoteDescription = vi.fn(async () => {});
  close = vi.fn();
}

const originalFetch = global.fetch;
const originalRTC = (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection;

beforeEach(() => {
  (
    globalThis as unknown as { RTCPeerConnection: new () => FakePC }
  ).RTCPeerConnection = FakePC;
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getAudioTracks: () => [{ enabled: true }],
        getTracks: () => [],
      })),
    },
  });
});

afterEach(() => {
  global.fetch = originalFetch;
  (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection = originalRTC;
  vi.restoreAllMocks();
});

describe("TalkClient handshake", () => {
  it("posts SDP to /v1/realtime without the deprecated OpenAI-Beta header", async () => {
    const fetchMock = vi.fn(
      async () => new Response("ANSWER_SDP", { status: 200 }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const audioEl = { srcObject: null } as unknown as HTMLAudioElement;
    const events: string[] = [];
    const client = new TalkClient({
      clientSecret: "ek_test",
      model: "gpt-realtime-2.1",
      audioEl,
      onEvent: (e) => events.push(e.type),
    });

    await client.connect();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("https://api.openai.com/v1/realtime?model=gpt-realtime-2.1");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer ek_test");
    expect(headers.get("Content-Type")).toBe("application/sdp");
    expect(headers.get("OpenAI-Beta")).toBeNull();
    expect(init.body).toBe("OFFER_SDP");
  });

  it("parses assistant and user transcript events into TalkEvents", async () => {
    global.fetch = vi.fn(
      async () => new Response("ANSWER_SDP", { status: 200 }),
    ) as unknown as typeof fetch;

    const events: Array<{ type: string; text?: string }> = [];
    const client = new TalkClient({
      clientSecret: "ek",
      model: "gpt-realtime-2.1",
      audioEl: { srcObject: null } as unknown as HTMLAudioElement,
      onEvent: (e) => events.push(e as { type: string; text?: string }),
    });
    await client.connect();

    // Reach in to the created data channel via the fake PC we installed.
    const pc = (client as unknown as { pc: FakePC }).pc;
    pc.dc.emit(
      JSON.stringify({ type: "response.audio_transcript.delta", delta: "hel" }),
    );
    pc.dc.emit(
      JSON.stringify({
        type: "conversation.item.input_audio_transcription.completed",
        transcript: "hi there",
      }),
    );

    const types = events.map((e) => e.type);
    expect(types).toContain("assistant_transcript_delta");
    expect(types).toContain("user_transcript_done");
    expect(events.find((e) => e.type === "user_transcript_done")?.text).toBe(
      "hi there",
    );
  });
});
