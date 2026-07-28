# Confetti production release plan

The app and the domain are two separate concerns. The candidate must first
become a verified Cloudflare Worker release; only then may `confettiapp.ai`
serve that exact source.

## Candidate gate

1. Work on a focused branch and keep unrelated user changes intact.
2. Run format, lint, typecheck, unit/integration tests, production build, bundle
   budget, production dependency audit, responsive Playwright, and axe checks.
3. Open a focused PR. Merge only after the exact branch head passes GitHub CI.
4. Record the full 40-character merge SHA.

## Cloudflare release gate

1. Deploy the merge commit with `npm run deploy:preview`.
2. Confirm
   `https://confetti-independent-preview.shannasilverman-apps.workers.dev/release.json`
   reports the same full SHA.
3. Run `npm run verify:deployment`. The verifier checks `/`, `/app`, `/talk`,
   `/sample-invite`, every seeded party, Reveal, Day-of, install assets, and
   every first-party event banner against the exact release SHA.
4. Keep the prior Cloudflare version ID as the rollback target.

## `confettiapp.ai` promotion gate

1. Inspect the current Cloudflare zone and Worker custom-domain mapping
   read-only. Do not assume the current marketing site and the new Worker share
   a deployment.
2. Confirm both apex and `www` behavior, redirects, TLS, and which hostname is
   canonical.
3. Attach or route the domain only to the already verified Worker version.
4. From a clean, synchronized `main`, run `npm run verify:production`. It
   refuses a dirty/non-main/unsynchronized worktree, verifies the exact SHA on
   canonical `www`, and either fully verifies the apex or validates its
   redirect to `www`. Then run mobile/desktop live acceptance.
5. If any production check fails, restore the recorded prior Worker/domain
   target and verify the rollback.

The agent loop never performs this promotion. Production mutation requires an
explicit release run against the already reviewed commit.
