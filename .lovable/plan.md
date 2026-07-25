# Showroom Truth + Brand Continuity — execution plan

This batch spans landing, guest RSVP, host workspace tabs, and shared vocabulary — ~4,500 lines across the highest-signal files plus tests. To ship it responsibly in one pass I want to confirm scope and sequencing before editing.

## What I will implement in this batch

### 1. Sample guest invitation route (item 1) — new

- Add `src/routes/sample-invite.tsx` (no `$token`) that renders the real `rsvp.$token` guest UI against a **local demo adapter** — no RPC, no token, no user record.
- Extract the guest-facing view from `src/routes/rsvp.$token.tsx` into `src/components/guest-invite-view.tsx` so both routes share one presentation contract.
- Create `src/lib/sample-invite-state.ts`: versioned, capped `localStorage` state for the demo's RSVP/claims, with a persistent “Sample — try it. Nothing is sent.” banner and a Reset button.
- Point landing “Open a sample invite,” nav sample CTAs, and any other invite-preview links to `/sample-invite`. The host-workspace link to `/party/maya-8th` stays as “Peek at a sample workspace” (labeled truthfully).

### 2. Domain / URL truth (item 2)

- Replace every `confetti.app/rsvp/…` string with neutral copy (“Your private RSVP link,” “A link only your guests see”).
- Remove any other unsupported domain/marketplace/production claims from landing, share dialogs, invite dialog, footers, and metadata.

### 3. Vocabulary centralization (item 3)

- Add `src/lib/vocab.ts` exporting `VOCAB = { guestInvite, bringBoard, photoDrop, dayOf, reveal, hostNotes }`.
- Rewrite user-visible “Party Pass,” “Guest World,” “RSVP link,” and raw route/RPC names in `src/routes/index.tsx`, `party.$id.tsx`, `party.$id.day-of.tsx`, `party.$id.reveal.tsx`, `overview-tab.tsx`, `bring-board-editor.tsx`, `public-bring-board.tsx`, `invite-dialog.tsx`, `rsvp-share-button.tsx`.

### 4. Sample coherence (item 4)

- Rebuild Ava/Liam and Maya sample data so every surface agrees:
  - Budget total = sum of category allocations (fix the $12,500 vs $600 contradiction).
  - Shopping/Bring Board seeded to non-empty for showcased categories.
  - RSVP counts, headcount, timeline, updates internally consistent with a date computed via the new date-only contract.
  - Landing’s static "34 days out" and any mock date computed live from the seeded date via `daysUntilLocal`.

### 5. Empty states (item 5) — bounded

- Add branded, action-led empty states for: shopping, tasks, guests, bring, timeline, updates, photo drop, budget.
- One shared `<EmptyState>` component in `src/components/empty-state.tsx` (icon slot, headline in Fraunces, one primary CTA, warm cream card).
- Reuse across the 8 surfaces above.

### 6. Destructive-action safety + a11y labels (item 6)

- Repeated rows (guest name, bring item, task, shopping row, expense): every editable input gets an `aria-label` derived from `row.name || row.id`; every icon-only delete gets `aria-label={\`Remove \${row.name}\`}`.
- Delete affordance: `<ConfirmDelete>` wrapper.
  - Guest/bring rows with RSVP or claim data → AlertDialog confirmation.
  - Safe local rows (empty tasks, empty shopping) → immediate delete with undo toast (5s).
- All destructive icon buttons `min-h-11 min-w-11`.

### 7. Hero motif carry (item 7) — bounded

- Reuse existing `--gradient-*` and party-hands/sparkle motifs from landing on: workspace tab headers, empty states, and the Reveal/Day-of hero bands.
- No new animation libraries. Respect `prefers-reduced-motion` on the existing `celebrate()` calls (already throttled).
- Explicitly out of scope: redesigning individual form fields or reworking `theme-tab.tsx`.

### 8. Tests (item 8)

- Unit: sample-state isolation (no production writes), vocab constants, budget coherence invariant for seeded parties, empty-state renders.
- Playwright: nav truth (`/sample-invite` reachable from every advertised CTA), destructive confirm/undo, axe on landing + `/sample-invite` + `/app`, 320/375/390/430 overflow.
- Playwright is still unexecutable in-sandbox (missing `libglib-2.0.so.0`); specs will be added and lint-clean but I will report browser runs as not-executed-here.

### 9. Gates

- Prettier, ESLint, tsgo, Vitest (with new tests), TZ-matrix, production build. Playwright as caveated in #8.

## Explicitly NOT in this batch (call out for a follow-up)

- Refactoring `theme-tab.tsx` or Shopify surfaces.
- Any changes to auth flows, RLS, RPCs, or migrations.
- New animation libs, new fonts, or logo changes.
- Custom-domain wiring, publish, real messages, real analytics.

## Risk / size notes

Total edited surface ≈ 4,500 lines across ~15 files, plus ~6 new files and ~5 new test files. This is the largest batch to date; I will do it in one pass but the empty-state and hero-motif items (5, 7) will be applied only to the surfaces listed — I won’t chase every card in the app.

## Confirm or adjust

- Any of the 8 items you’d rather I defer, or any additional surface you want in scope?
- If “yes, proceed as written,” I’ll execute end-to-end and report SHA + gate totals.
