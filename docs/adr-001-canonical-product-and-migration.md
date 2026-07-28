# ADR 001: Canonical Confetti product and production migration boundary

- **Status:** Accepted for development; production cutover remains gated
- **Decision date:** 2026-07-28
- **Repositories:** `shannasilverman-ctrl/confetti-web`,
  `shannasilverman-ctrl/confetti-party`

## Decision

`confetti-party` is the canonical repository for new product and engineering
work. It is the long-term Confetti application.

`confetti-web` remains the canonical source and recovery baseline for the
current `confettiplans.com` production deployment until the migration gates in
this document pass. Choosing the modern repository for development does not
authorize a production data, authentication, link, or domain cutover.

The repositories must not be merged mechanically. Product capabilities can be
ported deliberately, but Firebase identities and event data require a staged,
reconciled migration into a compatible Supabase authorization model.

## Evidence

Evidence captured on 2026-07-28:

- The SHA-256 digest of the response body served by `confettiplans.com`,
  `www.confettiplans.com`, and the redirect target for
  `vendor.confettiplans.com` was
  `1d6e08173335ffea21a1a8763ea9eb676db1a65fa0c356fc9e21bf518895ca8a`.
  It exactly matched `confetti-web/public/index.html`.
- The matching Cloudflare Pages production deployment was
  `f8e93e2f-0934-4a86-b973-6e747b40fd82`, sourced from static-app commit
  `6843d51`. Its immutable deployment URL also served the same bytes.
- `login.confettiplans.com` redirected to
  `app.confettiplans.com/auth?mode=signin&returnTo=%2Fapp`.
- `app.confettiplans.com/release.json` and the independent preview both
  reported release `e911943284386d5e1d5c4a7c5b1aaf6a7ddefde0`, the then-current
  `confetti-party` `main` commit.
- A clean `confetti-party` checkout passed Prettier, ESLint, TypeScript, 343
  Vitest tests across 47 files, the production dependency audit, and the
  Cloudflare Worker production build.
- The first local Playwright run completed 112 cases before the local Wrangler
  process exited; subsequent failures were connection refusals. This is not a
  passing browser gate and must be replayed serially or in CI against an exact
  release.
- `confetti-web` is a recovered, monolithic Firebase client. Its repository
  does not contain the deployed Firestore rules, Storage rules, Functions, or
  all `/api` implementations needed to prove tenant isolation or reproduce the
  backend.
- `confettiapp.ai` still served a distinct copy of the original Firebase
  application. It is a data-access and rollback dependency and must remain
  untouched until migration has been proved.
- `confetti-party` has a typed React/TanStack application, Cloudflare Worker
  build, Supabase migrations, explicit RLS and grants, token-scoped guest RPCs,
  optimistic concurrency, account export/deletion, and materially broader
  automated coverage.
- A valuable 19-commit product-intelligence stack currently exists on
  `agent/host-next-action` rather than `main`. It must be reconciled with the
  newer brand and signed-in experience instead of being abandoned or merged
  without verification.
- The default local Playwright command starts too much concurrency for its
  single Wrangler development server. CI intentionally runs each browser
  project with one worker; the local release command must adopt the same
  reliable constraint.

## Why the repositories cannot be switched interchangeably

The production Firebase model stores a shared event document addressed by a
six-character code and associates a user with that event. It also contains
cohosts/members, vendor profiles, bookings and message threads, attachments,
invitation metadata, and integration state. Planner and vendor authentication
use separate Firebase client instances but share the Firebase identity system.

The Supabase model currently owns parties through one `auth.users` UUID and
does not yet provide a compatible cohost membership or vendor identity model.
Firebase UIDs, password hashes, provider links, sessions, FCM tokens, and
third-party access tokens are not portable identifiers. Email alone is not a
safe identity key.

Existing links are also incompatible:

- Firebase RSVP and collaboration links use six-character event or join codes.
- Supabase RSVP links use UUID bearer tokens.

Production service-worker caches mean that changing DNS alone would not stop
older clients from continuing to write to Firebase.

## Migration gates

Production remains on `confetti-web` until all of these are evidenced:

1. Export and inventory the exact deployed Firebase Auth providers, Firestore
   and Storage rules, indexes, Functions/Workers, API routes, hosting versions,
   and storage objects. Store an immutable backup and complete a restore drill.
2. Add a normalized party membership and invitation model to Supabase with
   owner, cohost, viewer, removal, and ownership-transfer semantics. Prove the
   RLS matrix with cross-tenant negative tests.
3. Define an external-identity mapping from Firebase UID to Supabase user ID.
   Support the required email/password, Google, Apple, planner, and vendor
   reauthentication paths without matching accounts by email alone.
4. Produce a versioned field map for every Firebase event, guest, member,
   vendor, booking, message, attachment, and integration field. Explicitly mark
   each field as migrated, archived, reauthorized, or intentionally retired.
5. Introduce scoped, rotatable and revocable invitation tokens. Keep RSVP and
   collaborator authority separate, rate-limit anonymous mutation, and verify
   that public projections cannot expose host or guest PII.
6. Rehearse deterministic ETL on sanitized staging data. Reconcile counts,
   identities, memberships, timestamps, attachments, and hashes with zero
   unexplained rows.
7. Preserve old-link continuity through a server-side mapping/resolver that
   does not disclose owner data or reuse low-entropy join codes as new
   credentials.
8. Run an opt-in pilot while Firebase remains authoritative. Capture deltas
   server-side; do not implement naive client dual-write.
9. Rehearse the write freeze, final delta, service-worker retirement, canary
   cutover, exact-release smoke tests, and rollback with reverse
   reconciliation.

## Rollback rule

Before cutover, rollback means returning traffic to the immutable
`confetti-web` release and Firebase backend.

After any Supabase production writes, DNS rollback alone is prohibited. New
writes must first be reconciled or replayed into the selected authoritative
store, or both applications must remain read-only until reconciliation is
complete.

## Immediate product path

1. Keep the current production deployment unchanged.
2. Reconcile the `agent/host-next-action` product stack with current
   `confetti-party/main` on a new integration branch, preserving both histories.
3. Replay all unit, security, build, bundle, desktop, and mobile gates against
   the integrated branch.
4. Publish an isolated preview and verify its exact commit.
5. Build migration compatibility behind explicit flags without connecting it
   to production user data.
