# P0 Signup Continuity + Draft Import Batch

Goal: no work is lost across the signed-out → signed-in boundary, and no other user's data is ever silently imported.

## 1. Safe returnTo (auth)

New `src/lib/safe-return-to.ts`:
- `sanitizeReturnTo(input): string | null` — accept only same-origin, single-leading-slash paths from a fixed allowlist prefix set (`/talk`, `/app`, `/party/`, `/sample-invite`, `/reveal`, `/day-of`). Reject protocol-relative (`//x`), `\`, absolute URLs, `javascript:`, `data:`, `mailto:`, and any path containing `..`.
- Unit tests for every rejection class + accepted cases.

Wire into `src/routes/auth.tsx`:
- Read `returnTo` from search params via TanStack search validator (Zod, string, max 512).
- After successful sign-in / sign-up-with-session, `navigate({ to: sanitizeReturnTo(returnTo) ?? "/app", replace: true })`.
- CTAs from `/talk` (signed-out) and `/app` link to `/auth?returnTo=…`.

## 2. Signed-out Talk handoff (local, versioned)

New `src/lib/talk-handoff.ts`:
- Zod schema v1:
  - `version: 1`
  - `createdAt: number` (ms), TTL 24h
  - `idempotencyKey: string` (uuid) — stable per handoff, regenerated only on new save
  - `messages: Array<{ role: "user" | "assistant"; text: string }>` — cap 60 messages, each ≤ 2 KB UTF-8
  - `patch: DraftPatch` (reuse existing Zod from `src/lib/talk-schemas.ts`)
  - `summary: string` (≤ 500)
- Byte cap: reject serialized payload > 32 KB. No audio, no provider blobs, no tokens.
- API: `saveHandoff`, `readHandoff` (returns `null` on missing/expired/corrupt/oversized), `clearHandoff`, `markClaimedBy(userId)` (writes a sibling `claimedBy` marker so a later different sign-in cannot silently reuse an already-claimed handoff).
- Signed-out `/talk` writes handoff on each turn (debounced) using the deterministic patch already produced by talk-brain.

## 3. Post-signup Talk resume

- `/talk` component: on mount, when signed in and `readHandoff()` returns fresh + unclaimed OR claimed-by-current-user, render `<ResumeHandoffCard>` before starting a new session.
- Card actions: **Continue** and **Discard**.
- Continue:
  1. `markClaimedBy(currentUserId)` (idempotent — no-op if already claimed by same user).
  2. Insert `gathering_drafts` row (RPC or direct insert under RLS) using an insert idempotency key derived from `idempotencyKey + userId`. Server-side unique index prevents double import across refresh/double-click. If a row with that key already exists, reuse it.
  3. Validate + import capped messages/patch into that draft.
  4. Only on canonical server success (row returned): `clearHandoff()`.
  5. Resume the normal Talk flow rooted at that draft (existing preview/confirm path).
- Discard: `clearHandoff()`, start fresh.
- Cross-account rule: if handoff exists but `claimedBy` is a different user, hide the resume card entirely (never surface other-account work). Do not delete — leave until TTL, so the original claimer on the same device can still resume.

New DB migration:
- `ALTER TABLE public.gathering_drafts ADD COLUMN IF NOT EXISTS import_idempotency_key text`.
- `CREATE UNIQUE INDEX IF NOT EXISTS gathering_drafts_user_import_key_uniq ON public.gathering_drafts (user_id, import_idempotency_key) WHERE import_idempotency_key IS NOT NULL`.
- No grant changes.

## 4. Local planner import review

`src/lib/demo-storage.ts` → v2 schema (forward-only migration in-file):
- Each stored party gains `origin: "curated" | "user"` and `edited: boolean`.
- Curated seeds tagged `origin: "curated"`, `edited: false` at seed time. Any user edit flips `edited: true`. New parties created signed-out get `origin: "user"`.
- v1 → v2 migration: mark existing parties `origin: "user"` only if their id is NOT in the known curated-seed id set (`ava-liam`, etc.); everything else becomes `curated, edited:false`.

New `src/components/import-review-dialog.tsx`:
- Shown once after signup on `/app` when `readImportCandidates()` returns any user-created or edited party.
- Lists only `origin === "user"` OR `edited === true`. Curated samples never listed, never imported.
- Per-row status: pending / importing / imported / failed(retry).
- Uses the existing PartyStore queue (`enqueueInsert`) for canonical persistence; per-party idempotency key = `local:{localId}` stored server-side in a new column `parties.import_local_id text` with a partial unique index `(user_id, import_local_id)`.
- ID collision: if server already has a row with that key, treat as success; drop local copy.
- Success → remove from local storage; failure → keep local + surface Retry. "Discard" per row and "Discard all remaining" available.
- Only after all successes is `clearDemoState` allowed to touch imported entries. Failures stay recoverable.

Remove the current unconditional `clearDemoState` on auth in `PartyProvider`; replace with "on identity change, open ImportReviewDialog if candidates exist, otherwise no-op."

## 5. Account isolation

- Handoff is device-local and has no account identity until Continue. Cross-account safeguard = `claimedBy` marker (§3).
- Local planner import candidates are device-local; the review dialog only offers import to the currently signed-in user. If user switches accounts before importing, the same dialog reappears for account B with the same candidates (still device-local work). Once a party is imported (server row exists with `import_local_id`), the local entry is removed and cannot be re-imported by anyone.
- PartyStore reset-on-identity (already implemented) is unchanged.

## 6. Auth UX preservation

- `/auth` retains typed values across submission errors, visible focus rings, `aria-live="polite"` status region for success/error text.
- Email-confirmation-required path: handoff/candidates persist locally (TTL 24h) and the resume/import surfaces trigger on the next successful signed-in session, not on the pre-confirmation state.
- Cancel/back leaves local work intact — no destructive action fires until explicit Continue/Import.

## 7. Tests

Unit (`tests/unit/`):
- `safe-return-to.test.ts`: allowlist + all rejection classes.
- `talk-handoff.test.ts`: save/read/expiry/oversized/corrupt JSON/version mismatch/claimedBy isolation.
- `demo-storage.test.ts` additions: v1→v2 migration correctness, curated exclusion, edited flag flip.
- `import-review.test.ts` (component): renders only user/edited entries; retry on failure; idempotency (double-click → single enqueue); discard.

E2E (`tests/e2e/`):
- `talk-handoff.spec.ts`: signed-out Talk → simulated signup (auth stub via existing test harness) → resume card → Continue → exactly one draft row (assert via a debug-only server fn already in the harness, or via the RPC returning `already_confirmed`).
- `local-import.spec.ts`: signed-out new party → signup → import review → Continue → exactly one party row; curated seeds absent from dialog; partial failure retry; discard; refresh mid-flow; double-click Continue.
- `return-to.spec.ts`: malicious `returnTo` values fall back to `/app`.
- `account-isolation.spec.ts`: sign in A, save handoff, sign out, sign in B → resume card hidden.

## 8. Copy + gate

- Update landing/`/talk`/legal copy: "Your in-progress notes are saved on this device for 24 hours so you can pick up after signing in. Nothing is sent to our servers until you sign in and choose Continue."
- Run: `bun run format`, `lint`, `tsgo`, unit coverage, `build`, full Playwright.
- Report SHA + totals + note that real auth email confirmation cannot be exercised end-to-end in CI (documented limitation).

## Technical notes

- Schema names: `TalkHandoffV1`, `DemoPartyV2`. Both live behind small readers that return `null` on any validation failure — never throw into UI.
- No new secrets. No production data. No deploy. No domain changes.
- Migration is additive (new nullable column + partial unique index); safe forward-only.
- All new local writes wrapped in `try/catch` to survive Safari private mode / quota errors (return `false` from save; UI degrades to "not saved locally" note).

## Out of scope (explicit)

- Server-side pending-invite / cross-device handoff.
- Importing curated samples.
- Any change to RLS on `parties` or `gathering_drafts` beyond the two additive columns/indexes.
- Auth provider changes (Google/etc.).
