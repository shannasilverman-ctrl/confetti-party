import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  Square,
  Send,
  ArrowLeft,
  Loader2,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TalkClient, type TalkEvent, type TalkState } from "@/lib/talk-client";
import { endSession, createDraft } from "@/lib/talk.functions";
import { sendTurn, confirmDraft } from "@/lib/talk-brain.functions";
import { demoReply, DEMO_MAX_TURNS } from "@/lib/talk-demo";
import { celebrate } from "@/components/confetti-burst";


export const Route = createFileRoute("/talk")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Talk it out with Confetti" },
      {
        name: "description",
        content:
          "Tell Confetti about the gathering you're planning. It listens, asks the right questions, and turns your ideas into a real party plan.",
      },
      { property: "og:title", content: "Talk it out with Confetti" },
      {
        property: "og:description",
        content:
          "A warm, focused conversation that turns 'I want to host a...' into a real, coordinated party plan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TalkRoute,
});

type ChatMsg = { role: "user" | "assistant"; content: string };
type Line = { role: "user" | "assistant"; text: string; partial: boolean };

function TalkRoute() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"text" | "voice">("text");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content:
        "Hi — I'm Confetti. Tell me the brain dump: what are you hoping to host, and how do you want it to feel?",
    },
  ]);
  const [typed, setTyped] = useState("");
  const [thinking, setThinking] = useState(false);
  const [openQs, setOpenQs] = useState<string[]>([]);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [readyToConfirm, setReadyToConfirm] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Browser dictation (Web Speech API). Not a realtime AI voice call — it
  // transcribes what the user says into the text box, then the normal text
  // brain replies. Availability is browser-specific (Chrome/Edge/Safari).
  const [dictating, setDictating] = useState(false);
  type SpeechRecognitionLike = {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    onresult:
      | ((e: {
          resultIndex: number;
          results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
        }) => void)
      | null;
    onerror: ((e: { error?: string }) => void) | null;
    onend: (() => void) | null;
    start: () => void;
    stop: () => void;
  };
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const stopDictation = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* noop */
    }
    setDictating(false);
  }, []);

  const startDictation = useCallback(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      toast.error("Voice input isn't supported in this browser. Type instead.");
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      setTyped((prev) => {
        const base = prev.replace(/\s*\[…[^\]]*\]\s*$/, "");
        const combined = (finalText + (interim ? ` [… ${interim}]` : "")).trim();
        return base ? `${base} ${combined}` : combined;
      });
    };
    rec.onerror = () => setDictating(false);
    rec.onend = () => {
      setDictating(false);
      setTyped((prev) => prev.replace(/\s*\[…[^\]]*\]\s*$/, "").trim());
    };
    recognitionRef.current = rec;
    setDictating(true);
    try {
      rec.start();
    } catch {
      setDictating(false);
    }
  }, []);

  // Voice-mode state (kept intact)
  const [state, setState] = useState<TalkState>("idle");
  const [muted, setMuted] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceLines, setVoiceLines] = useState<Line[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const clientRef = useRef<TalkClient | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const authReady = !loading;
  const isDemo = authReady && !user;
  const [demoTurn, setDemoTurn] = useState(0);
  const demoLimitReached = isDemo && demoTurn >= DEMO_MAX_TURNS;

  // Create a draft on first mount for signed-in users only.
  useEffect(() => {
    if (!authReady || !user || draftId) return;
    createDraft()
      .then((r) => setDraftId(r.id))
      .catch(() => toast.error("Couldn't start a fresh draft. Please retry."));
  }, [authReady, user, draftId]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  const sendMessage = useCallback(async () => {
    const text = typed.trim();
    if (!text || thinking) return;
    if (isDemo && demoLimitReached) return;
    if (!isDemo && !draftId) return;
    const next: ChatMsg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setTyped("");
    setThinking(true);
    try {
      if (isDemo) {
        // Bounded local demo — no network, no persistence.
        await new Promise((r) => setTimeout(r, 500));
        const d = demoReply(demoTurn);
        setMessages((prev) => [...prev, { role: "assistant", content: d.reply }]);
        setOpenQs(d.openQuestions);
        setAssumptions(d.assumptions);
        setDemoTurn((n) => n + 1);
        if (d.complete) setReadyToConfirm(true);
      } else {
        const res = await sendTurn({ data: { draftId: draftId!, messages: next } });
        setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
        setOpenQs(res.openQuestions ?? []);
        setAssumptions(res.assumptions ?? []);
        if (/review the plan|confirm/i.test(res.reply)) setReadyToConfirm(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      toast.error(msg);
    } finally {
      setThinking(false);
    }
  }, [typed, thinking, draftId, messages, isDemo, demoLimitReached, demoTurn]);


  const confirmAndCreate = useCallback(async () => {
    if (!draftId) return;
    setConfirming(true);
    try {
      const { partyId } = await confirmDraft({ data: { draftId } });
      celebrate("big");
      toast.success("Plan created — welcome to your workspace.");
      navigate({ to: "/party/$id/reveal", params: { id: partyId } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't finalize the plan.";
      toast.error(msg);
    } finally {
      setConfirming(false);
    }
  }, [draftId, navigate]);

  // ---------- Voice-mode handlers (unchanged behavior) ----------

  const handleVoiceEvent = useCallback((evt: TalkEvent) => {
    switch (evt.type) {
      case "state":
        setState(evt.state);
        break;
      case "error":
        setVoiceError(evt.message);
        toast.error(evt.message);
        break;
      case "assistant_transcript_delta":
        setVoiceLines((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.partial) {
            return [...prev.slice(0, -1), { ...last, text: last.text + evt.text }];
          }
          return [...prev, { role: "assistant", text: evt.text, partial: true }];
        });
        break;
      case "assistant_transcript_done":
        setVoiceLines((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.partial) {
            return [...prev.slice(0, -1), { role: "assistant", text: evt.text, partial: false }];
          }
          return [...prev, { role: "assistant", text: evt.text, partial: false }];
        });
        break;
      case "user_transcript_delta":
        setVoiceLines((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "user" && last.partial) {
            return [...prev.slice(0, -1), { ...last, text: last.text + evt.text }];
          }
          return [...prev, { role: "user", text: evt.text, partial: true }];
        });
        break;
      case "user_transcript_done":
        setVoiceLines((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "user" && last.partial) {
            return [...prev.slice(0, -1), { role: "user", text: evt.text, partial: false }];
          }
          return [...prev, { role: "user", text: evt.text, partial: false }];
        });
        break;
      case "closed":
        break;
    }
  }, []);

  const startVoice = useCallback(async () => {
    setVoiceError(null);
    setConnecting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        toast.error("Please sign in to talk with Confetti.");
        navigate({ to: "/auth" });
        return;
      }
      const res = await fetch("/api/realtime/session", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg =
          (body as { message?: string })?.message ??
          `Voice unavailable (${res.status}). Use text mode.`;
        setVoiceError(msg);
        toast.error(msg);
        setConnecting(false);
        return;
      }
      const { clientSecret, model, sessionId } = (await res.json()) as {
        clientSecret: string;
        model: string;
        sessionId: string | null;
      };
      if (!audioRef.current) {
        audioRef.current = new Audio();
        audioRef.current.autoplay = true;
      }
      const client = new TalkClient({
        clientSecret,
        model,
        audioEl: audioRef.current,
        onEvent: handleVoiceEvent,
      });
      clientRef.current = client;
      setSessionId(sessionId);
      startedAtRef.current = Date.now();
      await client.connect();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setVoiceError(msg);
      toast.error(msg);
    } finally {
      setConnecting(false);
    }
  }, [handleVoiceEvent, navigate]);

  const stopVoice = useCallback(async () => {
    clientRef.current?.close("user_ended");
    clientRef.current = null;
    if (sessionId) {
      const startedAt = startedAtRef.current;
      const durationS = startedAt ? Math.round((Date.now() - startedAt) / 1000) : undefined;
      try {
        await endSession({ data: { sessionId, durationS, disconnectReason: "user_ended" } });
      } catch (err) {
        console.error("endSession failed", err);
      }
    }
    setSessionId(null);
    startedAtRef.current = null;
  }, [sessionId]);

  useEffect(
    () => () => {
      clientRef.current?.close("route_unmount");
      clientRef.current = null;
    },
    [],
  );

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      clientRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const orbState = useMemo(() => {
    if (state === "speaking") return "speaking" as const;
    if (state === "listening") return "listening" as const;
    if (state === "connecting" || connecting) return "connecting" as const;
    return "idle" as const;
  }, [state, connecting]);

  const isLive = state === "listening" || state === "speaking";

  return (
    <div className="min-h-screen bg-background">
      <div
        className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 pt-4 md:pt-8"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <header className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: "/app" })}
            className="gap-1 min-h-11"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div className="hidden text-xs font-medium uppercase tracking-wider text-muted-foreground sm:block">
            Talk it out
          </div>
          <div
            className="inline-flex overflow-hidden rounded-lg border border-border text-xs"
            role="tablist"
            aria-label="Talk mode"
          >
            <button
              role="tab"
              aria-selected={mode === "text"}
              onClick={() => setMode("text")}
              className={cn(
                "min-h-9 px-3 py-1",
                mode === "text" ? "bg-primary text-primary-foreground" : "bg-background",
              )}
            >
              Text
            </button>
            <button
              role="tab"
              aria-selected={mode === "voice"}
              onClick={() => setMode("voice")}
              className={cn(
                "min-h-9 px-3 py-1",
                mode === "voice" ? "bg-primary text-primary-foreground" : "bg-background",
              )}
            >
              Voice
            </button>
          </div>
        </header>

        {mode === "text" ? (
          <main className="mt-6 grid flex-1 gap-6 md:mt-10 md:grid-cols-[1fr_320px]">
            <section className="flex flex-col">
              {isDemo && (
                <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-primary/5 px-4 py-2.5 text-xs text-secondary">
                  <Badge variant="secondary" className="uppercase tracking-wide">
                    Demo
                  </Badge>
                  <span className="min-w-0 flex-1">
                    You're chatting with a preview brain — {DEMO_MAX_TURNS} turns, no account
                    needed. Sign up free to save the plan and unlock voice.
                  </span>
                  <Button asChild size="sm" variant="festive">
                    <a href="/auth?mode=signup">Sign up free</a>
                  </Button>
                </div>
              )}
              <Card className="flex h-[520px] flex-col md:h-[600px]">
                <div className="border-b px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Conversation
                </div>

                <div
                  ref={chatScrollRef}
                  className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
                  aria-live="polite"
                >
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      className={cn(
                        "rounded-2xl px-3 py-2 text-sm",
                        m.role === "assistant"
                          ? "bg-muted text-foreground"
                          : "ml-auto max-w-[85%] bg-primary/10 text-foreground",
                      )}
                    >
                      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {m.role === "assistant" ? "Confetti" : "You"}
                      </div>
                      {m.content}
                    </div>
                  ))}
                  {thinking && (
                    <div className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
                    </div>
                  )}
                </div>
                <div className="border-t p-3">
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={typed}
                      onChange={(e) => setTyped(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      placeholder="Tell Confetti the brain dump…"
                      rows={2}
                      className="min-h-[52px] resize-none"
                      disabled={!draftId || thinking}
                    />
                    <Button
                      onClick={sendMessage}
                      disabled={!draftId || thinking || !typed.trim()}
                      size="icon"
                      variant="secondary"
                      aria-label="Send message"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                    {speechSupported && (
                      <Button
                        type="button"
                        onClick={dictating ? stopDictation : startDictation}
                        size="icon"
                        variant={dictating ? "festive" : "outline"}
                        aria-label={dictating ? "Stop dictation" : "Start dictation"}
                        title={dictating ? "Stop dictation" : "Dictate (browser voice input)"}
                        disabled={!draftId || thinking}
                      >
                        {dictating ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>
                  {dictating && (
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      Listening… speak, then tap the mic again to stop.
                    </div>
                  )}
                </div>
              </Card>
              <p className="mt-2 text-xs text-muted-foreground">
                Nothing is sent, purchased, or booked without your confirmation.
              </p>
            </section>

            <aside className="space-y-3">
              <Card className="p-4">
                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" /> What I'm hearing
                </div>
                {assumptions.length === 0 && openQs.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    I'll surface assumptions and open questions here as we talk.
                  </p>
                ) : (
                  <div className="mt-2 space-y-3">
                    {assumptions.length > 0 && (
                      <div>
                        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Assumptions
                        </div>
                        <ul className="space-y-1">
                          {assumptions.map((a, i) => (
                            <li key={i}>
                              <Badge variant="secondary" className="whitespace-normal text-left">
                                {a}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {openQs.length > 0 && (
                      <div>
                        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Open questions
                        </div>
                        <ul className="space-y-1 text-sm text-foreground">
                          {openQs.map((q, i) => (
                            <li key={i} className="rounded-lg bg-muted/40 px-2.5 py-1.5">
                              {q}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </Card>
              <Button
                variant="festive"
                size="lg"
                className="w-full"
                onClick={confirmAndCreate}
                disabled={!draftId || confirming || (!readyToConfirm && messages.length < 4)}
              >
                {confirming ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Create the plan
                  </>
                )}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Turns your conversation into a real workspace: tasks, budget, guests, bring board.
              </p>
            </aside>
          </main>
        ) : (
          <main className="mt-6 flex flex-1 flex-col items-center gap-6 md:mt-10">
            <VoiceOrb state={orbState} />
            <StatusLine state={state} connecting={connecting} error={voiceError} />
            {!isLive && !connecting && (
              <div className="w-full max-w-md space-y-4">
                <Card className="border-dashed p-5">
                  <h2 className="text-base font-semibold text-foreground">Voice mode (beta)</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Speech-to-speech uses OpenAI Realtime and requires an OPENAI_API_KEY on your
                    project. Text mode always works.
                  </p>
                </Card>
                <Button
                  variant="festive"
                  size="lg"
                  className="w-full"
                  onClick={startVoice}
                  disabled={connecting || !authReady}
                >
                  <Mic className="mr-2 h-5 w-5" /> Start voice session
                </Button>
              </div>
            )}
            {(isLive || connecting) && (
              <div className="flex w-full max-w-md items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={toggleMute}
                  aria-pressed={muted}
                  className="gap-2"
                >
                  {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}{" "}
                  {muted ? "Unmute" : "Mute"}
                </Button>
                <Button variant="destructive" size="lg" onClick={stopVoice} className="gap-2">
                  <Square className="h-4 w-4" /> End session
                </Button>
              </div>
            )}
            {voiceLines.length > 0 && (
              <Card className="w-full max-w-2xl p-4">
                <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Live transcript
                </div>
                <div className="space-y-2">
                  {voiceLines.map((l, i) => (
                    <div
                      key={i}
                      className={cn(
                        "rounded-xl px-3 py-2 text-sm",
                        l.role === "assistant" ? "bg-muted" : "ml-auto max-w-[85%] bg-primary/10",
                        l.partial && "opacity-70",
                      )}
                    >
                      {l.text || (l.partial ? "…" : "")}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </main>
        )}
      </div>
    </div>
  );
}

function StatusLine({
  state,
  connecting,
  error,
}: {
  state: TalkState;
  connecting: boolean;
  error: string | null;
}) {
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (connecting || state === "connecting")
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Connecting…
      </p>
    );
  if (state === "listening")
    return (
      <p className="flex items-center gap-2 text-sm text-foreground" aria-live="assertive">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75 motion-reduce:hidden" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
        </span>
        Listening
      </p>
    );
  if (state === "speaking") return <p className="text-sm text-foreground">Confetti is speaking…</p>;
  if (state === "closed") return <p className="text-sm text-muted-foreground">Session ended.</p>;
  return <p className="text-sm text-muted-foreground">Ready when you are.</p>;
}

function VoiceOrb({ state }: { state: "idle" | "connecting" | "listening" | "speaking" }) {
  return (
    <div className="relative flex h-40 w-40 items-center justify-center md:h-56 md:w-56">
      <div
        className={cn(
          "absolute inset-0 rounded-full transition-all duration-500",
          state === "idle" && "bg-gradient-to-br from-primary/20 to-secondary/20",
          state === "connecting" && "bg-gradient-to-br from-primary/30 to-secondary/30",
          state === "listening" &&
            "bg-gradient-to-br from-primary/40 to-secondary/40 shadow-[0_0_60px_-10px_hsl(var(--primary)/0.5)]",
          state === "speaking" &&
            "bg-gradient-to-br from-primary/60 to-secondary/60 shadow-[0_0_80px_-10px_hsl(var(--primary)/0.7)]",
        )}
      />
      <div
        className={cn(
          "absolute inset-4 rounded-full bg-background/60 backdrop-blur-sm transition-transform duration-500",
          state === "speaking" && "scale-95 motion-reduce:scale-100",
          state === "listening" && "scale-100",
        )}
      />
      <div
        className={cn(
          "absolute inset-8 rounded-full bg-gradient-to-br from-primary to-secondary opacity-90",
          state === "listening" && "animate-pulse motion-reduce:animate-none",
        )}
      />
    </div>
  );
}
