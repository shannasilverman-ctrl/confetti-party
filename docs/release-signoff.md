# Confetti beta release signoff

Evidence date: 2026-07-28

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
| Vitest                | 66 files, 482 tests passed                                              |
| Production build      | Passed                                                                  |
| Initial client bundle | 366,149 bytes raw; 113,496 bytes gzip; within enforced budget           |
| Playwright            | 184 passed across desktop, mobile, and WebKit; 83 intentional skips     |
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
- Public RSVP mutation RPCs have a private per-party database abuse budget.
- Realtime voice reservations use a transaction-scoped Postgres advisory
  lock, enforcing the five-per-hour and two-concurrent limits across Worker
  isolates.
- RSVP, draft, account, and voice failures return generic client-safe errors.
  Operational logs exclude invite tokens, user ids, bearer/API keys, user
  content, and raw provider bodies.
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
- Skipped date, guest-count, budget, and look decisions remain explicitly
  open across quick start, workspace, checklist, invitation, and Reveal
  surfaces. A placeholder date cannot be shared, checked off, or deleted into
  becoming a guest-visible fact. The workspace promotes these unresolved
  inputs as four optional, directly actionable “next moves” before suggesting
  downstream work such as invitations or RSVP follow-up; the host can choose
  whichever answer feels easiest and leave the rest open.
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
- Firebase-to-Supabase work remains rehearsal-only. The versioned field map
  and dry-run planner fail closed on unknown paths, emit only counts and
  deterministic hashes, never email-match identities, and never promote
  legacy RSVP or collaboration codes into new bearer authority.

## Explicitly unverified in this signoff

- The rollback-only Postgres integration harness was not run because this
  workspace has no dedicated local/staging `PG*` connection. Static migration
  contracts run in CI; the harness remains a required staging rehearsal
  before a higher-risk database launch.
- The credential-free claim suite covers validation, seed exclusion,
  collision denial, account isolation, idempotency, partial failure, selective
  cleanup, route continuity, and confirmation UI. A real signup plus
  browser-to-account insert/reload/RSVP-link pass still requires an isolated
  staging Supabase account before production release.
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
