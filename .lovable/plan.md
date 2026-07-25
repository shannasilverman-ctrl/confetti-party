
## Depth: Standard plan
Cross-cutting but scoped to one coherent path. Deeper dives (day-of live sync, vendor APIs) intentionally deferred.

## Verified current state
- Talk route (`src/routes/talk.tsx`), WebRTC client (`src/lib/talk-client.ts`), token mint route (`src/routes/api/realtime/session.ts`), and draft schema (`src/lib/gathering-draft.ts`, `gathering_drafts`/`talk_sessions`/`talk_transcripts` tables with owner-only RLS) already exist.
- `OPENAI_API_KEY` is **not** in project secrets → the realtime mint currently returns 503 in production. `LOVABLE_API_KEY` **is** present, so text-mode AI can ship today via Lovable AI Gateway. Voice remains an optional layer.
- Party model (`src/lib/party-context.tsx`) is occasion-enum based (`birthday | baby-shower | graduation | holiday | dinner-party | game-day | cookout | other`). No holiday packs, no households, no bring-board, no photo-drop, no day-of mode.
- RSVP path is solid: `parties.rsvp_token`, `get_rsvp_party`/`submit_rsvp` SECURITY DEFINER RPCs granted to `anon`, public `/rsvp/$token` page with SSR OG tags and host note.
- Design system: warm Confetti tokens, `festive` button variant, `celebrate()` helper, `ConfettiBurst`/`fireCannon`. Reuse everywhere — no new libraries.

## 1. AI integration boundary (ship text now, voice when key exists)
- New `src/lib/ai.server.ts`: wraps Lovable AI Gateway (`ai.gateway.lovable.dev/v1`, `openai/gpt-5.5`) using `LOVABLE_API_KEY` from `process.env`. Never imported from client.
- New `src/lib/talk-brain.functions.ts` (`createServerFn`, `requireSupabaseAuth`): `sendTurn({ draftId, messages })` returns `{ reply, draftPatch, openQuestions, assumptions }` using structured `Output.object` against the existing `GatheringDraft` shape. Persists deltas onto `gathering_drafts.draft` (JSON merge) and writes summary lines to `talk_transcripts` when retention ≠ `"none"`.
- New `applyDraftPatch()` pure helper (unit-tested) that merges Field<T> patches with provenance + `updatedAt` and appends assumptions/open questions without duplicates.
- Voice: `/api/realtime/session` unchanged; when `OPENAI_API_KEY` missing, UI hides the mic and shows "Voice comes back when the key is set" — text mode remains fully functional.
- **Deterministic demo fallback**: if `LOVABLE_API_KEY` is also missing OR the caller is the demo user, `sendTurn` routes to `demoBrain()` — a scripted response tree seeded from keywords (thanksgiving, shabbat, headcount, budget, potluck…) that fills the draft the same way. No fake "AI is thinking" — UI labels it "Demo co-host."

## 2. Talk-it-out intake, text-first with voice fallback
Rework `src/routes/talk.tsx`:
- Default mode: **text chat** using `useChat`-style transport pointing at `/api/talk/turn` (new server route wrapping `sendTurn` for SSE streaming). Voice toggle appears only when `/api/realtime/session` returns 200.
- Browser-native voice **input** fallback: `window.SpeechRecognition || webkitSpeechRecognition` populates the composer; no server round-trip, gracefully hidden when unsupported. Distinct from full-duplex Realtime.
- Right rail becomes **"What I'm hearing"**: live `GatheringDraft` summary — chips for date certainty, headcount, budget stance, food approach, constraints, open questions. Each chip editable inline (host-edited provenance).
- Confirm gate: "Create the party" button disabled until draft has `identity.workingTitle`, `when.date` (or window), `people.expectedCount`, and no `blocking` open questions. Confirmation calls new `confirmDraft` server fn that maps `GatheringDraft` → `Party` insert (see §4) and navigates to `/party/$id?reveal=1`.

## 3. Holiday Hosting mode + packs
- New `src/lib/holiday-packs/` directory. One file per pack: `thanksgiving.ts`, `friendsgiving.ts`, `shabbat.ts`, `hanukkah.ts`, `christmas.ts`, `passover.ts`, `easter.ts`, `diwali.ts`, `eid.ts`, `lunar-new-year.ts`. Each exports:
  ```ts
  { id, label, blurb, anchors: Anchor[], rituals: Ritual[], suggestedMenu: MenuSeed[],
    bringBoardSeeds: BringSeed[], taskSeeds: TaskSeed[], toneDefaults, respectNotes }
  ```
  All rituals/menu items carry `optional: true` and a `respectNote` (e.g. Shabbat candle-lighting time derived from sundown; kosher/halal notations are hints not defaults).
- New `src/lib/holiday-packs/index.ts` with `listPacks()`, `getPack(id)`, `applyPackToDraft(draft, packId, opts)` that appends but never overwrites host-stated fields.
- `OccasionType` extends with `"holiday"` staying, plus a new `holidayPackId?: string` on `Party` and `GatheringDraft.identity.holidayPackId: Field<string>`.
- Opt-in UX: in Talk, when the brain detects a holiday keyword it proposes "Want to use the Thanksgiving pack? (rituals stay optional)" — never auto-applies. Pack picker also available from Reveal.
- Reference demo: seeded "Friendsgiving 2026" party using the Thanksgiving pack — full menu, bring board, timeline, and Party Pass populated.

