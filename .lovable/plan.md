
# "Talk it out with Confetti" — V1 Plan

Plan only. No code changes. Signature voice feature: tap-to-start realtime conversation that fills a **GatheringDraft** and, on explicit confirmation, materializes into the existing `Party` model. Built on OpenAI Realtime over WebRTC with a short-lived ephemeral token minted by a TanStack server function; long-lived API key stays server-side.

## 1. Current-code feasibility assessment

Confirmed from repo reads earlier this session:

- **Stack fits.** TanStack Start + `createServerFn` (`src/lib/*.functions.ts`) + Supabase (auth-middleware pattern in `src/integrations/supabase/auth-middleware.ts`). We can mint an ephemeral Realtime session server-side without any new framework.
- **Party model is in-memory-first but Supabase-backed.** `src/lib/party-context.tsx` owns `Party`, `makeParty`, `addParty`, `updateParty`, and the `parties` table upsert path. Draft → Party is a mapping problem, not a rewrite.
- **`LOVABLE_API_KEY` and Supabase secrets already present** (from `secrets--fetch_secrets`). We add one new secret: `OPENAI_API_KEY` (voice model billing is not covered by Lovable AI Gateway, since Realtime speech-to-speech isn't proxied there today — call OpenAI directly from the server for token minting only).
- **No existing voice code, no wake-word, no realtime infra.** Green field on the UI and audio side.
- **Confetti/celebrate primitives, toast system, Dialog, prefers-reduced-motion handling, mobile-first shell** — all already shipped and reusable for the voice surface.
- **Composable-gathering plan (previous turn)** is not merged. This feature can ship without it, but the draft schema is designed so the two land cleanly: `GatheringDraft` mirrors the composable dimensions and maps into today's flat `Party` on confirm, and into the new `reveal jsonb` later.

Files likely affected (net-new unless noted):

- `src/routes/api/realtime/session.ts` — new server route (POST). Mints ephemeral Realtime client token.
- `src/lib/talk.functions.ts` — new. `getDraft`, `saveDraftPatch`, `confirmDraft`, `deleteDraft`, `startSession`, `endSession`.
- `src/lib/talk-tools.ts` — new. Zod schemas for tool inputs, tool descriptors handed to the Realtime model.
- `src/routes/talk.tsx` — new. Focused voice surface route (mobile-first).
- `src/components/talk/*` — new. `VoiceOrb`, `Waveform`, `LiveTranscript`, `WhatImHearingCard`, `MicPermissionGate`, `TypingFallback`, `RetentionSheet`.
- `src/lib/party-context.tsx` — light additions: `createPartyFromDraft(draft)` mapper, no changes to budget math or shopping wiring.
- `src/routes/index.tsx` and `src/routes/app.tsx` — add "Talk it out" entry points (hero CTA + workspace top bar).
- Migration: `gathering_drafts` table + `talk_sessions` audit table + RLS + grants (see §2.5).
- `src/routes/__root.tsx` — no changes required; `src/lib/error-*` already covers SSR failures.

Non-affected (do not touch): budget math, shopping/cart wiring, RSVP RPCs (`get_rsvp_party`, `submit_rsvp`), themes catalog, seasonal banner, invite dialog, affiliate config.

## 2. Recommended architecture

### 2.1 Data flow

```text
Browser (talk.tsx)
  ├── POST /api/realtime/session  (Supabase-authed)
  │      └── server mints OpenAI Realtime ephemeral client_secret + session config
  ├── RTCPeerConnection ⇄ api.openai.com (Realtime WebRTC)
  │      └── audio in/out + data channel (events, tool calls, transcripts)
  ├── Tool call events → local tool handlers → server fns (saveDraftPatch, confirmDraft, …)
  │      └── Supabase gathering_drafts (RLS: owner-only)
  └── On confirm → createPartyFromDraft → existing party upsert path → navigate /party/$id
```

Key rule: **the voice model never writes to `parties` directly.** Tools mutate `gathering_drafts` only. `confirm_draft` returns a summary; the *host* clicks a UI Confirm button; that click calls `confirmDraft` server-fn which does the party upsert.

### 2.2 Why WebRTC + ephemeral token

- WebRTC gives sub-500ms round-trip and native barge-in; websockets are worse for this UX.
- Ephemeral token pattern is OpenAI's supported approach for browser Realtime clients. The long-lived `OPENAI_API_KEY` never leaves the server; the browser gets a `client_secret` scoped to one session with a short TTL.
- Data channel carries transcripts (partial + final), tool calls, and session events. Audio flows over the RTP media stream.

### 2.3 Server-side session mint (contract)

`POST /api/realtime/session` (TanStack server route under `src/routes/api/`, not `/api/public/` — this is authenticated app surface):

- Auth: reuse the Supabase bearer middleware pattern (verify JWT server-side; reject anon).
- Rate limit: per-user, in-memory + `talk_sessions` row check — max 5 session mints per hour, max 2 concurrent live sessions per user.
- Body: `{ draftId?: string, locale?: string }`.
- Server calls OpenAI `POST /v1/realtime/sessions` with:
  - `model: "gpt-realtime"` (or the current recommended Realtime model at implementation time; documented placeholder — verify against OpenAI Realtime docs before shipping).
  - `voice`: warm default (e.g. `"marin"`), overridable later.
  - `modalities: ["audio","text"]`.
  - `instructions`: the system prompt (see §3.1). Includes the tool contract summary and the "one question at a time / warm co-host" persona.
  - `tools`: descriptors from `src/lib/talk-tools.ts` (JSON schemas derived from Zod via `zod-to-json-schema`).
  - `tool_choice: "auto"`.
  - `turn_detection: { type: "server_vad", threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500, create_response: true, interrupt_response: true }` — enables barge-in.
  - `input_audio_transcription: { model: "gpt-4o-mini-transcribe" }` for the on-screen live transcript.
  - `max_response_output_tokens: 512` — cost cap per turn.
- Returns to browser: `{ clientSecret, expiresAt, sessionId, draftId }`.

### 2.4 Browser Realtime client

Minimal, using standard WebRTC APIs — no SDK required, but OpenAI's `@openai/agents-realtime` SDK is acceptable if it's stable at implementation time. Either way, keep the peer-connection code isolated in `src/lib/talk-client.ts` behind a thin `TalkClient` interface (`connect`, `disconnect`, `sendText`, `on(event)`) so the model/SDK swap doesn't ripple.

### 2.5 Persistence (migration)

New tables (owner-scoped, RLS on, grants issued in the same migration):

- `gathering_drafts (id uuid pk, user_id uuid references auth.users, draft jsonb not null default '{}', open_questions jsonb default '[]', assumptions jsonb default '[]', status text check in ('active','confirmed','abandoned') default 'active', confirmed_party_id uuid, transcript_retention text check in ('none','summary','full') default 'summary', created_at, updated_at)` + `update_updated_at` trigger.
- `talk_sessions (id uuid pk, user_id uuid, draft_id uuid, started_at, ended_at, duration_s int, model text, tokens_input int, tokens_output int, audio_seconds_in int, audio_seconds_out int, cost_cents int, disconnect_reason text)`.
- Optional `talk_transcripts (session_id uuid pk, draft_id uuid, transcript jsonb, created_at)` — inserted only when the user explicitly picks "full" retention; deletable via `deleteDraft`.
- RLS: `user_id = auth.uid()` on all three. Grants: `SELECT/INSERT/UPDATE/DELETE` to `authenticated`; `ALL` to `service_role`; no `anon`.

## 3. Conversation state machine

States (owned by `TalkClient` + a small XState-free reducer in `talk.tsx`):

```
idle
 └─ userTapsStart ─▶ requestingMic
     ├─ denied ─▶ typingFallback
     └─ granted ─▶ mintingSession
         ├─ error ─▶ failed(retryable?)
         └─ ok ─▶ connecting (WebRTC ICE)
             ├─ error ─▶ reconnecting (exp backoff, max 3) ─▶ failed
             └─ ok ─▶ listening
                 ├─ userSpeaking (VAD) ─▶ listening
                 ├─ modelSpeaking ─▶ (user can barge-in: interrupt → listening)
                 ├─ toolCall ─▶ toolRunning ─▶ listening
                 ├─ userPause (>2s silence, nothing to say) ─▶ modelPrompt("what feels most alive about this?")
                 ├─ userSays "pause"/"stop"/tapsMute ─▶ paused
                 ├─ userSays "let's review" or model confidence ≥ threshold ─▶ reviewing
                 └─ maxDuration reached (15 min) ─▶ wrappingUp
reviewing (voice + on-screen recap card)
 ├─ userSays "change X" ─▶ listening
 ├─ userTapsConfirm ─▶ confirming (server fn) ─▶ createdParty (navigate)
 └─ userTapsSaveDraft ─▶ savedDraft (idle, resumable)
paused ─▶ listening | idle (user disconnects)
failed ─▶ typingFallback (always available)
```

Client-side guardrails:
- Session hard cap 15 min, warning at 12 min.
- Idle disconnect after 60 s of pure silence with no partial transcript.
- Cost cap: after 25k output tokens or $0.50 estimated (whichever first), model is instructed to wrap.

### 3.1 System prompt (persona + rails)

Excerpted content, not final copy. Ships in `src/lib/talk-tools.ts`:

- "You are Confetti, a warm, perceptive co-host. You help someone plan a real gathering. You are not a form. Ask one question at a time. Start with the dream — what are we gathering for and what should it feel like — then adaptively gather only what changes the plan."
- Explicit list of dimensions to gather (occasion, purpose, date/time certainty, headcount + households + kids, effort level, budget, food approach, dietary/accessibility, contributions, vibe/activities, weather/space/equipment, host-ready target).
- "Never invent details. If unsure, ask or mark unknown."
- "Reflect and simplify when the plan is becoming ambitious."
- "Distinguish fact vs preference vs assumption vs open question when you write to the draft."
- Tool usage rules: call `update_draft` after any turn that changed the picture; call `mark_unknown` when the host says skip/don't know; call `confirm_draft` only when host explicitly says something like 'yes create it, ready, go ahead'; **never** call `generate_plan` — that's a client-side action after the host taps Confirm.
- Cultural sensitivity: no assumptions about observance, kashrut, halal, teams, religion, or age. Prompt, don't assume.
- Length: assistant utterances stay under ~3 sentences unless summarizing.

## 4. GatheringDraft schema (proposal)

TypeScript, lives in `src/lib/gathering-draft.ts`. Zod-parsable. Includes provenance and confirmation status per field.

```ts
type Provenance = "voice" | "text" | "inferred" | "host-edited";
type FieldStatus = "unknown" | "assumed" | "stated" | "confirmed";

interface Field<T> {
  value: T | null;
  status: FieldStatus;         // controls whether we ask again
  provenance: Provenance;
  updatedAt: string;           // ISO
  note?: string;               // e.g. why it was inferred
}

interface GatheringDraft {
  id: string;                  // uuid, matches gathering_drafts.id
  userId: string;
  createdAt: string;
  updatedAt: string;

  identity: {
    workingTitle: Field<string>;   // "Maya's 8th" or "World Cup Final watch"
    honoree: Field<{ name: string; ageBand?: "child"|"teen"|"adult"|"senior" } | null>;
    tone: Field<"playful"|"warm"|"reverent"|"competitive"|"intimate"|"festive">;
    audience: Field<"adults"|"mixed"|"kids-friendly">;
    tags: Field<string[]>;         // open set: birthday, shabbat, cookout, watch-party, dinner-party, custom, ...
    purpose: Field<string>;        // free text: "haven't seen my college friends in a year"
    memorableMoment: Field<string>;// "the toast", "kickoff", "candle lighting"
  };

  when: {
    date: Field<string | null>;                // ISO date
    dateCertainty: Field<"fixed"|"window"|"tbd">;
    window: Field<{ from: string; to: string } | null>;
    startTime: Field<string | null>;           // human ("2 PM"); resolved later
    anchors: Field<Array<{ kind: string; label: string; at: string }>>; // kickoff, sundown, meal
  };

  where: {
    venueKind: Field<"home"|"backyard"|"park"|"venue"|"virtual"|"unknown">;
    display: Field<string | null>;
    contingency: Field<{ needed: boolean; kind?: "rain"|"heat"|"cold"|"stream-fail"|"custom"; plan?: string }>;
  };

  people: {
    expectedCount: Field<number | null>;
    households: Field<number | null>;
    kids: Field<number | null>;
    guestNotes: Field<string>;                 // "mostly my running club plus 3 neighbors"
  };

  effort: {
    level: Field<"low"|"medium"|"high">;
    hostReadyTarget: Field<string | null>;     // e.g. "T-30 min before first guest"
  };

  budget: {
    total: Field<number | null>;
    stance: Field<"strict"|"flexible"|"no-limit">;
    notes: Field<string>;
  };

  food: {
    approach: Field<"cook"|"catering"|"grocery-prepared"|"potluck"|"mix"|"snacks-only"|"none">;
    peakMoment: Field<string | null>;          // "halftime", "sundown+15m"
    portionModel: Field<"per-guest"|"per-adult+kid"|"family-style"|"unknown">;
  };

  constraints: {
    dietary: Field<string[]>;                  // aggregate labels only; no per-guest text here
    accessibility: Field<string[]>;
    observance: Field<string[]>;               // pack-agnostic; free strings
    allergies: Field<string[]>;
  };

  contributions: {
    mode: Field<"none"|"open-signup"|"assigned"|"potluck-list">;
    seeds: Field<Array<{ label: string; qty?: number }>>;
  };

  vibe: {
    activities: Field<string[]>;
    creativeDirection: Field<{ palette?: string[]; vibe?: string; teamNeutral?: boolean; teams?: string[] } | null>;
    broadcast: Field<{ source: "tv"|"stream"|"none"; channel?: string; needsSoundCheck?: boolean } | null>;
  };

  rituals: Field<Array<{ label: string; instruction?: string; optional: boolean }>>;

  openQuestions: Array<{ id: string; question: string; blocking: boolean }>;
  assumptions:  Array<{ id: string; text: string; needsConfirmation: boolean }>;

  status: "active"|"confirmed"|"abandoned";
  confirmedPartyId?: string;
  transcriptRetention: "none"|"summary"|"full";
}
```

Mapping into today's `Party` on confirm (in `createPartyFromDraft`):
- `identity.workingTitle` → `name`
- `identity.tags[0]` → `occasion` (fallback `"custom"`), full `tags[]` stashed in `reveal.tags` once the composable model lands.
- `when.date` → `date`; `when.startTime` → `startTime`; `where.display` → `location`; `identity.purpose`+`memorableMoment` → `hostNote` (concatenated, capped at 280).
- Guests, budget items, shopping items are **not** auto-populated in V1; the party opens with the existing empty states so the host stays in control. (Post-V1: seed via gathering packs.)
- Everything else stashed in `reveal.gatheringDraft` for future consumption.

## 5. UI / component map

Route: `/talk?draft=<id?>`. Full-viewport focused surface; not part of the workspace tabs.

- `<TalkRoute>`
  - `<MicPermissionGate>` — pre-connect state; shows what will happen, "not always listening" copy, tap-to-start button.
  - `<VoiceOrb>` — Confetti mark with three visual states (idle, listening, speaking). Reduced-motion: swap animation for a soft opacity pulse.
  - `<Waveform>` — Web Audio `AnalyserNode` on the incoming mic + remote track. Off when reduced motion.
  - `<TranscriptStream>` — live partial + final lines, scroll-locked to bottom, screen-reader announces new assistant turns via `aria-live="polite"`.
  - `<WhatImHearingCard>` — right side on ≥md, bottom sheet on mobile. Renders the `GatheringDraft` grouped by section with per-field status badges (unknown/assumed/stated/confirmed). Every value is inline-editable (typing overrides voice with `provenance:"host-edited"` and `status:"confirmed"`).
  - `<TranscriptFallbackInput>` — text box always visible; user can type instead of / in addition to talking. Sends via data channel.
  - `<ControlsBar>` — Mute mic · Pause session · End session · Retention toggle (opens `<RetentionSheet>`).
  - `<ReviewSheet>` — appears in `reviewing` state. Shows a plain-English recap, the open questions, the assumptions, and two buttons: "Create the party" and "Save draft, come back later".
  - `<ConfirmDialog>` — dedupe guard (see §9); disables when `savingRef` in flight; explicit "Create party" click required.
  - `<ErrorToast>` / `<CostWarningBanner>` — surface mint failures, ICE failures, cost warnings.

Key visual states: idle, requesting-mic, mic-denied, minting, connecting, listening, model-speaking, tool-running, paused, reviewing, confirming, created, failed, offline. Each has a distinct orb color + status line; all pass axe checks.

Mobile (375px): orb top, WhatImHearing sheet slides up from bottom to 60% height, controls dock at bottom. Desktop (1280px): orb centered left column, WhatImHearing fixed right column.

## 6. Tool contracts and approval boundaries

Defined in `src/lib/talk-tools.ts`. All tool inputs Zod-parsed on the client before forwarding to server fns; server fns re-validate. Owner check on every server fn.

- **`get_draft() → GatheringDraft`** — read-only, always allowed.
- **`update_draft(patch: DraftPatch)`** — deep-merges a partial into fields; each patched field must include `status` and `provenance`. Idempotent by construction (same patch twice = same state). Rate-limited to 20 calls/min per session.
- **`mark_unknown(path: string, note?: string)`** — sets `status:"unknown"`; used when host says skip.
- **`add_open_question(question: string, blocking?: boolean)`** / **`resolve_open_question(id)`**.
- **`add_assumption(text: string, needsConfirmation?: boolean)`** / **`clear_assumption(id)`**.
- **`confirm_draft(summary: string)`** — **does not create a party**. Marks the draft as "ready-for-review" (a soft status inside the row) and pushes a UI event so the ReviewSheet opens. Actual party creation is the host's tap on "Create the party", which calls `confirmDraft` server-fn.
- **`generate_plan()`** — **explicitly not exposed to the model.** Kept as an internal server-fn callable only from the host's confirm click.
- **`request_end_session(reason?: string)`** — model may call this if user says "we're done"; UI shows the review sheet and disconnects the RTC.

Guardrails:
- Tool schemas reject unknown fields.
- No tool can touch `parties`, `guests`, `shopping_items`, budgets, or RSVP data. That's a code-level invariant: the tool handlers only import `talk.functions.ts`.
- Server fns require the Supabase bearer via existing middleware. Anon calls → 401.
- `confirmDraft` server-fn is idempotent on `draftId + confirmedAt` (returns existing party if already confirmed within 30 s).

## 7. Privacy, safety, accessibility, failure, cost

### Privacy UX
- Consent copy on `<MicPermissionGate>`: "Confetti listens only after you tap the mic. It stops when you tap End. V1 is not always listening." Link to a short in-app privacy note.
- Persistent "recording" indicator (red dot + "Listening" label) whenever the mic is hot; also a browser-native mic indicator.
- Retention picker (default: **summary only**): none / summary / full. Choice persists per draft, editable any time; changing from full → summary/none deletes stored transcript on save.
- Delete-my-draft button in `<RetentionSheet>` → `deleteDraft` server-fn hard-deletes `gathering_drafts` + `talk_transcripts` rows for that draft.
- Server logs never include audio bytes; log only session id, duration, token counts, tool names, error class. No transcript text in logs.
- Ephemeral tokens are never stored, never logged.

### Safety
- Model instructed: no purchases, no invitations, no messages, no destructive changes; only draft mutations.
- Server-side owner check on every draft mutation.
- Cost + rate caps as in §2.3 and §3 (session length, tokens, mint-per-hour, concurrent sessions).
- Confirm-idempotency window prevents double-create when a user taps twice or reconnects during confirm (see §9).

### Accessibility
- All controls keyboard-reachable in a documented tab order; focus ring visible.
- `aria-live="polite"` for assistant transcript, `aria-live="assertive"` for state changes ("Listening", "Confetti is speaking", "Disconnected — reconnecting").
- Full typing fallback with the same tool surface, so mic-denied users get the same feature.
- Reduced-motion: no waveform animation, no orb pulse; use static color states.
- Colorblind-safe status badges (icon + label, not color alone).
- Captions on every assistant utterance (already in transcript stream).

### Failure modes
- Mic denied → `<TypingFallback>` seamlessly, session still mints (text-only modality via data channel).
- Mint fails (network / 5xx / rate-limited) → toast with retry; if 429, show remaining budget.
- WebRTC ICE fails / connection drops → auto-reconnect up to 3× with exp backoff (1s/3s/9s), preserving draft. If all fail → "We lost the connection. Your draft is safe. Reconnect or keep going by typing."
- OpenAI 402/insufficient-quota → surface a clear "This feature is temporarily unavailable" state; do not leak provider errors.
- SSR: `/talk` is CSR-only (`ssr: false` on the route) since it depends on `navigator.mediaDevices` and `RTCPeerConnection`.

### Cost handling
- Server tracks tokens + audio-seconds per session in `talk_sessions`; nightly aggregation surfaced to the workspace owner.
- Client-side cost estimator (order of magnitude only): shows a small "$0.12 so far" line to the host after 5 min, as a nudge.
- Hard cap: session auto-ends at 15 min or the token/dollar caps in §3, whichever first.

## 8. Vertical implementation slices

Each slice is independently shippable and independently testable. Slice 1 is deliberately narrow.

**Slice 1 — token mint + connect + speak/hear one round trip (smallest genuine slice).**
- Migration for `gathering_drafts` + `talk_sessions` (no `talk_transcripts` yet). RLS + grants.
- `OPENAI_API_KEY` secret. `POST /api/realtime/session` route with rate limit + auth.
- `/talk` route (CSR-only). `<MicPermissionGate>` + `<VoiceOrb>` + minimal `<TranscriptStream>`.
- `TalkClient` connects, plays audio, shows partial transcripts. No tools yet — the model just chats.
- End button disconnects; session row is finalized.
- **Test**: real device, one 30 s conversation, transcript renders, no key in browser bundle (`bun run build` + grep).

**Slice 2 — draft tools + WhatImHearing card.**
- Zod schemas + `update_draft`/`get_draft`/`mark_unknown`/`add_open_question`/`add_assumption` tools wired both ways.
- `<WhatImHearingCard>` renders draft with status badges, in-line editable.
- System prompt persona + rails in place.
- **Test**: 3-minute conversation for a birthday fills identity, when, people, food; every field shows correct provenance/status.

**Slice 3 — review + confirm + create party.**
- `<ReviewSheet>`, `confirmDraft` server-fn, `createPartyFromDraft` mapper, idempotency guard.
- Navigates to `/party/$id` on success.
- **Test**: full happy path birthday flow → party exists with mapped fields.

**Slice 4 — resilience + accessibility + retention.**
- Reconnect logic, cost caps, typing fallback, retention picker, delete-draft, reduced-motion polish, keyboard/aria audit, SR announcements.
- **Test**: acceptance suite (§9) end-to-end.

**Slice 5 — cross-gathering coverage + polish.**
- Verify with Shabbat, BBQ, watch party, dinner party, potluck. Tune system prompt with what came up in real testing.
- Add optional `talk_transcripts` table + retention "full" path.

Non-goals for V1 stay out even if easy — see §10.

## 9. Acceptance criteria and tests

Every scenario tested at 375 px and 1280 px, with a real signed-in Supabase user, mic hardware granted unless noted. Playwright (browser-use) for UI + a small integration harness for the server route and tool schemas.

- **A-BIRTHDAY-01** "Maya's 8th, backyard, 12 kids, June, cake and pizza." Draft fills identity/when/where/people/food; ReviewSheet lists 1–3 open questions (theme? start time?); tapping "Create the party" produces a `parties` row with the mapped fields and no phantom guest/budget/shopping entries.
- **A-SHABBAT-01** "Small Shabbat dinner Friday, 8 adults, some kosher-keeping." Assistant does not assume observance level; adds an open question and an assumption (`needsConfirmation: true`); `constraints.observance` recorded as free strings, not enum. No religious iconography suggested.
- **A-BBQ-01** "BBQ Saturday, 25ish, mixed adults and kids, potluck sides." `food.approach: "mix"`, `contributions.mode: "open-signup"`, `where.contingency.kind: "heat"` proposed as an assumption to confirm.
- **A-DINNER-01** "Six-person dinner party, plated, my apartment, no theme." `identity.audience: "adults"`, `food.approach: "cook"`, `identity.tone: "intimate"`, no forced theme/direction fields set.
- **A-WATCH-01** "World Cup Final party, 20 people." Assistant asks team-affiliation *preference* (neutral vs one side); default recorded as `vibe.creativeDirection.teamNeutral: true` unless host opts in; `when.anchors` includes a `kickoff` anchor sourced as "assumed" until host confirms local time.
- **A-SUPERBOWL-01** Same shape as A-WATCH-01 with US sports vocabulary; no assumption about which team the host supports.
- **A-POTLUCK-01** "Potluck for my running club, 15ish." `contributions.mode: "potluck-list"`, seeds captured as free strings; no assumption about who brings what.
- **A-MIC-DENIED-01** Deny mic in the browser. Feature still works fully via `<TypingFallback>`; token still mints with `modalities: ["text"]`; draft fills the same way.
- **A-BARGE-IN-01** While assistant is mid-sentence, user speaks. Assistant's audio cuts within ~300 ms; server VAD interruption event fires; new user turn is captured cleanly.
- **A-CHANGE-01** Mid-conversation: "Actually make it Saturday, not Sunday, and 30 people not 20." `update_draft` overwrites `when.date` and `people.expectedCount` with new `updatedAt`, prior values retrievable in `talk_sessions` audit if `full` retention chosen (otherwise only latest kept).
- **A-RECONNECT-01** Kill network for 5 s. Client attempts reconnect with backoff. On success, session resumes with same `draftId` and last-known transcript; on failure, draft is safe and typing fallback offered.
- **A-DUPCONFIRM-01** Tap "Create the party" twice fast. `confirmDraft` returns the same `partyId` for both; only one row exists; navigation happens once.
- **A-COST-01** Simulate token cap. Model receives system nudge to wrap; session auto-ends at hard cap; `talk_sessions.cost_cents` recorded.
- **A-A11Y-01** Full keyboard-only flow: tab to Start, connect, submit typed message, open ReviewSheet, tab to Confirm. Every focusable element is reachable; SR announces state changes; passes axe on `/talk` in all major states.
- **A-REDUCED-MOTION-01** With `prefers-reduced-motion: reduce`, orb pulse and waveform are static; no confetti bursts fire during the session.
- **A-PRIVACY-01** Set retention to "none", end session. `talk_transcripts` has no row; `gathering_drafts.draft` retains structured fields only. "Delete my draft" removes both rows.
- **A-BUNDLE-01** `bun run build` output does not contain `sk-` OpenAI key or the phrase `OPENAI_API_KEY` in any client-shipped chunk under `dist/`.
- **A-RLS-01** Signed-in user B cannot read or mutate user A's draft; anon 401 on `/api/realtime/session` and every talk server-fn.

Plus unit tests for: draft patch merging (deep-merge with status precedence), createPartyFromDraft mapping (all fixtures), tool-input Zod schemas (reject unknown fields, reject over-length strings, cap arrays).

## 10. Non-goals (locked for V1)

- Always-on wake word / "Hey Confetti" without tap. **Not shipped.**
- Sending invitations, messages, SMS, or emails from the voice flow.
- Making purchases, adding to cart, or triggering vendor actions.
- Multi-party co-editing over voice (one host per session).
- Multiple simultaneous drafts per session.
- Full transcript retention as default (default is "summary only").
- Auto-seeding budget items, shopping items, or guest lists from voice — the party opens empty and the host fills it in with existing surfaces.
- Non-English voice UX polish. V1 targets `en-US` speech; the schema is locale-ready but only English prompts ship.
- Realtime translation, sentiment analytics, emotion detection.
- Server-side speech recording downloads.
- Offline mode.

## 11. Open questions before Batch 1

- **OD-1** Confirm `OPENAI_API_KEY` is acceptable as a new project secret (Lovable AI Gateway does not proxy OpenAI Realtime today; direct OpenAI call is the only viable path).
- **OD-2** Confirm the exact Realtime model + voice to use at ship time (this plan uses a placeholder — verify against OpenAI Realtime docs the day of implementation).
- **OD-3** Confirm retention default of "summary only" is acceptable; alternative is "none" default.
- **OD-4** Confirm 15-minute hard session cap and $0.50/session soft cap.
- **OD-5** Confirm `/talk` should be a full-viewport focused route (not a modal over the workspace).
