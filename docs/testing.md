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
the Nitro build output — `.output/server/wrangler.json` on GitHub / any
non-sandbox host, or `dist/server/wrangler.json` inside the Lovable
sandbox. `scripts/wrangler-config-path.mjs` resolves the path from
whichever directory actually exists, so you must have run
`bun run build` at least once (CI does this in-order). Override the port
with `PW_PORT`. Playwright intentionally uses one worker locally and in
CI: concurrent browser contexts can exhaust the single preview Worker and
turn otherwise healthy routes into misleading connection-refused failures.

GitHub runs `test:e2e:desktop` and `test:e2e:mobile` as separate steps.
Both execute the same suite, but each starts a fresh Wrangler process so
the constrained runner does not carry one local Worker through the entire
mixed-device matrix.

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

- **Unit (`tests/unit/`)** — pure product logic and focused component behavior.
  This includes browser-to-account claim validation, seed exclusion,
  authority stripping, owner collision denial, idempotent retry, partial
  failure, selective cleanup, masked-account confirmation, and identity
  transition contracts.
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
(`get_rsvp_party`, `get_rsvp_party_v2`, `list_bring_board`, `submit_rsvp`,
`submit_rsvp_v2`, `claim_bring_item`, `release_bring_item`). The entire script runs inside a single
`BEGIN ... ROLLBACK` with `ON_ERROR_STOP=1`; every fixture row is tagged
with a unique per-run marker (`rpc_harness_fixture_<epoch-ns>`) so a
post-run persistence check can prove zero rows leaked.

Assertions:

- **Static (Phase A, always runs)**: no `PUBLIC` EXECUTE on the RPCs;
  both `anon` and `authenticated` grants present; the obsolete 5-argument
  `submit_rsvp` overload is absent; function bodies retain
  `SECURITY DEFINER`, explicit `search_path`, wildcard `ESCAPE` in
  `submit_rsvp`, the v2 public projection exposes only a coarse contextual
  RSVP kind, v2 answer details are allow-listed and size-bounded, and
  `FOR UPDATE` row locks remain in
  `claim_bring_item` / `release_bring_item`.
- **Behavioural (Phase B)**: `get_rsvp_party` / `get_rsvp_party_v2` /
  `list_bring_board` return
  only allow-listed keys (no `assigneeName`, `assigneeHousehold`,
  `claimSecret`, `dietary`, or item `notes`), and sanitized
  `host_updates` / `photo_drop` projections match an exact key set.
  Every invalid-input path — blank/oversized names, invalid RSVP value,
  non-array or oversized `dietary`/`allergens`, blank/oversized/invalid
  `item_id`, `qty=0`, `qty>999` — must be rejected by the RPC (tracked
  by a `raised` sentinel so the harness cannot pass on its own thrown
  error), and byte-identical snapshots of `guests` and `bring_board`
  prove state was unchanged after each rejection. `submit_rsvp` happy
  path updates `yes_count`; v2 submission stores only the allowed arrival
  plan and short comfort/access note on the matched primary guest; first
  `claim_bring_item` returns `ok=true`
  with a non-empty `claimSecret`, the second returns `unavailable`;
  `release_bring_item` fails without and with a wrong receipt and only
  succeeds with the exact receipt; the receipt never appears in either
  public projection.

Run:

```bash
bun run test:db
```

Requires the standard `PG*` env vars (`PGHOST`, `PGPORT`, `PGUSER`,
`PGPASSWORD`, `PGDATABASE`) pointing at a database with the current
RPCs deployed. Safe execution surfaces:

- A local `supabase start` instance (default).
- A dedicated staging database.
- The connected Lovable database **only** with an explicit
  `CONFETTI_ALLOW_CONNECTED_ROLLBACK=1` opt-in. The shell runner refuses
  hosts whose name contains `prod`/`production`, requires the SQL file
  to open with `BEGIN` and end in `ROLLBACK` (no `COMMIT`), runs psql
  with `ON_ERROR_STOP=1`, and performs an independent post-run leak
  check against both `public.parties` and `auth.users`.

Phase B owner-FK strategy (in order):

1. Insert a synthetic `auth.users` row tagged with the run marker
   (`rpc_harness_fixture_<epoch-ns>@rpc-harness.invalid`). Only possible
   when the harness role has `INSERT` on `auth.users` (local supabase
   or staging with `service_role`/`postgres`).
2. If the role lacks that privilege, fall back to any existing
   `parties.user_id` as an internal FK (never printed).
3. If neither is possible (empty database with no auth INSERT), the
   harness **fails loudly** rather than skipping.

On the connected Lovable sandbox the harness role
(`sandbox_exec.<ref>`) has neither `INSERT` on `auth.users` nor any
existing owner to reuse, so Phase B is expected to fail there; run
Phase B on a local `supabase start` instance where seeding is
permitted. Phase A still runs and validates grants, function bodies,
and structural guarantees on any reachable database.

### Two-session concurrency (local/staging only, currently manual)

`supabase/tests/concurrency_claim.sql` documents a two-session claim
race. It requires two independent psql sessions and therefore cannot
run inside the atomic-rollback harness. **There is no
`scripts/db-concurrency-test.sh`; the two-session race is currently
run manually and is un-executed by automation.** Run the SQL manually
against a local or staging database only — never production — and
delete the fixture party (`name = 'rpc_concurrency_fixture'`)
afterward. `FOR UPDATE` presence is asserted statically in Phase A and
sequential loser behavior is asserted in Phase B; true two-backend
serialization remains unproven until executed on isolated
local/staging infrastructure.

## Intentionally not covered yet

- **Real database RSVP happy path via HTTP.** Submitting an RSVP through
  the browser flow requires Supabase service credentials that are not
  available in public CI. The E2E suite only asserts the not-found/error
  surface for an unknown token; the RPC-level happy path is now covered
  by `test:db`.
- **AI/talk backend.** `/talk` is smoke-tested for render only; realtime
  OpenAI calls are not exercised.
- **Auth flows.** `/app` renders the signed-out/demo shell in CI — signed-in
  personalization is not covered. The claim flow is exercised with
  credential-free client fakes and component tests, but a real
  signup/confirmation/import/reload pass still belongs in staging.
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
bun run test:e2e` before opening the PR. CI runs the same checks, with the
   desktop and mobile E2E projects split across fresh preview-server processes.
