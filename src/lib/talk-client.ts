// Minimal WebRTC wrapper for OpenAI Realtime.
// Browser-only. Do not import from SSR loaders or module scope of route files
// that render server-side. Use inside useEffect / event handlers only.

export type TalkEvent =
  | { type: "state"; state: TalkState }
  | { type: "user_transcript_delta"; text: string }
  | { type: "user_transcript_done"; text: string }
  | { type: "assistant_transcript_delta"; text: string }
  | { type: "assistant_transcript_done"; text: string }
  | { type: "error"; message: string }
  | { type: "closed"; reason?: string };

export type TalkState = "idle" | "connecting" | "listening" | "speaking" | "closed" | "error";

export interface TalkClientOptions {
  clientSecret: string;
  model: string;
  audioEl: HTMLAudioElement;
  onEvent: (event: TalkEvent) => void;
}

export class TalkClient {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private state: TalkState = "idle";
  private didClose = false;
  private opts: TalkClientOptions;

  constructor(opts: TalkClientOptions) {
    this.opts = opts;
  }

  private setState(state: TalkState) {
    this.state = state;
    this.opts.onEvent({ type: "state", state });
  }

  async connect(): Promise<void> {
    this.setState("connecting");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      this.opts.onEvent({ type: "error", message: "Microphone permission was denied." });
      this.setState("error");
      this.finishClosed("microphone_denied", true);
      throw err;
    }

    try {
      const pc = new RTCPeerConnection();
      this.pc = pc;

      pc.ontrack = (e) => {
        const [remote] = e.streams;
        if (remote) this.opts.audioEl.srcObject = remote;
      };

      for (const track of this.stream.getAudioTracks()) {
        pc.addTrack(track, this.stream);
      }

      const dc = pc.createDataChannel("oai-events");
      this.dc = dc;
      dc.onopen = () => this.setState("listening");
      dc.onmessage = (msg) => this.handleEvent(msg.data);
      dc.onclose = () => this.finishClosed("transport_closed", false);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await fetch(
        `https://api.openai.com/v1/realtime?model=${encodeURIComponent(this.opts.model)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.opts.clientSecret}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        },
      );

      if (!res.ok) {
        // Drain the body so the connection releases, but never surface it —
        // SDP error bodies can include upstream identifiers we don't want in
        // the UI or client logs.
        await res.text().catch(() => "");
        this.opts.onEvent({
          type: "error",
          message: "Couldn't connect to the voice service. Please try again.",
        });
        this.setState("error");
        throw new Error("voice_connect_failed");
      }

      const answer = { type: "answer" as const, sdp: await res.text() };
      await pc.setRemoteDescription(answer);
    } catch (err) {
      // getUserMedia succeeded, so every failure after this point must
      // synchronously release the microphone, peer connection and audio
      // element. Callers also close defensively; finishClosed is idempotent.
      if (this.state !== "error") {
        this.opts.onEvent({
          type: "error",
          message: "Couldn't connect to the voice service. Please try again.",
        });
        this.setState("error");
      }
      this.finishClosed("connect_failed", true);
      throw err;
    }
  }

  private handleEvent(raw: unknown) {
    if (typeof raw !== "string") return;
    let evt: { type: string; [k: string]: unknown };
    try {
      evt = JSON.parse(raw);
    } catch {
      return;
    }
    switch (evt.type) {
      case "response.audio_transcript.delta":
        if (typeof evt.delta === "string") {
          this.opts.onEvent({ type: "assistant_transcript_delta", text: evt.delta });
          this.setState("speaking");
        }
        break;
      case "response.audio_transcript.done":
        if (typeof evt.transcript === "string") {
          this.opts.onEvent({ type: "assistant_transcript_done", text: evt.transcript });
        }
        this.setState("listening");
        break;
      case "conversation.item.input_audio_transcription.delta":
        if (typeof evt.delta === "string") {
          this.opts.onEvent({ type: "user_transcript_delta", text: evt.delta });
        }
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (typeof evt.transcript === "string") {
          this.opts.onEvent({ type: "user_transcript_done", text: evt.transcript });
        }
        break;
      case "input_audio_buffer.speech_started":
        this.setState("listening");
        break;
      case "error": {
        // Do not surface raw provider error text to users — it can contain
        // upstream identifiers. Emit a stable sanitized message.
        this.opts.onEvent({
          type: "error",
          message: "The voice service hit a snag. Try ending and reconnecting.",
        });
        break;
      }
    }
  }

  sendText(text: string) {
    if (!this.dc || this.dc.readyState !== "open") return;
    this.dc.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }],
        },
      }),
    );
    this.dc.send(JSON.stringify({ type: "response.create" }));
  }

  setMuted(muted: boolean) {
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }

  private finishClosed(reason: string | undefined, closeDataChannel: boolean) {
    if (this.didClose) return;
    this.didClose = true;

    const dc = this.dc;
    this.dc = null;
    if (dc && closeDataChannel) {
      // Prevent the synchronous fake/browser onclose callback from emitting
      // a second closed event while this explicit close is in progress.
      dc.onclose = null;
      try {
        dc.close();
      } catch {
        /* noop */
      }
    }

    try {
      this.pc?.close();
    } catch {
      /* noop */
    }
    this.pc = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.opts.audioEl.srcObject = null;
    this.setState("closed");
    this.opts.onEvent({ type: "closed", reason });
  }

  close(reason?: string) {
    this.finishClosed(reason, true);
  }

  getState(): TalkState {
    return this.state;
  }
}
