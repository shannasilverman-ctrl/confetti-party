# Confetti beta release signoff

Evidence date: 2026-07-29

## Scope

This signoff covers the exact canonical GitHub commit reported by
`/release.json` at
`https://confetti-independent-preview.shannasilverman-apps.workers.dev`.
The deployment verifier compares that live marker with the local release
commit and fails closed on a mismatch; GitHub and Cloudflare retain the
corresponding historical commit and Worker version IDs.
It does **not** cover `confettiapp.ai`, custom domains, billing, a vendor
marketplace, the rollback-only Lovable deployment, or missing production
secret configuration.

The release candidate completes these representative journeys:

- Host starts from an idea, typed conversation, browser dictation, or
  configured realtime voice; reviews assumptions and open questions; then
  creates an editable party workspace.
- A signed-out host can describe a party in their own words without an AI
  call or upload. The local planner preserves explicit dates (including the
  year), guest count, budget, setting, dietary needs, and tone, then creates a
  real browser-saved workspace that survives reload.
- A signed-out host can create a useful browser-saved plan before signup,
  carry the explicit claim intent through email confirmation, review exactly
  which custom plans will move into the masked destination account, and defer
  without losing the browser copy. Seed samples never become account data.
- Host uses checklist, guest list, budget, shopping, timeline, bring board,
  invite sharing, Photo Drop, Reveal, and Day-of Mode.
- Guest opens a tokenized invite, RSVPs with household/dietary details,
  claims or releases a bring-board item, adds the event to a calendar, and
  opens the host's externally hosted Photo Drop.
- Owner invites a trusted cohost with a hashed, one-time token; the browser
  scrubs the token fragment before authentication; the cohost can collaborate
  or leave without receiving owner-only transfer, removal, or deletion powers.
- Host sees guest mutations without whole-row overwrites, with optimistic
  concurrency, bounded retry, offline recovery, and explicit conflict
  handling.

## Automated release evidence

The exact application candidate passed locally against the production
Cloudflare Worker build:

| Gate                  | Result                                                                  |
| --------------------- | ----------------------------------------------------------------------- |
| Prettier              | All files matched                                                       |
| ESLint                | Passed                                                                  |
| TypeScript            | Passed with `tsc --noEmit`                                              |
| Vitest                | 79 files, 582 tests passed                                              |
| Production build      | Passed                                                                  |
| Initial client bundle | Within enforced budget; exact SHA-bound bytes are recorded in CI        |
| Playwright            | 211 application cases passed; 84 intentional cross-project skips        |
| GitHub Actions        | Required on the exact final branch head; run URL is recorded in the PR  |
| Live deployment       | Required on the exact final SHA; version evidence is recorded in the PR |

The Playwright run covers desktop, Pixel-class mobile, and iPhone/WebKit layouts, a
320/375/390/430 px route matrix, keyboard/focus behavior, minimum 44 px
primary targets, asset availability, semantic route identity, malformed
invite recovery, sample-vs-real action truthfulness, and serious/critical
axe checks. It also verifies reduced motion, the iOS 16 px text-input floor,
fixed navigation and dialog containment, timezone-stable hydration, and that
collaboration invite secrets never appear in HTTP request URLs. Project-only
cases are skipped in the other Playwright projects by design.

The complete Playwright matrix contains 211 applicable cases (84 intentional
cross-project skips), including all three WebKit critical-path cases. CI runs
the device projects in fresh-Worker slices and remains the exact-SHA release
authority.

The host dashboard also preserves the original Confetti visual contract:
Outfit for product copy, Fraunces for expressive display type, warm editorial
composition, asymmetric party imagery, and a calm mobile-first hierarchy.
Its local-storage and sample-party labels are tested so visual polish never
comes at the expense of product truth.

GitHub Actions independently replays formatting, lint, typecheck, coverage,
build, bundle enforcement, a clean Worker startup, and Playwright before
deployment. A candidate is publishable only after that exact branch head is
green.

## Data, privacy, and reliability contracts

- Party writes are column-diffed and use optimistic concurrency. Guest
  mutations are atomic RPCs and host retries do not blindly overwrite them.
- Authenticated pending writes use a versioned, exact-user-scoped IndexedDB
  outbox so offline edits and ambiguous insert acknowledgements survive a
  reload. Recovery retains the original server baseline for three-way merge,
  never replays one account's work under another identity, never resurrects a
  server-deleted party, and removes a record only after cloud acknowledgement
  or explicit discard. Records omit RSVP bearer tokens, expire after seven
  days, and are capped at 20 per account, 60 total, and 1 MB each.
