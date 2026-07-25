## Persistence Second-Pass Corrections — plan

Scope of this batch (coordinated with, not blocking, the queued Host Wizard batch). No deploy; unit-tested against the persistence store and adapters.

### Audit findings before implementing

Two of the seven items in the review are already fixed on `main`:

- **Item 1 (mixed conflict overlay)** — `party-store.resolveConflict` already overlays `pending.safeMergedValues` for BOTH `"mine"` and `"theirs"`. Auto-merged columns are preserved regardless of choice. This batch adds the missing test (local name + independently mergeable tasks + shopping) to lock it in.
- **Item 3 (raw error text in logs)** — `party-context.tsx` load and delete paths already only log `{ code }` from the Supabase error object; no `messagePreview`, no `error.message.slice(...)` anywhere in the persistence code. This batch adds an explicit redaction test (PII/secret at char 0) that asserts logs and toasts never contain it.

### Corrections implemented

1. **Item 2 — "Keep theirs" semantics + labels.**
   Current behavior (Option A): server wins for the semantically-conflicting columns, safe auto-merges from other columns still persist, and `saved` is only emitted after the follow-up write completes (or a fresh server-row event when nothing else changed). This is the intended semantics but the UI label doesn't communicate it. Rework the conflict card:
   - Impact-specific button copy per conflict column set. For guest/bring_board conflicts:
     - `Keep my version (may replace someone else's changes)` (mine)
     - `Use latest from cloud (drops my guest/claim edits)` (theirs)
   - For non-guest columns keep generic `Use mine` / `Use latest from cloud` labels.
   - Above the buttons show which local edits will still be persisted after "Use latest from cloud" so the user knows Saved doesn't lie.
   - Add a `party-store` unit test asserting: after `resolveConflict('theirs')` with independent local task edits, the store emits `state: 'saving'` then `saved`, the update patch contains the task change only, and a fresh `server-row` event carries the auto-merged party.

2. **Item 3 — log redaction contract.** Add `tests/unit/party-store-log-redaction.test.ts` that injects a `logError` spy and an `onEvent` toast spy, drives insert/update/conflict/permission errors whose messages contain `sb_secret_xxxx` / an email / a UUID, and asserts:
   - `logError` calls only contain the allowlisted keys (`op`/`partyIdLen`/`kind`/`attempts`).
   - No toast message string contains any of those literals.
   Same shape for `party-context` delete/load using a mock supabase.

3. **Item 4 — versioned, user-bound recoverable draft store.**
   New `src/lib/rejected-draft-store.ts`:
   - Storage key `confetti.rejectedDraft.v1`. Value = `{ version: 1, drafts: Record<userIdHash, Draft> }` capped at 4 KB per user, single draft per user.
   - `userIdHash = sha256(userId).slice(0,16)` — never store raw user id or email.
   - Draft payload contains only structural fields: `id`, `name`, `occasion`, `date`, `startTime?`, `location?`, `guestEstimate`, `budget`, `themeId?`, `holidayPackId?`, `hostNote?`, `timeZone?`. No guests, no bring board, no shopping items, no claim secrets, no host updates.
   - Strict Zod validation on read; corrupt payload is reset silently.
   - Written on insert-rejected event (only when authenticated). Cleared on successful insert or explicit discard.
   - `useRejectedDraftRecovery(userId)` hook exposes `draft | null` and `dismiss()`. `AuthedRoot` renders a `<ResumeRejectedDraftCard>` on `/app` when a draft for the current user exists but no matching party is loaded.
   - Change the "Not saved to the cloud" copy: `Kept in this browser tab. If you close it before Retry succeeds, the plan will be gone.` (removes the false "kept on this device" claim). When the recoverable draft is written successfully, append `Details are also saved to this browser for one recovery attempt.`
   - Unit tests: reload survives insert rejection; user A → user B never sees A's draft; corrupt JSON is reset; oversized payload is refused with a truthful `saveDraftResult.warning`.

4. **Item 6 — assertive live region + focus behavior.**
   - Split `<SaveStatus>` into a polite pill (saving/saved/offline) and an assertive card (`role="alert"`, `aria-live="assertive"`) that hosts the conflict and rejected banners. Conflict/rejected cards do NOT steal focus; the Retry / Use mine / Use latest buttons live inside the assertive region so screen readers announce them without a focus jump.
   - Component test: renders the alert with the right buttons for a guest conflict, verifies aria semantics and button labels.

5. **Item 5 — awaitable create/clone (coordination).**
   Add `createPartyAsync` and `clonePartyAsync` returning `Promise<{ id: string; result: 'saved' | 'pending-local' | 'rejected' }>` alongside the existing sync methods. Internals subscribe to `store.subscribe` (idempotency key = party id) and resolve when the party's next terminal state fires. Sync `createParty` remains for demo mode and stays immediate. The wizard/celebration is owned by the Host Wizard batch; this batch only exposes the API and a test.

### Not in scope this batch (explicit coordination flags)

- The wizard/celebration timing change (Item 5, second half) belongs to the queued Host Wizard batch. This batch only exposes the awaitable API.
- Deployment, secrets, external messages, and production data are untouched.

### Technical details

- `party-persistence.ts`: no change needed; `PendingConflict.safeMergedValues` already contains the mergeable overlay.
- `party-store.ts`: add `subscribe(id, listener)` (single-shot terminal-state notifier) for the awaitable API. Existing `onEvent` sink remains for provider bridging.
- `party-context.tsx`: adds `createPartyAsync`, `clonePartyAsync`; wires `rejected-draft-store` on `insertRejected` events and on `store.reset` (identity change → discard in-memory recovery, do not touch storage — the sha16 key already isolates users).
- No DB migration.
- No new npm packages.

### Test additions (approximate)

- `tests/unit/party-store-mixed-conflict.test.ts` — Item 1 assertion.
- `tests/unit/party-store-keep-theirs.test.ts` — Item 2 assertion including DB patch shape.
- `tests/unit/party-store-log-redaction.test.ts` — Item 3.
- `tests/unit/party-context-load-log-redaction.test.ts` — Item 3 across load/delete.
- `tests/unit/rejected-draft-store.test.ts` — Item 4 (reload/cross-user/corrupt/quota).
- `tests/unit/save-status.test.tsx` — Item 6 semantics + labels.
- `tests/unit/create-party-async.test.ts` — Item 5 (awaitable saved / pending-local / rejected states).

Full gates (format, lint, typecheck, tests, build) run at the end; SHA reported.
