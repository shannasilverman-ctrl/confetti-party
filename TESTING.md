# Testing

Confetti ships three test layers, all runnable locally with Bun and mirrored
in `.github/workflows/ci.yml`.

## Local commands

```bash
bun install --frozen-lockfile

bun run lint          # ESLint + Prettier
bun run typecheck     # tsgo --noEmit (strict)
bun run test          # Vitest unit tests (jsdom)
bun run test:coverage # Vitest with v8 coverage (HTML report under ./coverage)
bun run build         # Vite production build (must precede E2E)
bun run test:e2e      # Playwright against the production preview server
```

`test:e2e` boots the Cloudflare Worker preview (`wrangler dev`) against
`dist/server/wrangler.json` as its `webServer`, so you must have run
`bun run build` at least once (CI does this in-order). Override the port
with `PW_PORT`.

If your local environment does not ship the system libraries that
Playwright's bundled Chromium expects (e.g. the Lovable sandbox), point
Playwright at a system Chromium instead:

```
CHROME=$(nix-shell -p chromium --run 'which chromium' | tail -1)
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$CHROME" bun run test:e2e
```

CI installs Chromium + system deps via `bunx playwright install --with-deps chromium`
and does not need this override.

## Layers

- **Unit (`tests/unit/`)** — pure product logic and one small component
  behavior test. Current coverage: affiliate link builders, holiday-pack
  detection & materialization, shopping seed generation, and the `LogoLockup`
  wordmark render.
- **E2E (`tests/e2e/`)** — Playwright hits the built app at desktop (1280x900)
  and mobile (390x844 / Pixel 7) for every public critical path: `/`,
  `/talk`, `/app`, `/party/ava-liam-wedding`, `/party/ava-liam-wedding/reveal`,
  `/party/ava-liam-wedding/day-of`, plus the RSVP not-found state on a
  synthetic UUID. Each page must render the full "Confetti" wordmark, expose
  a landmark (`<main>` or `<h1>`), and produce no horizontal overflow.
- **Accessibility** — `@axe-core/playwright` scans `/` and `/talk` and fails
  on any `serious` or `critical` WCAG 2.0 A/AA violation.

## Database integration harness (`bun run test:db`)

`supabase/tests/rpc_harness.sql` exercises the token-scoped RPCs
(`get_rsvp_party`, `list_bring_board`, `submit_rsvp`, `claim_bring_item`,
`release_bring_item`). The entire script runs inside a single
`BEGIN ... ROLLBACK` with `ON_ERROR_STOP=1`; every fixture row is tagged
with a unique per-run marker (`rpc_harness_fixture_<epoch-ns>`) so a
post-run persistence check can prove zero rows leaked.

Assertions:

- **Static (Phase A, always runs)**: no `PUBLIC` EXECUTE on the RPCs;
  both `anon` and `authenticated` grants present; the obsolete 5-argument
  `submit_rsvp` overload is absent; function bodies retain
  `SECURITY DEFINER`, explicit `search_path`, wildcard `ESCAPE` in
  `submit_rsvp`, and `FOR UPDATE` row locks in
  `claim_bring_item` / `release_bring_item`.
- **Behavioural (Phase B)**: `get_rsvp_party` / `list_bring_board`
  projections never expose `assigneeName`, `assigneeHousehold`,
  `claimSecret`, `dietaryTags`, or item `notes`; `submit_rsvp` happy
  path updates `yes_count`; malformed shapes (non-array
  dietary/allergens, oversized name, unknown rsvp value) are rejected
  without changing state; first `claim_bring_item` returns
  `ok=true` with a non-empty `claimSecret`, second claim returns
  `unavailable`; `release_bring_item` fails without or with a wrong
  receipt and only succeeds with the exact receipt; the receipt never
  appears in either public projection.

Run:

```bash
bun run test:db
```

Requires the standard `PG*` env vars (`PGHOST`, `PGPORT`, `PGUSER`,
`PGPASSWORD`, `PGDATABASE`) pointing at a database with the current
RPCs deployed. Safe execution surfaces:

- The Lovable sandbox (harness runs inside `BEGIN ... ROLLBACK`; nothing
  persists).
- A local `supabase start` instance.
- A dedicated staging database. **Never a shared production DB.**

Phase B needs a valid `parties.user_id` (FK → `auth.users`). The harness
reuses `SELECT user_id FROM public.parties LIMIT 1` purely as an internal
FK and does not print it. If no owner exists (fresh database), Phase B
emits `SKIP` and exits cleanly rather than fabricating an auth row.

### Two-session concurrency (local/staging only)

`supabase/tests/concurrency_claim.sql` documents a two-session claim
race. It requires two independent psql sessions and therefore cannot
run inside the atomic-rollback harness. Run it manually against a local
or staging database only — never production — and delete the fixture
party (`name = 'rpc_concurrency_fixture'`) afterward. **No isolated
local instance was available to Lovable when this document was written,
so the concurrency race is currently un-executed; the row lock is
covered indirectly via the Phase A `FOR UPDATE` static check and the
Phase B double-claim assertion (which runs sequentially).**

## Intentionally not covered yet

- **Real database RSVP happy path via HTTP.** Submitting an RSVP through
  the browser flow requires Supabase service credentials that are not
  available in public CI. The E2E suite only asserts the not-found/error
  surface for an unknown token; the RPC-level happy path is now covered
  by `test:db`.
- **AI/talk backend.** `/talk` is smoke-tested for render only; realtime
  OpenAI calls are not exercised.
- **Auth flows.** `/app` renders the signed-out/demo shell in CI — signed-in
  personalization is not covered.
- **CI does not run `test:db`.** It needs live database credentials;
  keeping GitHub CI secret-free is deliberate. Run it locally against a
  branch database or during release rehearsal.

## Adding a regression test

1. If the bug lives in `src/lib/*` (pure logic), add a case to the closest
   file under `tests/unit/`. Keep tests deterministic — no network, no time.
2. If the bug is a rendered-page regression, add or extend a spec in
   `tests/e2e/public-routes.spec.ts`. Prefer role/text queries over CSS
   selectors and assert user-visible behavior.
3. Run `bun run lint && bun run typecheck && bun run test && bun run build &&
bun run test:e2e` before opening the PR. CI runs the same sequence.
