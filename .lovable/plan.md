# Showroom Independent Review Corrections — Plan

Nine items; ordered by risk. All work is post-deploy queued, no external side effects.

## 1. Shared GuestInvite presentation + adapter (item 1, 3)
- New `src/components/guest-invite/` module:
  - `types.ts` — `GuestInviteAdapter` interface: `party`, `submitRsvp`, `refresh`, `receipts`, `bringBoard` (list/claim/release/updates), `photoDrop`, `hostUpdates`, `calendar`, `sampleMode` flag, save-state signals.
  - `GuestInviteView.tsx` — the entire presentational tree currently duplicated across `rsvp.$token.tsx` and `sample-invite.tsx` (hero, RSVP form with household/dietary/allergens/Other, response-specific success cards, count chips, Bring Board via `PublicBringBoard`, Photo Drop, host updates, calendar/directions, error/refresh banner). Only banners differ per-adapter (production "your private link" vs sample "showroom" banner).
- `src/lib/rsvp-production-adapter.ts` — wraps existing RPC/refetch/receipts.
- `src/lib/rsvp-sample-adapter.ts` — wraps `sample-invite-state`; enforces open-only claim, mine-only release, requires `guestName`, hides PII on others' claims, shares production count semantics (people for yes, households for maybe).
- Rewrite `rsvp.$token.tsx` and `sample-invite.tsx` as thin route shells that pick the adapter and render `GuestInviteView`.
- Contract tests: `tests/unit/guest-invite-adapter.contract.test.ts` runs an identical scenario suite against both adapters (invalid input, claim races, release semantics, counts, refresh failure).

## 2. Strict sample state (item 2)
- Already zod-strict at schema level; harden further:
  - Require `id` regex + explicit dangerous-key denylist (already partial) applied inside `.map`/`.array` refinements.
  - Per-string UTF-8 byte cap (not just length) via `superRefine`.
  - Cap total bring bytes independently of MAX_BYTES; return typed error surfaced inline in UI.
  - `loadSampleState` returns `{ state, corruption?: "oversize"|"invalid"|"quota" }` so the view can show inline banner instead of silently resetting.
- Fuzz tests: random payloads, prototype-pollution attempts (`__proto__`, `constructor`), oversize strings, duplicate ids, non-array bring, unknown keys.

## 3. Sample claim/release correctness (item 3)
- Move claim/release logic out of route into `rsvp-sample-adapter`:
  - `claim(id, guestName)` — 400 if name missing, 409 if not open.
  - `release(id)` — 403 unless `claimedByMe`.
  - Never expose claimer names; render "Claimed" only.
- Counts: adopt production semantics — `yes` = adults+kids, `maybe` = 1 per household. Copy updated to "people going / households considering".

## 4. ConfirmDelete Slot pattern (item 4)
- Refactor `src/components/confirm-delete.tsx` to a render-trigger contract:
  - `mode="confirm"` uses `AlertDialog.Trigger asChild` around a required `trigger` render prop; async `onConfirm` returning `Promise<{ok:boolean; error?:string}>`; keeps dialog open on failure with inline error.
  - `mode="undo"` returns a single `Slot`-wrapped trigger (`@radix-ui/react-slot`) forwarding onClick; the toast handles undo, not a wrapping button.
- Tests: DOM nesting (`expect(document.querySelectorAll('button button')).toHaveLength(0)`), keyboard activation, focus return, accessible name, async failure keeps dialog open.

## 5. Undo restoration + persistence (item 5)
- Undo API in `PartyStore` gains `snapshot: {index, record}` per removal type.
- Restore inserts at original index; on persistence failure show a Retry action in the toast; never show "Undo" unless a snapshot exists.

## 6. Cross-surface removal semantics (item 6)
- Audit and wire per surface:
  - **Guests** (has RSVP) → `mode="confirm"` with impact copy ("X responded yes, Y bringing items").
  - **Shopping** (purchased or non-zero cost) → confirm; else undo.
  - **Bring** (claimed) → confirm; else undo.
  - **Timeline** slots → undo (safe).
  - **Expenses** → confirm.
  - **Tasks** (empty label / not done) → undo; done → confirm.
  - **Party delete** already confirm; verify tombstone recovery copy.
- Remove hover-only affordances at <768px; always-visible icon button ≥44px with `aria-label`.

## 7. Empty states (item 7)
- Use `EmptyState` in: shopping-tab, checklist, guests, bring-board editor, timeline (day-of), host updates, photo drop, budget summary.
- Each has one primary action wired to the actual "add" control (focuses the input or opens the dialog).
- Tests assert action element existence + focus target.

## 8. Landing countdown (item 8)
- Replace fixed Aug 15 in `src/routes/index.tsx` with dynamic "next weekend after today+21d" computed via `date-only` utilities, or a static illustrative label ("21 days from tap") if the sample workspace uses relative dates. Choose dynamic; keep seed workspace using same helper so nothing contradicts.

## 9. Tests + gates (item 9)
- New/updated specs:
  - unit: `guest-invite-adapter.contract`, `sample-invite-state.fuzz`, `confirm-delete.dom`, `party-store.undo-snapshot`, `landing-countdown`.
  - e2e: `sample-invite-isolation.spec.ts`, `destructive-confirm-undo.spec.ts`, `overflow-taps.spec.ts` at 320/375/390/430, `axe.spec.ts` (RSVP + sample + workspace).
- Run: prettier, eslint, tsgo, vitest, playwright, build. Report SHA + actual test counts.

## Deferrals / clarifications
- Photo Drop and host updates on sample: shown as read-only demo strips (no local persistence for uploads); the sample adapter exposes fixed illustrative data. Flag in banner.
- Calendar/directions on sample: static demo values; ICS export still works (uses date-only helpers).
- If shared adapter refactor forces changes in `PublicBringBoard` prop shape, keep the current export as a thin wrapper around the adapter-driven component for backward compat.

## Files touched (approx.)
- New: 5 (adapter types/view/two adapters/contract test dir)
- Rewritten: `rsvp.$token.tsx`, `sample-invite.tsx`, `confirm-delete.tsx`, `sample-invite-state.ts`
- Edited: `party-store.ts`, `overview-tab.tsx`, `shopping-tab.tsx`, `bring-board-editor.tsx`, checklist/timeline/host-updates surfaces, `index.tsx`, several small components
- Tests: ~8 new spec files

Estimate: large batch; deliver as a single commit, run all gates, report exact SHA and counts.