## 4. Holiday/Party Reveal
- New route `src/routes/party.$id.reveal.tsx` (child under existing `party.$id`, or a full-page mode gated by `?reveal=1`).
- Sections in a single scroll: **Brief** (from draft), **Assumptions** (accept/edit chips), **Decisions** (date, headcount, budget stance, food approach — inline edit), **Menu**, **Budget snapshot**, **Guests + Households**, **Task timeline**, **Shopping**, **Vendors** (empty state: "no vendor connections yet — plan manually"), **Risk flags** (weather, dietary conflicts, timing), **Next 3 actions** (top of page, pinned).
- Regenerate button re-runs `sendTurn` with the current draft and diffs the reveal; every change is a discrete host approval, never silent.

## 5. Households + Smart Bring Board
- Data model (migration): extend `parties.guests` jsonb entries with `householdId?: string`, `dietary?: string[]`, `allergens?: string[]`. New jsonb column `parties.households` (`[{ id, label, memberGuestIds[] }]`) and `parties.bring_board` (`[{ id, category, label, qty, unit, dietaryTags[], assigneeHouseholdId?, assigneeName?, status: "open"|"claimed"|"done", source: "host"|"guest", notes? }]`).
- `submit_rsvp` extended (new migration, `CREATE OR REPLACE`) to accept optional `household_label`, `dietary text[]`, `allergens text[]`; only appends, never returns them to `get_rsvp_party`.
- New RPCs granted to `anon`, scoped by token:
  - `list_bring_board(token uuid)` → items with claim state but no host PII.
  - `claim_bring_item(token, item_id, guest_name, household_label, qty?)` → optimistic-lock (`status='open'` required), auto-creates household on first use.
  - `release_bring_item(token, item_id, guest_name)`.
- Host UI: new `src/components/bring-board-tab.tsx` — categories (Main, Sides, Dessert, Drinks, Ice/Serveware, Kids, Décor), duplicate detection (fuzzy label match), missing-category warnings from the active holiday pack, host override (reassign / bump qty / close), "Copy guest link" reuses `rsvp_token`.
- Guest UI: new section on `/rsvp/$token` — "What to bring" list with claim/unclaim, quantity picker, dietary badges. Fully no-account.

## 6. Party Pass (guest page) upgrade
Extend `src/routes/rsvp.$token.tsx`:
- Household RSVP: single form can add self + members with names, ages (kid/adult), dietary + allergen chips.
- Sections: hero, host note, schedule (from `startTime` + pack anchors), directions (existing), **What to bring** (§5), **Updates** (host-posted notes — new `parties.host_updates` jsonb, read via extended `get_rsvp_party`), **Photo Drop** (§8, read-only link + QR).
- Mobile-first: single-column, 44px tap targets, sticky primary CTA, offline-tolerant (last-good SSR snapshot).

## 7. Day-of Host Mode
- New route `src/routes/party.$id.day-of.tsx` (auto-suggested from Reveal when `daysUntil(party) <= 1`).
- Calm mobile-first layout: top card = **Next 3 actions** (derived from tasks with `dueAt <= now + 2h` and open bring-items), timeline scrubber (pack anchors + custom), arrivals list (guests with `checked_in` bool — new field on guest jsonb, host-only toggle), late/missing items (unclaimed bring-board within 2h of start), risk banner.
- One-tap reassignment reopens bring items and copies a short "still need: X" message to clipboard. **No auto-send.**

## 8. Confetti Photo Drop (metadata only)
- Migration: `parties.photo_drop jsonb` = `{ provider: "dropbox_request"|"google_photos"|"kululu"|"guestpix"|"custom", url, label?, note?, updatedAt }`.
- Host UI: new `src/components/photo-drop-card.tsx` — provider picker with per-provider help ("Create a Dropbox File Request, paste the URL"), URL validator (`https://`, provider allowlist for known hosts + `custom`), privacy copy ("Confetti never sees your photos; guests upload directly to your account"), QR generated client-side with `qrcode` (add as dep — pure JS, Worker-safe), copy/share/download PNG, printable sign (A5 PDF via `html-to-image` already in project).
- Guest-side: read-only card on `/rsvp/$token` with the same QR and a "Open uploader" button.
- No proxy, no ingest, no storage bucket.

## 9. Cohesive UX + accessibility
- New `src/components/app-shell.tsx` shared across `/app`, `/party/$id`, `/party/$id/reveal`, `/party/$id/day-of`, `/talk` — same top bar, brand, breadcrumbs, seasonal banner, footer. Kills current tab-drift between routes.
- Reveal, Bring Board, Party Pass, Day-of Mode all use existing tokens + `festive` variant + `celebrate()`. No new palettes.
- Every new surface: empty state ("Nothing here yet — talk it out"), loading skeleton, error boundary (`errorComponent`/`notFoundComponent` on new routes), 375px verification pass.
- Accessibility: `aria-live` on Talk transcript and Day-of arrivals, focus rings on all interactive tokens, radio/checkbox groups labeled, prefers-reduced-motion honored by `celebrate()`.

