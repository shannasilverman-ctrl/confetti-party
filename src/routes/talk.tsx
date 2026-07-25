import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Square, Send, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { TalkClient, type TalkEvent, type TalkState } from "@/lib/talk-client";
import { endSession } from "@/lib/talk.functions";

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
          "A warm, focused voice conversation that turns 'I want to host a...' into a real, coordinated party plan.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TalkRoute,
});

type Line = { role: "user" | "assistant"; text: string; partial: boolean };

function TalkRoute() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [state, setState] = useState<TalkState>("idle");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [typed, setTyped] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const clientRef = useRef<TalkClient | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);

  const authReady = !loading;

  useEffect(() => {
    if (!authReady) return;
    if (!user) navigate({ to: "/auth" });
  }, [authReady, user, navigate]);

  // Auto-scroll transcript
  useEffect(() => {
    const el = transcriptScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const handleEvent = useCallback((evt: TalkEvent) => {
    switch (evt.type) {
      case "state":
        setState(evt.state);
        break;
      case "error":
        setError(evt.message);
        toast.error(evt.message);
        break;
      case "assistant_transcript_delta":
        setLines((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.partial) {
            return [...prev.slice(0, -1), { ...last, text: last.text + evt.text }];
          }
          return [...prev, { role: "assistant", text: evt.text, partial: true }];
        });
        break;
      case "assistant_transcript_done":
        setLines((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.partial) {
            return [...prev.slice(0, -1), { role: "assistant", text: evt.text, partial: false }];
          }
          return [...prev, { role: "assistant", text: evt.text, partial: false }];
        });
        break;
      case "user_transcript_delta":
        setLines((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "user" && last.partial) {
            return [...prev.slice(0, -1), { ...last, text: last.text + evt.text }];
          }
          return [...prev, { role: "user", text: evt.text, partial: true }];
        });
        break;
      case "user_transcript_done":
        setLines((prev) => {
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

  const start = useCallback(async () => {
    setError(null);
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
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body?.message ?? `Couldn't start the voice session (${res.status}).`;
        setError(msg);
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
        onEvent: handleEvent,
      });
      clientRef.current = client;
      setSessionId(sessionId);
      startedAtRef.current = Date.now();
      await client.connect();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setConnecting(false);
    }
  }, [handleEvent, navigate]);

  const stop = useCallback(async () => {
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

  useEffect(() => {
    return () => {
      clientRef.current?.close("route_unmount");
      clientRef.current = null;
    };
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      clientRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const sendTyped = useCallback(() => {
    const t = typed.trim();
    if (!t || !clientRef.current) return;
    clientRef.current.sendText(t);
    setLines((prev) => [...prev, { role: "user", text: t, partial: false }]);
    setTyped("");
  }, [typed]);

  const orbState = useMemo(() => {
    if (state === "speaking") return "speaking";
    if (state === "listening") return "listening";
    if (state === "connecting" || connecting) return "connecting";
    return "idle";
  }, [state, connecting]);

  const isLive = state === "listening" || state === "speaking";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 pb-24 pt-4 md:pt-8">
        <header className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: "/app" })}
            className="gap-1"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Talk it out
          </div>
          <div className="w-16" />
        </header>

        <main className="mt-6 flex flex-1 flex-col gap-6 md:mt-10 md:flex-row md:gap-8">
          {/* Left: orb + controls */}
          <section className="flex flex-1 flex-col items-center gap-6">
            <VoiceOrb state={orbState} />
            <StatusLine state={state} connecting={connecting} error={error} />

            {!isLive && !connecting && (
              <div className="w-full max-w-md space-y-4">
                <Card className="border-dashed p-5">
                  <h2 className="text-base font-semibold text-foreground">
                    Tell Confetti about the gathering
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Tap the mic and start with the dream — what you're gathering for and how you
                    want it to feel. Confetti listens only after you tap and stops when you tap
                    End. V1 is not always listening.
                  </p>
                </Card>
                <Button
                  variant="festive"
                  size="lg"
                  className="w-full"
                  onClick={start}
                  disabled={connecting || !authReady}
                >
                  <Mic className="mr-2 h-5 w-5" />
                  Start talking
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
                  {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  {muted ? "Unmute" : "Mute"}
                </Button>
                <Button variant="destructive" size="lg" onClick={stop} className="gap-2">
                  <Square className="h-4 w-4" />
                  End session
                </Button>
              </div>
            )}
          </section>

          {/* Right: transcript */}
          <section className="flex flex-1 flex-col">
            <Card className="flex h-[420px] flex-col md:h-[540px]">
              <div className="border-b px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Live transcript
              </div>
              <div
                ref={transcriptScrollRef}
                className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
                aria-live="polite"
              >
                {lines.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Your conversation will appear here as it happens.
                  </p>
                ) : (
                  lines.map((l, i) => (
                    <div
                      key={i}
                      className={cn(
                        "rounded-2xl px-3 py-2 text-sm",
                        l.role === "assistant"
                          ? "bg-muted text-foreground"
                          : "ml-auto max-w-[85%] bg-primary/10 text-foreground",
                        l.partial && "opacity-70",
                      )}
                    >
                      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {l.role === "assistant" ? "Confetti" : "You"}
                      </div>
                      {l.text || (l.partial ? "…" : "")}
                    </div>
                  ))
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
                        sendTyped();
                      }
                    }}
                    placeholder={
                      isLive ? "Or type instead of speaking…" : "Start a session to chat."
                    }
                    disabled={!isLive}
                    rows={2}
                    className="min-h-[52px] resize-none"
                  />
                  <Button
                    onClick={sendTyped}
                    disabled={!isLive || !typed.trim()}
                    size="icon"
                    variant="secondary"
                    aria-label="Send message"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
            <p className="mt-3 text-xs text-muted-foreground">
              V1: not always listening · nothing is sent, purchased, or booked without your tap ·
              tap End to disconnect.
            </p>
          </section>
        </main>
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
  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (connecting || state === "connecting") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Connecting…
      </p>
    );
  }
  if (state === "listening") {
    return (
      <p className="flex items-center gap-2 text-sm text-foreground" aria-live="assertive">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75 motion-reduce:hidden" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
        </span>
        Listening
      </p>
    );
  }
  if (state === "speaking") {
    return <p className="text-sm text-foreground">Confetti is speaking…</p>;
  }
  if (state === "closed") {
    return <p className="text-sm text-muted-foreground">Session ended.</p>;
  }
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
      <span className="sr-only">
        {state === "listening"
          ? "Microphone is active"
          : state === "speaking"
            ? "Confetti is speaking"
            : state === "connecting"
              ? "Connecting"
              : "Idle"}
      </span>
    </div>
  );
}
