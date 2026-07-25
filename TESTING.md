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

## Intentionally not covered yet

- **Real database RSVP happy path.** Submitting an RSVP requires Supabase
  service credentials that are not available in public CI. The E2E suite
  only asserts the not-found/error surface for an unknown token; a full
  happy path belongs in a follow-up job that runs with a scoped test
  project (see `src/lib/rsvp.functions.ts`).
- **AI/talk backend.** `/talk` is smoke-tested for render only; realtime
  OpenAI calls are not exercised.
- **Auth flows.** `/app` renders the signed-out/demo shell in CI — signed-in
  personalization is not covered.

## Adding a regression test

1. If the bug lives in `src/lib/*` (pure logic), add a case to the closest
   file under `tests/unit/`. Keep tests deterministic — no network, no time.
2. If the bug is a rendered-page regression, add or extend a spec in
   `tests/e2e/public-routes.spec.ts`. Prefer role/text queries over CSS
   selectors and assert user-visible behavior.
3. Run `bun run lint && bun run typecheck && bun run test && bun run build &&
bun run test:e2e` before opening the PR. CI runs the same sequence.