## 10. Trust, security, tests
- **RLS**: all new columns/tables owner-scoped. Public reads only through SECURITY DEFINER RPCs with tight column projection.
- **Tokens**: `rsvp_token` already unguessable v4 UUID; bring-board writes are scoped by the same token and item-id, with `status='open'` optimistic lock to prevent double-claim races.
- **Rate limits**: `sendTurn` server fn checks per-user requests/min via existing `talk_sessions` bucket pattern (add `ai_turns` count column). `/api/realtime/session` already limits mints; extend to also cap text turns.
- **Validation**: every server fn uses Zod `.inputValidator`. URLs (photo drop) validated against allowlist + `https:` + max length. Names/notes trimmed and length-capped.
- **Approval gates**: reveal edits, bring assignments, host updates, and message drafts require host tap. Nothing auto-sent. No vendor booking in v1.
- **Analytics hooks**: `src/lib/analytics.ts` with a `track(name, props)` no-op default that logs in dev; call sites in Talk, Reveal confirm, Bring claim, Photo Drop set, Day-of open.
- **Tests** (`bunx vitest`):
  - `applyDraftPatch` merge rules (provenance, no-clobber of host-edited).
  - `holiday-packs/thanksgiving` fixture → reveal produces expected menu, tasks, bring seeds.
  - `bring-board` claim race: two claims on same item → one wins.
  - `submit_rsvp` still respects wildcard-escaped names + null rsvp rejection (regression).
  - `photo-drop` URL validator: rejects `javascript:`, non-allowlisted host, oversize.
- **Playwright journey**: Talk (demo mode) → confirm Friendsgiving → Reveal → seed bring board → open `/rsvp/$token` in second context, claim an item, RSVP household of 3 with dietary → back to host, see claim + household → Day-of mode shows next actions.

## Data model / migrations (in order)
1. `alter table public.parties add column if not exists households jsonb not null default '[]', add bring_board jsonb not null default '[]', add photo_drop jsonb, add host_updates jsonb not null default '[]', add holiday_pack_id text, add checkins jsonb not null default '{}';`
2. `alter table public.gathering_drafts add column if not exists ai_turns int not null default 0;`
3. `create or replace function public.get_rsvp_party(token uuid)` — extend to return `holiday_pack_id`, `host_updates`, `bring_board` (public columns only, no host PII), `photo_drop`. Preserve existing filters.
4. `create or replace function public.submit_rsvp(...)` — accept optional household + dietary + allergens jsonb.
5. New RPCs: `list_bring_board(token)`, `claim_bring_item(token, item_id, guest_name, household_label, qty)`, `release_bring_item(token, item_id, guest_name)`. `security definer`, `search_path = public`, `grant execute ... to anon`.
6. No new tables required for v1.

## What ships fully vs. deferred
**Fully functional now** (no external creds beyond `LOVABLE_API_KEY`, which is present):
- Text-mode Talk-it-out with structured draft, deterministic demo fallback, one holiday pack (Thanksgiving) end-to-end plus Friendsgiving alias, other packs scaffolded with pack files + labels.
- Reveal, Households, Bring Board (host + guest), Party Pass upgrades, Photo Drop (all providers via user-pasted URL), Day-of Host Mode.
- Analytics hooks, tests, RLS.

**Behind flags / needs external creds**:
- Full-duplex voice (`OPENAI_API_KEY`): mic hidden until set; text mode unaffected.
- All other holiday packs beyond Thanksgiving get pack files but "beta" badge until content-reviewed.
- Vendor integrations, SMS/email sending, real payments: explicitly out of v1. UI shows "Approve to send" placeholders that are non-functional and clearly labeled.

## Acceptance criteria
- Landing → "Talk it out" → send a Thanksgiving brain dump → confirm → land on a real `/party/$id/reveal` with pack-seeded menu, tasks, and bring board within 60s using demo fallback (no key required for demo).
- `/rsvp/$token` on mobile (375px) lets a guest RSVP a household of 3, add dietary, and claim a bring item without an account, without any host PII leaking.
- Host on Day-of Mode sees next 3 actions and one late-bring alert when a claim is released within 2h of start.
- Photo Drop: paste a Dropbox File Request URL → QR renders, printable sign downloads, guest page shows the same URL; no photo bytes traverse Confetti.
- All new surfaces have empty/loading/error states, pass a11y focus checks, and render cleanly at 375px and 1280px.
- `bunx vitest run` green; Playwright journey above passes.

## Open decisions (non-blocking; sensible defaults chosen)
- Household model as jsonb-on-party (chosen) vs new table. Jsonb keeps v1 shippable; can extract later if we add cross-event households.
- Day-of Mode as separate route (chosen) vs modal — separate route survives refresh on phone.
- Holiday pack Sundown/date math for Shabbat/Passover/Eid: v1 uses host-entered start time with a helpful hint; automated sunset lookup deferred.
