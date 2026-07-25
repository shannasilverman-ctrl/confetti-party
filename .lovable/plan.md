## Host Creation + First-Run Completion — Implementation Plan

Scope is broad and coordinates schema + domain + UI + tests. Presenting the plan for approval before touching code, because it introduces a new persisted column (host timezone) and rewrites the wizard.

### 1. Schema migration — host timezone

Add `time_zone TEXT NULL` to `public.parties`, cap length ≤ 60 in `confirm_gathering_draft` (regex `^[A-Za-z0-9_+\-/]+$`), extend `get_rsvp_party` return with `time_zone`. Existing rows stay NULL → "timezone not set" fallback; no guessing on read. No new grants (existing table).

### 2. Domain & persistence plumbing

- `src/lib/types.ts` (or wherever `Party` lives): add `timeZone?: string`.
- `src/lib/party-persistence.ts`: read/write `time_zone` in `rowToParty` / `partyToColumns`; include in `updatable-columns` diff.
- `src/lib/talk-materialize.ts`: accept `timeZone` from draft when present.
- `src/lib/party-context.tsx` `createParty` input, `makeParty` builder, `Ctx` type: accept `timeZone`.
- `src/routes/rsvp.$token.tsx`: display "Times shown in {tz}" when set; keep floating-time disclosure only when unset.
- `src/lib/ics.ts` calendar export: if `timeZone` present, include `TZID` on `DTSTART`; else keep floating.

### 3. Wizard rewrite (`src/routes/app.tsx`, `NewPartyWizard`)

Extract into `src/components/new-party-wizard.tsx` (~450 lines) to keep `app.tsx` tidy. Structure:

- New Zod schema `wizardSchema` per step with trimmed name (1..80), date required (past allowed only with `allowPast` flag, default disallow), wall-clock time via `parseWallClockTime`, guests integer 1..500, budget integer 0..1_000_000, location ≤ 200, timezone required IANA (default `Intl.DateTimeFormat().resolvedOptions().timeZone`, `Intl.supportedValuesOf('timeZone')` when available; else regex fallback).
- Inline per-field aria-live errors; preserve inputs on submit failure; focus first invalid field.
- Stepper: `<ol aria-label="Wizard steps">` with `aria-current="step"` on active; visually-hidden "Step N of 3" label.
- Dirty tracker: intercept `onOpenChange(false)` with confirm dialog when any field changed.
- Enter-to-advance: form-level `onSubmit` with `submitLockRef` to block double-submit.
- Zero-theme fix: when `themeOptions.length === 0`, provide a real neutral "Un-themed plan" default card that sets `theme = { id: 'none', name: 'Un-themed', … }`; button always enabled.
- Creation contract: for signed-in users, await async `createParty`, keep dialog on error with Retry + "Download plan JSON" for recovery; only advance to "done" when persisted (or explicitly demo). Idempotency guard via `submitLockRef` + a one-shot `createdIdRef`.
- Post-create "Open plan" navigates to `/party/$id` (unchanged).

`createParty` in `party-context.tsx` needs an async variant returning `{ id, error }`. Wrap existing sync return; when authenticated, await `store.enqueueInsert` result; when demo, remains sync-succeeding.

### 4. Party-context async create surface

Add `createPartyAsync(input) => Promise<{ id: string; error: FriendlyError | null }>` alongside existing sync `createParty`. Signed-in path awaits PartyStore insert; failure returns `insertRejected[id] = true` and the friendly error, keeping the local draft recoverable.

### 5. Tests

- `tests/unit/wizard-schema.test.ts`: zod contract — name trimming/caps, date past/future, time parsing, guest integer bounds, budget bounds, timezone allowlist, location cap.
- `tests/unit/party-timezone.test.ts`: `rowToParty` / `partyToColumns` round-trip; NULL fallback.
- `tests/e2e/wizard-first-run.spec.ts`: 5 occasions (Birthday, Holiday+starter, BBQ, Watch, Other) × [320, 390, 1280]; keyboard tab through; invalid name/date/time/numbers show inline errors; no-theme "Un-themed" path completes; dirty-close confirms; duplicate-click creates one; reload persists; Open plan lands on `/party/:id`; edit details persists; delete confirms.
- `tests/e2e/wizard-persistence.spec.ts`: DB insert reject → recoverable draft state; retry succeeds without duplicate.

E2E uses signed-out demo storage (isolated per test via `sessionStorage` key namespace) and mocks Supabase via `page.route('**/rest/v1/parties*', …)` for auth-path tests.

### 6. Gates

- `bun run format` + `bunx eslint` clean
- `bunx tsgo --noEmit` clean
- `bunx vitest run` — target ~285 passing (adds ~10-15 unit tests)
- `bunx playwright test` — spec runs at 3 viewports
- `bun run build` — no chunk regressions

### 7. Out of scope

Talk materializer invariants sharing: verify contract via test-only import, no behavior changes. No email/OAuth/domain/publish/marketplace touched.

### Open questions

- Timezone editability UX: dropdown of `Intl.supportedValuesOf('timeZone')` (~600 items) or typeahead? Plan: shadcn Combobox with default = detected zone, searchable. If Combobox lookup misses (older browsers), fall back to `<Input>` with regex validation.
- Past-date policy: default is "today or future"; add a small "This already happened (retrospective)" checkbox that unlocks past dates. This preserves memory/retro flows without a footgun.

Estimated diff: ~1200 LOC net (mostly new tests + wizard extraction). No production data or deploy; test users only.
