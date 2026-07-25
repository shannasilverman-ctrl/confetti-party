# Confetti beta release signoff

Evidence date: 2026-07-25

## Scope

This signoff covers the GitHub-connected Lovable beta at
`https://confetti-party.lovable.app`. It does **not** cover
`confettiapp.ai`, custom domains, billing, a vendor marketplace, or any
production secret configuration.

The release candidate completes these representative journeys:

- Host starts from an idea, typed conversation, browser dictation, or
  configured realtime voice; reviews assumptions and open questions; then
  creates an editable party workspace.
- Host uses checklist, guest list, budget, shopping, timeline, bring board,
  invite sharing, Photo Drop, Reveal, and Day-of Mode.
- Guest opens a tokenized invite, RSVPs with household/dietary details,
  claims or releases a bring-board item, adds the event to a calendar, and
  opens the host's externally hosted Photo Drop.
- Host sees guest mutations without whole-row overwrites, with optimistic
  concurrency, bounded retry, offline recovery, and explicit conflict
  handling.

## Automated release evidence

The exact application candidate passed locally against the production
Cloudflare Worker build:

| Gate                  | Result                                                                         |
| --------------------- | ------------------------------------------------------------------------------ |
| Prettier              | All files matched                                                              |
| ESLint                | Passed                                                                         |
| TypeScript            | Passed with `tsc --noEmit`                                                     |
| Vitest + coverage     | 39 files, 298 tests passed                                                     |
| Coverage              | 81.64% statements, 76.22% branches, 81.81% functions, 85.07% lines             |
| Production build      | Passed                                                                         |
| Initial client bundle | 566,293 raw bytes; 163,755 gzip bytes; within enforced budget                  |
| Playwright            | 101 applicable tests passed; 51 intentional project-specific skips; 0 failures |

The Playwright run covers desktop and Pixel-class mobile layouts, a
320/375/390/430 px route matrix, keyboard/focus behavior, minimum 44 px
primary targets, asset availability, semantic route identity, malformed
invite recovery, sample-vs-real action truthfulness, and serious/critical
axe checks. Mobile-only matrix cases and desktop-only axe cases are skipped
in the other Playwright project by design, which accounts for the 51 skips.

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
- Account export strips bring-item claim secrets. Account and party deletion
  have explicit confirmation and failure recovery.

## Explicitly unverified in this signoff

- The rollback-only Postgres integration harness was not run because this
  workspace has no dedicated local/staging `PG*` connection. Static migration
  contracts run in CI; the harness remains a required staging rehearsal
  before a higher-risk database launch.
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

The beta deployment may proceed only to `confetti-party.lovable.app` after
the exact GitHub head is green and the Lovable preview reflects that head.