- Authenticated read recovery uses a separate versioned, exact-user-scoped
  IndexedDB snapshot. It stores at most 20 parties for at most three recent
  accounts, expires after seven days, rejects malformed, future, duplicate,
  oversized, wrong-user, and incomplete-role records, and strips RSVP bearer
  tokens. It is used only for offline or transient network/server failures;
  authentication, authorization, RLS, and validation failures remain
  fail-closed. Signed-out and switched-away accounts remove their readable
  snapshot from the shared device.
- Cached host views identify themselves as an offline copy, show the last
  complete server-sync time, warn that invitations and collaborator changes
  may be newer, and keep the notice until a full account query succeeds. A
  release-scoped service worker caches only the public application shell and
  first-party static assets. It excludes API, RSVP, collaboration, auth,
  account, and release-provenance routes; private party data never enters the
  service-worker cache.
- Real invitation links, messages, images, native shares, email drafts, QR
  codes, and Party Booth signs stay locked while the relevant party is saving,
  device-only, failed, conflicted, rejected, or known only from an unverified
  cache. A full server load or that party's own acknowledged server row unlocks
  sharing from the canonical details without requiring a page reload; one
  party's acknowledgement does not certify the rest of a cached account.
- Every token-bearing `/rsvp/` response, including malformed and unknown
  tokens, overrides upstream caching with `Cache-Control: no-store` and legacy
  `Pragma: no-cache`. Public pages and static assets keep their existing cache
  policy.
- Public RSVP mutation RPCs have a private per-party database abuse budget.
- Realtime voice reservations use a transaction-scoped Postgres advisory
  lock, enforcing the five-per-hour and two-concurrent limits across Worker
  isolates.
- RSVP, draft, account, and voice failures return generic client-safe errors.
  Operational logs exclude invite tokens, user ids, bearer/API keys, user
  content, and raw provider bodies.
- Every yes/maybe RSVP offers one optional comfort/access note regardless of
  occasion. The response is capped at 200 characters, labeled host-only, and
  explicitly discourages medical records and emergency contacts. A no response
  omits and clears the private detail. Host follow-through uses only a private,
  deduplicated review action and never copies the note into public projections,
  group message drafts, logs, or guest-facing success copy. The interactive
  sample persists the same field in a strict v2 browser schema, migrates valid
  v1 state without inventing a note, and clears both versions on reset.
- Photo Drop stores only a validated HTTPS destination. Photos go directly
  to the host's selected provider; outbound links suppress referrers.
- Party Booth builds a personalized event frame from the public invite name,
  date, and selected theme entirely in the guest's browser. Original and
  finished photos are never uploaded to or stored by Confetti; mobile devices
  use the native share sheet and other browsers receive a local download.
- Party Booth signs use a locally rendered QR code that deep-links into the
  camera/library choice on the existing capability-scoped invitation. Its
  `#party-booth` fragment stays on the guest's device and is never sent to the
  server. The QR image is not generated by an external service, and scanning
  it does not create an account, upload a photo, or introduce another token.
- Timed guest calendar exports require a host-confirmed, validated IANA event
  time zone. Google links carry that zone and calendar files contain absolute
  UTC instants, so traveling guests import the same moment. Missing, invalid,
  nonexistent, and repeated daylight-saving wall times fail closed with
  actionable copy rather than silently choosing an instant. Host-entered zones
  are canonicalized before persistence, and an idea that contains a start time
  exposes its zone confirmation without making the host reopen optional
  details. Impossible all-day dates never render a crashing calendar action;
  valid date-only events remain honest all-day exports. The public RSVP
  projection exposes only the validated zone string, never the private planning
  profile.
- Skipped date, guest-count, budget, and look decisions remain explicitly
  open across quick start, workspace, checklist, invitation, and Reveal
  surfaces. A placeholder date cannot be shared, checked off, or deleted into
  becoming a guest-visible fact. The workspace promotes these unresolved
  inputs as four optional, directly actionable “next moves” before suggesting
  downstream work such as invitations or RSVP follow-up; the host can choose
  whichever answer feels easiest and leave the rest open.
- Quick start interprets supported facts in the host's idea locally and shows
  the captured date, headcount, audience split, effort, food approach, and
  dietary needs before building. Dedicated fields always override the text
  interpretation. An unselected catalog theme stays unselected: it contributes
  no themed tasks, supplies, projected spend, workspace badge, or invitation
  claim.
- When a host later resolves or changes the guest count, Confetti refreshes
  only untouched, still-needed party-sized shopping quantities and projected
  spend. Host-edited, in-cart, and purchased quantities remain authoritative,
  and the save confirmation says what was resized or protected.
- New party budgets use deterministic occasion-aware category targets whose
  whole-dollar amounts add up to the host's total exactly. Changing a budget
  rebalances only category targets and preserves every recorded expense.
  Previously saved mismatches remain visible until the host chooses the
  explained rebalance action; Confetti never silently rewrites their history.
