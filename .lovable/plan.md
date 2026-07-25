
# Confetti RC audit — gap register (planning only, no edits)

Basis: HEAD at/after `da2d04a` (working tree also shows `2586169 WIP`). Signals combined: source read of routes, `party-context.tsx`, auth surface, RSVP RPC, session route, migrations list, `tests/e2e`, `tests/unit`. Assertions below are grounded in the files cited; any inference not directly shown is called out as "unverified".

The bar: a stranger opens the app cold on a phone, hosts a real gathering end to end, invites guests, recovers from mistakes, and never feels the seams. Anything that breaks that promise is P0.

---

## P0 — release blockers

### P0-1. No way to delete a party
- **Harm**: A first-run user who creates a test party is stuck with it forever. Cannot recover from typos, wrong-holiday selection, or private/sensitive names. Signed-in users accumulate junk with no exit.
- **Evidence**: `src/lib/party-context.tsx` `Ctx` (L599–L603) exposes only `createParty`, `updateParty`, `cloneParty` — no `deleteParty`/`removeParty`. `rg` for `deleteParty|removeParty|Delete party` returns zero matches across `src/`. `Trash2` icons in `party.$id.tsx` are for sub-items (tasks/guests/bring/shopping), not the party itself.
- **Fix (bounded)**: Add `deleteParty(id)` to `PartyContext` — optimistic remove from local state, `supabase.from('parties').delete().eq('id', id)` when signed in, guard by RLS. Add a `<AlertDialog>` "Delete party" entry to the workspace overflow menu and the `/app` card menu with typed confirmation ("type the party name"). Show empty-state on `/app` when list becomes empty.
- **Acceptance**: Playwright — signed-out demo cannot delete seeded parties (button hidden or disabled with reason); as a scripted signed-in user, create a party, delete it, assert row absent after reload; alert dialog Escape/Cancel/keyboard-return.

### P0-2. Signed-out demo parties evaporate on reload
- **Harm**: The signed-out journey the landing page invites people into (Talk demo → New Party → workspace) is thrown away on refresh with no warning. A stranger who spent 5 minutes filling out a wizard will think the product is broken.
- **Evidence**: `party-context.tsx` L740–L748 seeds `[seedMaya, seedAvaLiam, seedGrad, seedWorldCup]` into `useState` and only persists via `supabase.upsert` when `user` is truthy (L781 `if (!user) return`). No `localStorage`/`sessionStorage` write path exists (`rg localStorage src/lib/party-context.tsx` empty).
- **Fix (bounded)**: Either (a) persist demo parties to `localStorage` (versioned key, size-capped, cleared on sign-in after a one-time merge), or (b) surface a persistent "Sign up to keep this" banner on every demo-party screen and disable actions that meaningfully mutate state without saving. Option (a) is the top-tier consumer choice.
- **Acceptance**: Unit — demo `PartyProvider` re-hydrates from mocked storage after remount. E2E — create demo party, reload, assert it's still there; sign in from that state, assert exactly one persisted copy in DB.

### P0-3. No password reset / recovery
- **Harm**: Standard auth affordance missing. A user who forgets their password is locked out of their real event with no recovery path. Failing this on a hosting product is release-blocking.
- **Evidence**: `src/lib/auth.tsx` exposes only `signIn`, `signUp`, `signOut`. `src/routes/auth.tsx` has no "Forgot password" link. No `/reset-password` route file. `rg reset-password|resetPasswordForEmail src/` empty.
- **Fix (bounded)**: Add `resetPasswordForEmail` to `useAuth`; add "Forgot password?" link on `/auth`; create `src/routes/reset-password.tsx` public route that handles `type=recovery`, calls `updateUser({ password })`, returns to `/app`. No new provider work.
- **Acceptance**: Unit — auth context method calls Supabase with `redirectTo=${origin}/reset-password`. Manual (documented, cannot fully E2E without email): confirm the route renders the form, validates the two-password confirm, and posts.

