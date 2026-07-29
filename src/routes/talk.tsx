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
import { sendTurn, confirmDraft, previewDraft } from "@/lib/talk-brain.functions";
import { demoReply, DEMO_MAX_TURNS } from "@/lib/talk-demo";
import { createTalkLifecycle } from "@/lib/talk-lifecycle";
import { celebrate } from "@/components/confetti-burst";
import { BrandLockup, BrandMark } from "@/components/brand";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { materializeDraft, type ReviewSummary } from "@/lib/talk-materialize";
import {
  newId,
  PLANNING_TASK_TITLES,
  useParties,
  type BringCategory,
  type Party,
  type Task,
} from "@/lib/party-context";

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

const STARTER_PROMPTS = [
  "A backyard birthday that feels easy",
  "Shabbat dinner this Friday",
  "Holiday dinner for the whole family",
  "A watch party at home",
] as const;

// Stable friendly copy. Raw caught error / provider messages must never
// reach the toast or DOM — they can leak upstream identifiers, stack
// frames, or user-controlled text. Internal category is logged, external
// copy is fixed per surface.
type TalkErrorCategory =
  | "draft_create"
  | "send_turn"
  | "confirm"
  | "voice_connect"
  | "voice_runtime";

const TALK_ERROR_COPY: Record<TalkErrorCategory, string> = {
  draft_create: "Couldn't start a fresh draft. Please retry.",
  send_turn: "Confetti couldn't reply just now. Try that again in a moment.",
  confirm: "Couldn't finalize the plan. Please try again.",
  voice_connect: "Couldn't connect to voice. Try again, or switch to text.",
  voice_runtime: "The voice service hit a snag. End and reconnect to continue.",
};

function friendlyTalkError(category: TalkErrorCategory, err: unknown): string {
  // Log the raw cause for developers; users only ever see the copy.

  console.debug("[talk]", category, err instanceof Error ? err.name : typeof err);
  return TALK_ERROR_COPY[category];
}