- Repeat planning keeps the original gathering's retrospective with the
  original record. Notes about what ran short and what should change become
  explicit, private tasks in the cloned plan, while the new gathering starts
  with a clean retrospective instead of appearing post-event.
- Every generated plan includes an explicit RSVP-confirmation step. Day-of Mode
  keeps unfinished assigned commitments visible before unowned work, then
  prioritizes tasks closest to the gathering so a handoff cannot disappear
  merely because older checklist items were created first. Its run sheet parses
  absolute and start-relative times, shows an honest live now/next countdown
  only on the gathering date, and labels future and past schedules as preview
  or record rather than presenting them as live. Authenticated guest-page
  updates stay explicitly saving, device-only, failed, or conflicted until the
  acknowledged server row contains the submitted update and has a newer
  timestamp. Only then does Day-of Mode call the update visible; existing retry
  and conflict controls remain beside the status. Copy also states that guests
  see updates on open/refresh and that Confetti sends no text or push
  notification.
- Signed-out Talk is deterministic and device-local. It extracts only facts
  present in the host's words, asks at most one next question, stops after
  three turns, and can materialize a useful browser workspace without an
  account. Unknown inputs remain explicit planning tasks instead of silently
  becoming guest-visible facts.
- Account export strips bring-item claim secrets. Account and party deletion
  have explicit confirmation and failure recovery.
- Party membership is limited to owner and cohost roles. Owner transfer is
  explicit, accepted-invitation audit rows survive account deletion, and an
  owner cannot delete an account while a cohost still depends on an owned
  party.
- Browser-to-account claiming is explicit and owner-scoped. It reads only
  validated custom parties, preserves their UUIDs for idempotent retry, strips
  browser/server authority fields, accepts an existing row only for the exact
  authenticated owner, and removes each browser copy only after a server row
  is acknowledged. Partial failures leave every unacknowledged plan available
  for retry; ordinary sign-in never imports browser plans automatically.
- Firebase-to-Supabase work remains rehearsal-only. The versioned field map,
  dry-run planner, and credential-free shadow pipeline fail closed on
  unknown/ambiguous fields, malformed domain values, unresolved
  relationships, duplicates, stale revisions, and reconciliation
  differences. The pipeline simulates an idempotent apply entirely in memory
  and emits only domain-separated keyed references, revisions, roots, and
  counts. It never email-matches identities, copies integration credentials,
  promotes legacy RSVP/collaboration codes into new bearer authority, writes a
  database, or calls itself production-ready.

## Explicitly unverified in this signoff

- The rollback-only Postgres integration harness was not run because this
  workspace has no dedicated local/staging `PG*` connection. Static migration
  contracts and the sanitized in-memory shadow migration run in CI; a
  representative export, restore drill, service-only staging importer, actual
  target reconciliation, second snapshot/delta, and the Postgres harness
  remain required before a higher-risk database launch.
- The credential-free claim suite covers validation, seed exclusion,
  collision denial, account isolation, idempotency, partial failure, selective
  cleanup, route continuity, and confirmation UI. A real signup plus
  browser-to-account insert/reload/RSVP-link pass still requires an isolated
  staging Supabase account before production release.
- Unit and production-browser tests prove read-cache validation, user
  isolation, bearer-token removal, transient-error gating, truthful offline
  labeling, release-scoped service-worker registration, and desktop/mobile
  shell reopening with the network disabled. A real authenticated
  online-load → offline cold reload → queued edit → concurrent guest change →
  reconnect/reconcile pass still requires isolated staging credentials.
- Automated WebKit and keyboard tests passed, but a physical iPhone/Mobile
  Safari session and a manual assistive-technology pass have not yet been
  performed.
- No real OpenAI call was made. Voice route/auth/rate/privacy behavior is
  covered with mocked upstream tests; live voice also requires
  `OPENAI_API_KEY` and `OPENAI_SAFETY_ID_SALT`.
- No real user account, party, guest, email, message, payment, or photo was
  created or modified for this signoff.

## Product boundaries

Confetti is ready as a constrained consumer beta, not as a finished
marketplace. It does not yet provide vendor inventory/booking guarantees,
payments, transactional guest messaging, native photo storage, or a support
SLA. UI copy must continue to describe shared guest-page updates as updates,
not sent notifications.

The independent beta preview may proceed only after the exact GitHub commit
is green, the Cloudflare Worker reports that same deployment, and
`bun run verify:deployment` plus desktop/mobile acceptance pass. Moving
`confettiapp.ai`, attaching a custom domain, or retiring the Lovable rollback
remains a separate owner-approved release decision.