### P0-4. Guest RSVP surface has no rate limiting or abuse ceiling
- **Harm**: `submit_rsvp`, `claim_bring_item`, `release_bring_item` are token-scoped SECURITY DEFINER RPCs callable by anyone with a link. A leaked or brute-guessed token allows unbounded writes (500 items each; DB caps rows but not calls). No captcha, no per-IP throttling, no per-token cooldown. Real guests will not be attacked in a small beta, but a public product with shareable links needs a ceiling.
- **Evidence**: RPCs shown in `<db-functions>`: only cap `guests > 500` / `board > 500`. `src/lib/rsvp.functions.ts` (152 lines) is a thin wrapper — no throttle. No hCaptcha / Turnstile / edge rate limit configured (`rg captcha|turnstile|rate` returns only the realtime session's in-process concurrency).
- **Fix (bounded)**: (a) Add per-token debounce/cooldown in the RPCs — e.g. reject `submit_rsvp` calls faster than 1/sec/token, `claim_bring_item` faster than 2/sec/token — using a `last_action_at` timestamptz column on `parties` compared against `now() - interval '1 second'`. (b) Client-side disable-while-in-flight (already present for submit; confirm). Full IP throttling requires infra we should not add for beta — document as accepted risk with the DB ceiling in place.
- **Acceptance**: DB harness (`supabase/tests/rpc_harness.sql`) — two `submit_rsvp` calls in the same transaction, second raises rate exception; same for claim/release.

### P0-5. No legal / privacy / terms pages
- **Harm**: A consumer product that collects RSVP names, dietary info, allergens, host-notes, and event addresses without a privacy page is a launch blocker (App Store / GDPR / user trust). The AI voice feature raises the bar further.
- **Evidence**: `rg -l privacy|terms|legal|cookie src/routes/` returns nothing. Footer links do not exist in `src/routes/index.tsx` for legal pages (would surface in that grep).
- **Fix (bounded)**: Two static routes — `/privacy` and `/terms` — with reviewed copy that plainly describes: what personal data (host + guest names, RSVP counts, dietary/allergen tags, event location, host notes, voice audio for Talk), retention (until user deletes), subprocessors (Supabase/Cloudflare/OpenAI Realtime for voice), and how to request deletion. Add footer links on landing, `/app`, and RSVP guest page. Copy must be marked as maintained by app owner, not a certification.
- **Acceptance**: Routes render; footer links present at 375px and 1280px; axe scan clean; head metadata unique per route.

### P0-6. RSVP guest page and Talk have zero server-side observability of failures
- **Harm**: If the guest experience breaks in production, the host will hear about it from their guest, not from us. No way to triage.
- **Evidence**: `rg -l analytics|sentry|posthog|telemetry src/` empty. `src/server.ts` and `src/start.ts` show only local `console.error` + generic 500 page.
- **Fix (bounded)**: No third-party tracker in this batch (avoids consent + secrets). Instead, add a structured `console.error` schema on the three critical server functions (`get_rsvp_party`, `submit_rsvp`, `end_session`) with a redacted correlation ID (already exists for realtime — extend to RSVP), and document a documented log-search runbook. This is the "safe now" version; real Sentry/PostHog wiring is P1 and needs a secret decision from the owner.
- **Acceptance**: Unit — RSVP loader failure path emits `console.error` with `{ event, correlationId, statusCode }` and no PII.

---

## P1 — feel-of-a-product blockers

### P1-1. No Google OAuth on `/auth`
- **Harm**: Sign-up friction is the single biggest consumer drop-off; every peer product ships Google. Workspace convention (`cloud-auth-and-security`) says default to email + Google.
- **Evidence**: `src/routes/auth.tsx` has only email/password. No `signInWithOAuth` anywhere.
- **Fix**: Enable Google in Supabase auth config, add "Continue with Google" button on `/auth`, handle callback at existing origin (`/app`).
- **Acceptance**: Unit test that button posts `signInWithOAuth({ provider: 'google' })`. Manual OAuth E2E requires configured client — document as manual.

### P1-2. No offline / retry UX after save failure
- **Harm**: `persist` in `party-context.tsx` (L779–L830) toasts "Couldn't save changes" and stashes pending state — but never auto-retries. A user on flaky mobile loses saves until they trigger another edit.
- **Evidence**: L800 toast + L804 stash; no `setTimeout`/`retry`/`online` listener referencing `savingRef`.
- **Fix**: Add a `window.addEventListener('online', ...)` and a bounded exponential retry (max 3, jittered) inside `persist`. Keep the toast, add "Retry now" action.
- **Acceptance**: Unit — mock supabase reject then resolve; assert single successful upsert.

### P1-3. Destructive sub-item actions have no confirmation
- **Harm**: The party workspace has multiple `Trash2` buttons (tasks, guests, bring items, shopping). Accidental delete on mobile (44px targets in a dense list) is one tap away.
- **Evidence**: `src/routes/party.$id.tsx` L412, L573, L722, L841 — all direct-remove handlers per prior scans.
- **Fix**: Wrap each destructive handler in a lightweight `AlertDialog` OR a two-tap "confirm delete" inline pattern (first tap arms, second tap deletes, third-second timeout). Prefer inline for tap-count minimalism; keep AlertDialog for irreversible items (guests with RSVPs, bring items already claimed).
- **Acceptance**: E2E — clicking Trash once does not remove the row; second confirm removes it.

### P1-4. Delete/recover on party sub-items is not undoable
- **Harm**: Even with confirmation, real hosts want undo, especially for accidentally-removed guests.
- **Fix**: `sonner` toast with "Undo" action, restoring previous state within 5s; hold pending delete in a ref rather than optimistically writing.
- **Acceptance**: E2E — delete task, click Undo in toast, assert restored.

### P1-5. Duplicate-party UX is silent and hard to find
- **Harm**: `cloneParty` exists (`app.tsx` L320) but only via card menu; not surfaced from within a workspace after retrospective, which is exactly when a returning host wants to reuse a party.
- **Fix**: Add "Duplicate for next time" CTA on `/party/$id/reveal` when the event date is in the past OR retrospective is filled. Reuse existing `cloneParty` API — no new logic.
- **Acceptance**: E2E — seeded past party shows CTA; click creates a new party with reset runtime state (guests empty, tasks reset), navigates to it.

### P1-6. Bring Board and guest counts are not live between host and guest
- **Harm**: Guest claims an item, host doesn't see the change until manual reload. RSVP counter same. Feels sluggish for a party product.
- **Evidence**: No `supabase.channel()` / realtime subscription in `party-context.tsx` (grep-clean). Host workspace re-reads only on `refetch`.
- **Fix**: Subscribe to `parties` row changes for the current workspace only (postgres_changes filter on `id`). Merge into local state; skip if a save is in-flight for that row. Do NOT enable on the guest page (adds cost and unnecessary — one-shot RPC is fine).
- **Acceptance**: E2E — two-user (host in one context, guest in another) claim propagates within ~2s. If flaky in CI, mark as smoke and validate manually; acceptance requires two-context isolation like the existing `mobile-matrix` pattern.

### P1-7. `party.$id.tsx` (873 lines) is a maintainability & risk hotspot
- **Harm**: The workspace mixes tab logic, dialogs, destructive actions, and header metadata in one file. High-risk for regressions during any batch edit.
- **Fix**: Extract each tab body into `src/components/party/{tab}-tab.tsx` (theme/checklist/guests/bring/shopping/timeline are already partially extracted — finish the pattern). No behavior change.
- **Acceptance**: Existing unit + E2E pass unchanged; `wc -l src/routes/party.$id.tsx` under 300.

### P1-8. Empty and error states across the workspace are inconsistent
- **Harm**: Empty state polish is where consumer feel is won. Current empties are ad-hoc.
- **Fix**: Standard empty-state component with icon + one sentence + primary action. Apply to: no guests, no bring items, no shopping items, no tasks, no timeline entries, no host updates, no photo drop configured, no retrospective.
- **Acceptance**: Visual review at 375px and 1280px, axe pass, snapshot tests.

### P1-9. `/auth` has no email confirmation UX
- **Harm**: `signUp` in `auth.tsx` sends confirmation email but the UI just says "check your email" (or does it?). Users don't know what happened; may re-sign-up.
- **Evidence**: `src/routes/auth.tsx` 134 lines; needs verification that a post-signup state exists.
- **Fix**: If missing, add a persistent "Check your email at {redacted}@…" state; add "Resend confirmation" button gated to once per 60s.
- **Acceptance**: Unit — signUp resolves → UI shows confirmation state; second signUp with same email doesn't crash.

### P1-10. Server error page shows generic HTML with no way home
- **Harm**: `renderErrorPage()` in `src/lib/error-page.ts` (referenced from `server.ts`, `start.ts`) is the last-resort 500. If it's the generic "something broke" page with no link back to `/`, users bounce.
- **Fix (bounded)**: Include a "Back to home" link and Confetti wordmark in the HTML string.
- **Acceptance**: Unit — rendered HTML contains `href="/"` and `<title>` matches brand.

---

## P2 — polish and de-risking

- **P2-1**: `PartyProvider` wraps a plain `useMemo` — a rapid succession of `updateParty` calls schedules N persists but only guarantees the last "pending". Under a burst (drag-reorder, bulk import), older intermediate states won't hit the DB. Acceptable today; would matter with real-time collab.
- **P2-2**: `cloneParty` uses `JSON.parse(JSON.stringify(src))` — safe for current shape; add a shared `clonePartyShape` helper with a compile-time test if the Party shape gains any `Map`/`Set`/`Date` fields later.
- **P2-3**: `src/routes/index.tsx` (834 lines) — split into `LandingHero`, `LandingStory`, `LandingCTA` for edit safety.
- **P2-4**: `src/routes/talk.tsx` (851 lines) — same treatment, extract `TalkOrb`, `TalkTranscript`, `TalkErrorState`.
- **P2-5**: Add favicon + web manifest + PWA meta if missing (not in current audit set — verify).
- **P2-6**: OG image only on RSVP route today; add generic OG image on landing + `/talk` for shares.
- **P2-7**: `holiday-packs.ts` is 694 lines; content-heavy is fine, but consider splitting seasonal copy from schema types.
- **P2-8**: Sub-agent audit for a11y on `/party/$id/reveal` and `/party/$id/day-of` — high-density surfaces, likely missing `aria-live` on host-update feed and check-in count.
- **P2-9**: `PHASE4_QA.md`, `OPENAI_REALTIME.md`, `TESTING.md` are drifted docs; consolidate into `docs/` before beta so external contributors have one map.
- **P2-10**: No CI job for `bun run test:db`; add if a real Supabase local target is available in Actions (may require external service — accept as manual).

---

## Explicitly out of scope (must remain blocked without owner sign-off)

- **Real user data or email traffic**: no domain change, no email templates rewrite, no Supabase project reconfig beyond OAuth toggle documented above.
- **Sentry / PostHog / other observability with secrets**: requires the owner to add secrets and accept a subprocessor. P0-6 above uses only structured logs.
- **Payments/billing**: none in current product; leave for after beta.
- **Publish / custom domain**: no touch.
- **Service-role key work**: no changes; realtime session route already uses it correctly.

---

## Safe-to-execute now (batchable in one build turn, no external state)

1. P0-1 delete party + confirmation dialog
2. P0-2 demo localStorage persistence (versioned, capped)
3. P0-3 forgot-password link + `/reset-password` route + `useAuth.resetPasswordForEmail`
4. P0-5 `/privacy` and `/terms` static routes + footer links
5. P0-6 structured error logging with correlation IDs on RSVP loader/RPC wrappers
6. P1-2 auto-retry on `persist`
7. P1-3 destructive-action confirmations
8. P1-4 undo toast for sub-item deletes
9. P1-5 duplicate CTA on reveal for past events
10. P1-8 shared empty-state component + application to workspace tabs
11. P1-9 signup confirmation state + resend
12. P1-10 recovery link in fatal error page

## Must remain blocked until owner input

- P0-4 rate-limit migration — needs owner OK on schema change and on "one action per second" cap (tunable).
- P1-1 Google OAuth — requires Supabase provider config toggle by owner.
- P1-6 realtime — cost/quota decision; validate against Supabase realtime limits.

---

## Acceptance-test roll-up (per fix)

Each safe-to-execute item gets: a Vitest for logic, a Playwright spec that walks the actual user click path at 375px and 1280px, and axe assertion on any new route or dialog. Fix is not "done" until the journey has been walked, per workspace verification rule.

## Verification gaps this audit did NOT close

- Did not visually walk `/party/$id/day-of`, `/party/$id/reveal`, `/party/$id/photo-drop-editor` at 375px — mobile-matrix spec covers layout but not interaction depth.
- Did not verify `edit-details-dialog.tsx` returns focus to trigger on all mobile widths (dialog-contract covers New Party wizard only).
- Did not measure Talk session latency P50/P95 — infra + real audio required.
- Did not confirm whether every workspace tab has an empty state today; P1-8 assumes at least half don't.

Nothing above requires production secrets, real users, spend, external messages, billing, or domain changes.