function TalkRoute() {
  const { user, loading } = useAuth();
  const { createParty, updateParty, status: partyStatus } = useParties();
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
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [review, setReview] = useState<ReviewSummary | null>(null);
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
  const clientRef = useRef<TalkClient | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // React state does not update synchronously. This ref closes the tiny
  // double-tap window before `connecting` disables the button, preventing
  // two server reservations and two microphone handshakes.
  const voiceStartInFlightRef = useRef(false);
  // Idempotent lifecycle controller: guarantees exactly-one end() per
  // owned reservation regardless of which signal fires (user stop,
  // connect failure, pagehide, SPA route unmount, duplicate events).
  const lifecycleRef = useRef<ReturnType<typeof createTalkLifecycle> | null>(null);
  if (!lifecycleRef.current) {
    lifecycleRef.current = createTalkLifecycle({
      endSession: (input) => endSession({ data: input }),
    });
  }

  const authReady = !loading;
  const isDemo = authReady && !user;
  const [demoTurn, setDemoTurn] = useState(0);
  const demoLimitReached = isDemo && demoTurn >= DEMO_MAX_TURNS;
  // Announcement region for screen readers: thinking, send/connect errors,
  // demo-limit reached, connection lifecycle.
  const [statusAnnouncement, setStatusAnnouncement] = useState("");

  // Create a draft on first mount for signed-in users only.
  // Belt-and-braces: never call the persistence mint on the signed-out
  // demo path. `isDemo` is also gated below in sendMessage/startVoice.
  useEffect(() => {
    if (!authReady || !user || isDemo || draftId) return;
    createDraft()
      .then((r) => setDraftId(r.id))
      .catch((err) => {
        const msg = friendlyTalkError("draft_create", err);
        toast.error(msg);
        setStatusAnnouncement(msg);
      });
  }, [authReady, user, isDemo, draftId]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  useEffect(() => {
    if (thinking) setStatusAnnouncement("Confetti is thinking.");
  }, [thinking]);

  useEffect(() => {
    if (demoLimitReached) {
      setStatusAnnouncement(
        "Demo turns used. Build the browser plan now, or sign up to keep planning across devices.",
      );
    }
  }, [demoLimitReached]);

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
        // Bounded local planner — input-aware, private to this browser, and
        // deterministic. No server or AI request occurs before signup.
        await new Promise((r) => setTimeout(r, 500));
        const d = demoReply(next);
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
      const msg = friendlyTalkError("send_turn", err);
      toast.error(msg);
      setStatusAnnouncement(msg);
    } finally {
      setThinking(false);
    }
  }, [typed, thinking, draftId, messages, isDemo, demoLimitReached]);

  const createDemoPlan = useCallback(() => {
    if (!isDemo || demoTurn === 0 || partyStatus !== "ready") return;
    const result = demoReply(messages);
    const { party, blockingUnknowns, optionalUnknowns } = materializeDraft(result.draftPatch);
    const missing = new Set([
      ...blockingUnknowns.map((unknown) => unknown.field),
      ...optionalUnknowns.map((unknown) => unknown.field),
    ]);
    const planningTasks: Task[] = [
      ...(missing.has("date")
        ? [
            {
              id: newId(),
              title: PLANNING_TASK_TITLES.date,
              bucket: "6+ weeks out" as const,
              done: false,
            },
          ]
        : []),
      ...(missing.has("guestEstimate")
        ? [
            {
              id: newId(),
              title: PLANNING_TASK_TITLES.guests,
              bucket: "6+ weeks out" as const,
              done: false,
            },
          ]
        : []),
      ...(missing.has("budget")
        ? [
            {
              id: newId(),
              title: PLANNING_TASK_TITLES.budget,
              bucket: "6+ weeks out" as const,
              done: false,
            },
          ]
        : []),
      ...(!party.theme
        ? [
            {
              id: newId(),
              title: PLANNING_TASK_TITLES.theme,
              bucket: "3-5 weeks" as const,
              done: false,
            },
          ]
        : []),
    ];
    const seenTasks = new Set<string>();
    const tasks = [...planningTasks, ...party.tasks].filter((task) => {
      const key = task.title.trim().toLowerCase();
      if (seenTasks.has(key)) return false;
      seenTasks.add(key);
      return true;
    });
    const allowedBringCategories = new Set<BringCategory>([
      "Main",
      "Sides",
      "Dessert",
      "Drinks",
      "Ice / Serveware",
      "Kids",
      "Décor",
    ]);
    const bringBoard: NonNullable<Party["bringBoard"]> = party.bringBoard.map((item) => ({
      ...item,
      category: allowedBringCategories.has(item.category as BringCategory)
        ? (item.category as BringCategory)
        : "Sides",
    }));

    const id = createParty({
      name: party.name,
      occasion: party.occasion,
      date: party.date,
      startTime: party.startTime ?? undefined,
      location: party.location ?? undefined,
      guestEstimate: party.guestEstimate,
      budget: party.budget,
      theme: party.theme || "Make it yours",
      planningProfile: party.planningProfile ?? undefined,
    });
    updateParty(id, (current) => ({
      ...current,
      name: party.name,
      occasion: party.occasion,
      date: party.date,
      startTime: party.startTime ?? undefined,
      location: party.location ?? undefined,
      guestEstimate: party.guestEstimate,
      budget: party.budget,
      theme: party.theme || "Make it yours",
      holidayPackId: party.holidayPackId ?? undefined,
      planningProfile: party.planningProfile ?? undefined,
      hostNote: party.hostNote ?? undefined,
      tasks,
      bringBoard,
      shoppingItems: party.shoppingItems,
      timeline: party.timeline,
      budgetCategories: party.budgetCategories,
    }));
    celebrate("cannon");
    void navigate({ to: "/party/$id", params: { id } });
  }, [createParty, demoTurn, isDemo, messages, navigate, partyStatus, updateParty]);

  const openReview = useCallback(async () => {
    if (!draftId || isDemo) return;
    setReviewOpen(true);
    setReviewLoading(true);
    setReview(null);
    try {
      const res = await previewDraft({ data: { draftId } });
      if (res.alreadyConfirmed && res.confirmedPartyId) {
        // Idempotent: already materialized. Go straight to the workspace.
        setReviewOpen(false);
        navigate({ to: "/party/$id/reveal", params: { id: res.confirmedPartyId } });
        return;
      }
      // Strip transport-only fields before storing summary.

      const { alreadyConfirmed: _a, confirmedPartyId: _c, ...summary } = res;
      void _a;
      void _c;
      setReview(summary);
    } catch (err) {
      const msg = friendlyTalkError("confirm", err);
      toast.error(msg);
      setStatusAnnouncement(msg);
      setReviewOpen(false);
    } finally {
      setReviewLoading(false);
    }
  }, [draftId, isDemo, navigate]);

  const confirmAndCreate = useCallback(
    async (opts: { acknowledgePlaceholderDate?: boolean } = {}) => {
      if (!draftId || isDemo || confirming) return;
      setConfirming(true);
      try {
        const { partyId } = await confirmDraft({
          data: {
            draftId,
            acknowledgePlaceholderDate: !!opts.acknowledgePlaceholderDate,
          },
        });
        celebrate("big");
        toast.success("Plan created — welcome to your workspace.");
        setReviewOpen(false);
        navigate({ to: "/party/$id/reveal", params: { id: partyId } });
      } catch (err) {
        const msg = friendlyTalkError("confirm", err);
        toast.error(msg);
        setStatusAnnouncement(msg);
      } finally {
        setConfirming(false);
      }
    },
    [draftId, isDemo, confirming, navigate],
  );

  // ---------- Voice-mode handlers (unchanged behavior) ----------

  const handleVoiceEvent = useCallback((evt: TalkEvent) => {
    switch (evt.type) {
      case "state":
        setState(evt.state);
        break;
      case "error": {
        // Never surface raw upstream / SDP text — TalkClient already emits
        // sanitized copy, but be defensive here too.
        const msg = friendlyTalkError("voice_runtime", evt.message);
        setVoiceError(msg);
        toast.error(msg);
        setStatusAnnouncement(msg);
        break;
      }

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
    // Voice requires an authenticated session — never call the mint API
    // from the signed-out demo path.
    if (isDemo || !user) {
      toast.error("Please sign in to talk with Confetti.");
      navigate({ to: "/auth" });
      return;
    }
    if (voiceStartInFlightRef.current) return;
    voiceStartInFlightRef.current = true;
    setConnecting(true);
    setStatusAnnouncement("Connecting to voice.");
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
        // Discard the raw response body — never render provider text.
        const msg = friendlyTalkError("voice_connect", new Error(`status_${res.status}`));
        setVoiceError(msg);
        toast.error(msg);
        setStatusAnnouncement(msg);
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
      // Register the freshly reserved id with the lifecycle controller
      // BEFORE connect() so a connect failure below still cleans up.
      if (sessionId) {
        lifecycleRef.current!.own(sessionId, Date.now());
        setSessionId(sessionId);
      }
      await client.connect();
      setStatusAnnouncement("Voice connected.");
    } catch (err) {
      // Idempotent best-effort end: no-op if nothing is owned, exactly
      // one end() otherwise. Never throws.
      await lifecycleRef.current!.end("connect_failed");
      setSessionId(null);
      clientRef.current?.close("connect_failed");
      clientRef.current = null;
      const msg = friendlyTalkError("voice_connect", err);
      setVoiceError(msg);
      toast.error(msg);
      setStatusAnnouncement(msg);
    } finally {
      voiceStartInFlightRef.current = false;
      setConnecting(false);
    }
  }, [handleVoiceEvent, navigate, isDemo, user]);

  const stopVoice = useCallback(async () => {
    clientRef.current?.close("user_ended");
    clientRef.current = null;
    await lifecycleRef.current!.end("user_ended");
    setSessionId(null);
  }, []);

  // pagehide fires on backgrounding / hard nav. SPA route changes fire
  // the unmount effect below instead — both funnel through the same
  // idempotent lifecycle.end() so at most one end() actually goes out
  // per owned reservation. Uses a ref so we never capture a stale id.
  useEffect(() => {
    const cleanup = () => {
      lifecycleRef.current?.end("pagehide");
    };
    window.addEventListener("pagehide", cleanup);
    return () => window.removeEventListener("pagehide", cleanup);
  }, []);

  useEffect(
    () => () => {
      clientRef.current?.close("route_unmount");
      clientRef.current = null;
      // SPA route unmount: pagehide does NOT fire here. Without this we
      // would leak a reserved DB row until the stale-cutoff swept it.
      lifecycleRef.current?.end("route_unmount");
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
    <div className="min-h-screen bg-brand-wash">
      {/* Polite screen-reader announcements: thinking, send/connect
          errors, connection lifecycle, demo-limit reached. */}
      <div role="status" aria-live="polite" className="sr-only">
        {statusAnnouncement}
      </div>

      <div
        className="mx-auto flex min-h-screen max-w-6xl flex-col px-3 pt-3 sm:px-6 sm:pt-5"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <header className="flex items-center justify-between gap-2 rounded-full border border-white/80 bg-white/90 px-2.5 py-1.5 shadow-brand backdrop-blur-xl sm:px-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: "/app" })}
            className="min-h-11 gap-1"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <a href="/" aria-label="Confetti — home" className="flex min-h-11 items-center sm:hidden">
            <BrandMark className="h-8 w-8" />
          </a>
          <div className="hidden shrink-0 sm:block">
            <BrandLockup />
          </div>

          <div
            className="inline-flex overflow-hidden rounded-full border border-border bg-muted/30 text-xs"
            role="tablist"
            aria-label="Talk mode"
          >
            <button
              role="tab"
              aria-selected={mode === "text"}
              onClick={() => setMode("text")}
              className={cn(
                "min-h-10 px-3.5 py-1",
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
                "min-h-10 px-3.5 py-1",
                mode === "voice" ? "bg-primary text-primary-foreground" : "bg-background",
              )}
            >
              Voice
            </button>
          </div>
        </header>

        {mode === "text" ? (
          <main className="mt-7 flex-1 md:mt-10">
            <section className="mb-6 max-w-4xl">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--brand-gold)]">
                Your calm cohost
              </div>
              <h1 className="mt-2 max-w-3xl font-display text-4xl font-medium leading-[0.98] tracking-[-0.04em] text-foreground sm:text-5xl md:text-6xl">
                Start messy.{" "}
                <span className="italic text-secondary">We’ll shape the party together.</span>
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Tell me what you know, what you’re unsure about, and what you want the gathering to
                feel like. Leave anything blank—we can come back to it.
              </p>
            </section>

            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
              <section className="flex flex-col">
                {isDemo && (
                  <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-white/80 bg-white/72 px-4 py-3 text-xs text-secondary shadow-soft backdrop-blur">
                    <Badge variant="secondary" className="uppercase tracking-wide">
                      Private browser demo
                    </Badge>
                    <span className="min-w-0 flex-1">
                      Confetti reads what you type locally for {DEMO_MAX_TURNS} turns, then builds a
                      plan saved in this browser. No account, AI call, or upload.
                    </span>
                  </div>
                )}
                <Card className="flex h-[540px] flex-col overflow-hidden rounded-[1.75rem] border-white/80 bg-white/92 shadow-lift md:h-[440px]">
                  <div className="flex items-center gap-2 border-b border-border/70 bg-white/60 px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-[var(--brand-coral)]" aria-hidden />
                    Planning together
                  </div>

                  <div
                    ref={chatScrollRef}
                    className="flex-1 space-y-3 overflow-y-auto bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.055),transparent_38%)] px-4 py-5 sm:px-5"
                    aria-live="polite"
                  >
                    {messages.map((m, i) => (
                      <div
                        key={i}
                        className={cn(
                          "rounded-[1.35rem] px-4 py-3 text-sm leading-6",
                          m.role === "assistant"
                            ? "max-w-[92%] rounded-tl-md bg-[hsl(267_32%_93%)] text-foreground"
                            : "ml-auto max-w-[85%] rounded-tr-md bg-primary/10 text-foreground",
                        )}
                      >
                        <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {m.role === "assistant" ? "Confetti" : "You"}
                        </div>
                        {m.content}
                      </div>
                    ))}
                    {messages.length === 1 && !thinking && (
                      <div className="pt-1">
                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Start wherever it feels easiest
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {STARTER_PROMPTS.map((prompt) => (
                            <button
                              key={prompt}
                              type="button"
                              onClick={() => setTyped(prompt)}
                              className="min-h-11 rounded-full border border-primary/15 bg-white/85 px-3 py-2 text-left text-xs font-medium text-secondary shadow-sm transition hover:border-primary/35 hover:bg-white"
                            >
                              {prompt}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {thinking && (
                      <div className="flex items-center gap-2 rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
                      </div>
                    )}
                  </div>
                  <div className="border-t border-border/70 bg-white/80 p-3 backdrop-blur">
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
                        placeholder={
                          demoLimitReached
                            ? "Demo turns used — build the browser plan when ready."
                            : "Tell Confetti the brain dump…"
                        }
                        rows={2}
                        className="min-h-[54px] resize-none rounded-2xl border-border/80 bg-white"
                        aria-label="Message Confetti"
                        disabled={(!isDemo && !draftId) || thinking || demoLimitReached}
                      />
                      <Button
                        onClick={sendMessage}
                        disabled={
                          (!isDemo && !draftId) || thinking || !typed.trim() || demoLimitReached
                        }
                        size="icon"
                        variant="festive"
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
                          disabled={(!isDemo && !draftId) || thinking || demoLimitReached}
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
                <Card className="rounded-3xl border-white/80 bg-white/88 p-5 shadow-card backdrop-blur">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" /> What I'm hearing
                  </div>
                  {assumptions.length === 0 && openQs.length === 0 ? (
                    <div className="mt-3">
                      <p className="text-sm leading-6 text-secondary">
                        I’ll listen for the pieces that turn an idea into a plan:
                      </p>
                      <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                        {["The feeling you want", "People, food, and place", "What can wait"].map(
                          (item) => (
                            <li
                              key={item}
                              className="flex items-center gap-2 rounded-xl bg-muted/45 px-3 py-2"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden />
                              {item}
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
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
                {isDemo ? (
                  <>
                    <Button
                      variant="festive"
                      size="lg"
                      className="w-full"
                      onClick={createDemoPlan}
                      disabled={demoTurn === 0 || partyStatus !== "ready"}
                      data-testid="talk-build-browser-plan"
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />{" "}
                      {demoTurn === 0 ? "Share one idea first" : "Build my browser plan"}
                    </Button>
                    <p className="text-[11px] text-muted-foreground">
                      Your words stay on this device. Confetti leaves unknown details visibly open;
                      sign up later only if you want the plan across devices and shareable guest
                      links.
                    </p>
                  </>
                ) : (
                  <>
                    <Button
                      variant="festive"
                      size="lg"
                      className="w-full"
                      onClick={openReview}
                      disabled={
                        !draftId ||
                        confirming ||
                        reviewLoading ||
                        (!readyToConfirm && messages.length < 4)
                      }
                      data-testid="talk-open-review"
                    >
                      {reviewLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing review…
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="mr-2 h-4 w-4" /> Review &amp; create the plan
                        </>
                      )}
                    </Button>
                    <p className="text-[11px] text-muted-foreground">
                      Turns your conversation into a real workspace: tasks, budget, guests, bring
                      board.
                    </p>
                  </>
                )}
              </aside>
            </div>
          </main>
        ) : (
          <main className="mt-7 flex flex-1 flex-col items-center gap-6 md:mt-10">
            <div className="max-w-2xl text-center">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--brand-gold)]">
                Hey Confetti
              </div>
              <h1 className="mt-2 font-display text-4xl font-medium leading-[0.98] tracking-[-0.04em] text-foreground sm:text-5xl">
                Say it out loud.{" "}
                <span className="italic text-secondary">I’ll help make sense of it.</span>
              </h1>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
                Talk through the feeling, the people, the food, or the one thing you know for sure.
              </p>
            </div>
            <VoiceOrb state={orbState} />
            <StatusLine state={state} connecting={connecting} error={voiceError} />
            {!isLive && !connecting && (
              <div className="w-full max-w-md space-y-4">
                <Card className="rounded-3xl border-white/80 bg-white/88 p-5 text-center shadow-card backdrop-blur">
                  <h2 className="font-display text-xl font-semibold text-secondary">
                    Voice mode is in beta
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {isDemo
                      ? "Real voice is authenticated so we can save your session. Try text mode as a demo, or sign up free to talk out loud."
                      : "Speech-to-speech uses OpenAI Realtime. Text mode always works."}
                  </p>
                </Card>
                {isDemo ? (
                  <Button asChild variant="festive" size="lg" className="w-full">
                    <a href="/auth?mode=signup">
                      <Mic className="mr-2 h-5 w-5" /> Sign up to unlock voice
                    </a>
                  </Button>
                ) : (
                  <Button
                    variant="festive"
                    size="lg"
                    className="w-full"
                    onClick={startVoice}
                    disabled={connecting || !authReady}
                  >
                    <Mic className="mr-2 h-5 w-5" /> Start voice session
                  </Button>
                )}
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

      <ReviewDialog
        open={reviewOpen}
        onOpenChange={(o) => {
          if (!confirming) setReviewOpen(o);
        }}
        loading={reviewLoading}
        review={review}
        confirming={confirming}
        onConfirm={confirmAndCreate}
      />
    </div>
  );
}

function ReviewDialog({
  open,
  onOpenChange,
  loading,
  review,
  confirming,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  review: ReviewSummary | null;
  confirming: boolean;
  onConfirm: (opts: { acknowledgePlaceholderDate?: boolean }) => void;
}) {
  const [ackDate, setAckDate] = useState(false);
  // Reset acknowledgement whenever the dialog reopens with a new review.
  useEffect(() => {
    if (!open) setAckDate(false);
  }, [open]);

  const dateBlocked = !!review?.blockingUnknowns?.some((b) => b.field === "date");
  const otherBlockers = (review?.blockingUnknowns ?? []).filter((b) => b.field !== "date");
  const canCreate =
    !!review && !loading && !confirming && otherBlockers.length === 0 && (!dateBlocked || ackDate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg sm:max-w-lg"
        data-testid="talk-review-dialog"
        aria-busy={loading || confirming}
      >
        <DialogHeader>
          <DialogTitle>Review the plan</DialogTitle>
          <DialogDescription>
            Here's what Confetti will create. You can change anything after.
          </DialogDescription>
        </DialogHeader>

        {loading || !review ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Building your preview…
          </div>
        ) : (
          <div
            className="max-h-[60vh] space-y-4 overflow-y-auto pr-1"
            data-testid="talk-review-body"
          >
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Essentials
              </h3>
              <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
                <DetailRow label="Name" value={review.essentials.name} />
                <DetailRow
                  label="Occasion"
                  value={
                    review.essentials.holidayPack ?? review.essentials.occasion.replace("-", " ")
                  }
                />
                <DetailRow
                  label="Date"
                  value={dateBlocked ? "Not set" : review.essentials.date}
                  tone={dateBlocked ? "warn" : undefined}
                />
                <DetailRow label="Time" value={review.essentials.startTime ?? "—"} />
                <DetailRow label="Location" value={review.essentials.location ?? "—"} />
                <DetailRow
                  label="Guests"
                  value={
                    review.essentials.guestEstimate > 0
                      ? String(review.essentials.guestEstimate)
                      : "TBD"
                  }
                />
                <DetailRow
                  label="Budget"
                  value={review.essentials.budget > 0 ? `$${review.essentials.budget}` : "TBD"}
                />
                {review.essentials.foodApproach && (
                  <DetailRow label="Food" value={review.essentials.foodApproach} />
                )}
                {review.essentials.hostReadyTarget && (
                  <DetailRow label="Host-ready by" value={review.essentials.hostReadyTarget} />
                )}
              </dl>
            </section>

            {dateBlocked && (
              <section
                className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-950"
                data-testid="talk-blocking-date"
              >
                <p className="font-medium">We don't have a real date yet.</p>
                <p className="mt-1 text-amber-900/90">
                  Guests shouldn't see a placeholder date on an invitation. Set the real date first,
                  or check the box below to create the party now and pick a date later.
                </p>
                <label className="mt-2 flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={ackDate}
                    onChange={(e) => setAckDate(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-amber-400"
                    data-testid="talk-ack-date"
                  />
                  <span>I'll pick a real date later. Don't share invitations until I do.</span>
                </label>
              </section>
            )}

            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                What we'll create
              </h3>
              <ul className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <CountChip label="Tasks" n={review.counts.tasks} />
                <CountChip label="Shopping" n={review.counts.shoppingItems} />
                <CountChip label="Bring items" n={review.counts.bringItems} />
                <CountChip label="Timeline" n={review.counts.timeline} />
                <CountChip label="Budget cats" n={review.counts.budgetCategories} />
              </ul>
            </section>

            {review.optionalUnknowns?.length > 0 && (
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Left blank on purpose
                </h3>
                <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  {review.optionalUnknowns.map((u) => (
                    <li
                      key={u.field}
                      className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-muted-foreground"
                    >
                      {u.label}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {review.assumptions.length > 0 && (
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Assumptions (edit anytime)
                </h3>
                <ul className="mt-2 space-y-1 text-sm text-foreground">
                  {review.assumptions.map((a, i) => (
                    <li key={i} className="rounded-lg bg-primary/5 px-2.5 py-1.5 text-secondary">
                      {a}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {review.openQuestions.length > 0 && (
              <section>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Still open — becomes a checklist item
                </h3>
                <ul className="mt-2 space-y-1 text-sm text-foreground">
                  {review.openQuestions.map((q, i) => (
                    <li key={i} className="rounded-lg bg-muted/40 px-2.5 py-1.5">
                      {q}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={confirming}
            className="min-h-11"
          >
            Keep talking
          </Button>
          <Button
            variant="festive"
            onClick={() => onConfirm({ acknowledgePlaceholderDate: ackDate })}
            disabled={!canCreate}
            data-testid="talk-confirm-create"
            className="min-h-11"
          >
            {confirming ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Create the party
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/60 py-1 sm:border-b-0 sm:py-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd
        className={`text-right text-sm font-medium ${
          tone === "warn" ? "text-amber-700" : "text-foreground"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function CountChip({ label, n }: { label: string; n: number }) {
  return (
    <li className="flex items-center justify-between rounded-lg border border-border bg-background px-2.5 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-base font-semibold tabular-nums text-foreground">{n}</span>
    </li>
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
