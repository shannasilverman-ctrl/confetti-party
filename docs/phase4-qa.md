# Phase 4 QA — Final Evidence

Baseline commit: `f665f94` (Turn 1 completion). Turn 2 changes:
mobile-matrix rewrite for worker-safe evidence, hero descriptor truth-up,
and this document. No pre-change bundle baseline is retained in the repo
so byte-for-byte regressions can only be judged against the numbers in
§2 going forward.

All commands run against a frozen `bun install --frozen-lockfile` tree.

## 1. Quality gates (exact commands)

| Step      | Command                                                                                                                                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install   | `bun install --frozen-lockfile`                                                                                                                                                                                               |
| Prettier  | `bun run format:check` (`prettier --check .`)                                                                                                                                                                                 |
| Lint      | `bun run lint` (`eslint .`)                                                                                                                                                                                                   |
| Typecheck | `bun run typecheck` (`tsc --noEmit`)                                                                                                                                                                                          |
| Unit      | `bun run test` (`vitest run`)                                                                                                                                                                                                 |
| Coverage  | `bun run test:coverage` (`vitest run --coverage`)                                                                                                                                                                             |
| Build     | `bun run build` (`vite build`)                                                                                                                                                                                                |
| E2E + axe | `CI=1 PW_REUSE=0 bun run test:e2e` (Playwright, webServer via `scripts/wrangler-config-path.mjs` → `.output/server/wrangler.json` on CI / `dist/server/wrangler.json` in the Lovable sandbox; no `reuseExistingServer` in CI) |

Authoritative GitHub Actions run for commit `d19e7710a1e77276fe49a1ec0c5c6e668f586d19`:
https://github.com/shannasilverman-ctrl/confetti-party/actions/runs/30147007946

The job completed in **3m53s** with all stages green: frozen install, lint,
typecheck, unit tests with coverage, build, Playwright browser install,
webServer smoke, E2E, and Playwright artifact upload.

| Gate                            | Result                                                  |
| ------------------------------- | ------------------------------------------------------- |
| `bun install --frozen-lockfile` | ok                                                      |
| `bun run format:check`          | Prettier — all files clean                              |
| `bun run lint`                  | ESLint — 0 problems                                     |
| `bun run typecheck`             | `tsc --noEmit` — 0 errors                               |
| `bun run test` (BEFORE build)   | Vitest — **127 passed / 18 files** (no repo-state deps) |
| `bun run build`                 | Vite + Nitro — ok                                       |
| `verify:webserver`              | 200 OK, exit 0                                          |
| Playwright E2E + axe            | **76 passed, 48 skipped, 0 failed, 0 flaky** (2.1m)     |

GitHub E2E log lines 2269–2270 show exactly `48 skipped` and `76 passed
(2.1m)`, with zero failures. Searching the GitHub log for `flaky` returned
0/0.

Historical note: an earlier local sandbox run reported one flaky desktop
focus test that passed on retry. That flake did **not** reproduce in the
final GitHub Actions run above.

Prior run #19 (SHA `2de1303`) was red at the Unit step because the
`wrangler-config-path` unit test depended on repo-state build output that
does not exist before the Build step. That contract is now proved with
isolated tmp fixtures (see §5); no unit assertion touches the real repo
build directory. The `48 skipped` count is the mobile-only project skipping
desktop tests (and vice-versa) — expected.

## 2. Bundle byte counts (this commit)

Measured after `bun run build`. On GitHub / any non-sandbox Nitro build
the public asset dir is `.output/public/assets/**`; the Lovable sandbox
override writes the same files to `dist/client/assets/**` (see
`scripts/wrangler-config-path.mjs` for the parallel convention). All
byte counts and filenames in this section were captured from
`.output/public/assets/**` — the CI / production layout. To refresh
locally use `du -b .output/public/assets/*.{js,css}` (or
`du -b dist/client/assets/*.{js,css}` inside the sandbox).

| Bucket           | Bytes         |
| ---------------- | ------------- |
| Total client JS  | **1,134,256** |
| Total client CSS | **109,037**   |

Largest client JS chunks (Turn 1 snapshot; regenerate after any dep change):

| Bytes   | File                                |
| ------- | ----------------------------------- |
| 601,075 | `assets/index-*.js` (router + core) |
| 140,660 | `assets/party._id-*.js`             |
| 79,062  | `assets/talk-*.js`                  |
| 47,379  | `assets/button-*.js`                |
| 33,149  | `assets/dist-*.js` (Radix)          |
| 26,402  | `assets/dist-*.js` (Radix)          |
| 25,457  | `assets/routes-*.js`                |
| 24,676  | `assets/brand-*.js`                 |

Largest CSS chunk:

| Bytes   | File                  |
| ------- | --------------------- |
| 109,037 | `assets/styles-*.css` |

No comparable pre-Phase-4 bundle baseline is retained in the repo; the
numbers above are the authoritative reference going forward.

### Fonts

`src/routes/__root.tsx` injects two `<link>` elements (see lines around
`102`):

```text
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Nunito:wght@400;500;600;700&display=swap"
/>
```

`display=swap` forces the browser to paint fallback text immediately and
swap in the web font once it streams — no FOIT / render-blocking. The
system fallback stack for both families is declared in `src/styles.css`
as `var(--font-body)` / `var(--font-display)`, which resolve to
`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica
Neue", Arial, sans-serif` for body and the same stack fronted by
`"Fraunces"` for display. Body copy therefore renders in Nunito **or**
the platform sans; headings in Fraunces **or** the platform sans — no
invisible text at any point.

Note: `src/routes/__root.tsx` uses `Nunito`, not `Outfit`. Earlier
revisions of this doc named `Outfit`; the live font is Nunito 400/500/600/700.

## 3. Hero image (truth-up)

Source is a managed asset pointer, `src/assets/confetti-hero.jpg.asset.json`.
The pointer file itself is small JSON; the JPEG payload it references is
much larger and lives in R2 behind the `/__l5e/...` URL.

| Property                                | Value                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Descriptor file (`*.asset.json`)        | **459 bytes on disk** (`wc -c src/assets/confetti-hero.jpg.asset.json`)                           |
| Referenced JPEG payload (`size:` field) | **121,037 bytes** (declared in the pointer, served from R2 at the `url` field)                    |
| Payload content type                    | `image/jpeg`                                                                                      |
| Decoded pixel dimensions                | **1280 × 714** (verified via `PIL.Image.open` after fetching the CDN URL from the running Worker) |
| `<img>` intrinsic attrs                 | `width={1280} height={714}` in `src/routes/index.tsx`, `fetchPriority="high"`, `decoding="async"` |

The intrinsic attrs and the decoded pixel dimensions agree. Any prior
mention of `1600 × 900` was inherited from an earlier hero and is no
longer accurate — this document is the source of truth. The 121,037
number is the JPEG payload size, **not** the descriptor file size;
earlier revisions of this doc conflated the two.

Below-fold theme thumbnails and workspace previews use
`loading="lazy"` + `decoding="async"`; grep for `loading="lazy"` under
`src/routes/` and `src/components/` to enumerate.

## 4. Route × width × state matrix — durable evidence

`tests/e2e/mobile-matrix.spec.ts` (Turn 2 rewrite) drives ten scenarios
across the four thumb widths and asserts `scrollWidth <= clientWidth`
on `document` and on named containers per scenario. Sticky/fixed action
bars are measured against the viewport and any that escape any edge
fail the test. Safe-area inset resolution is captured per test.

Evidence is written per-test via `testInfo.attach`, so the standard
Playwright HTML/artifact upload contains every row — nothing depends
on a module-global array that fullyParallel workers would race on.

Attachment names (available under each test in the Playwright HTML
report and in the CI artifact bundle):

- `mobile-evidence.json` — `{ scenario, route, width, measurements[], sticky[], safeArea }`
- `mobile-screenshot.png` — viewport screenshot at the tested width

Scenarios × widths (each is a separate Playwright test, 10 × 4 = 40):

```text
landing                /
talk-signed-out        /talk
app-dashboard          /app
new-party-dialog       /app (opens the New party dialog)
workspace-overview     /party/ava-liam-wedding
workspace-bring-board  /party/ava-liam-wedding (selects Bring & Photos)
workspace-reveal       /party/ava-liam-wedding/reveal
workspace-day-of       /party/ava-liam-wedding/day-of
rsvp-malformed         /rsvp/not-a-uuid
rsvp-unknown-uuid      /rsvp/00000000-0000-0000-0000-000000000000
```

widths: `320, 375, 390, 430`.

## 5. Dialog contract — focus + tap targets

`tests/e2e/dialog-contract.spec.ts` (Phase 4 correction, still in force):

- Focus return is proven by **stable node identity**: before opening the
  New Party dialog, the trigger is stamped with `data-focus-probe="trigger-a"`.
  After `Escape` closes the dialog, the assertion is
  `document.activeElement.getAttribute("data-focus-probe") === "trigger-a"`.
- Tap-target check iterates **every visible `role=button`** inside the
  dialog at 320 / 375 / 390 / 430 and asserts `width ≥ 44` and
  `height ≥ 44`. It fails per-button with the button's label.

## 6. RSVP status affordances

`tests/e2e/public-routes.spec.ts`:

- Malformed token (`/rsvp/not-a-uuid`) → HTTP 200 + strict
  `"This invite link doesn't look right"` copy, MUST NOT contain
  `"temporarily unavailable"`.
- Well-formed unknown UUID → HTTP 200 + same not-found copy.

Both assert the body contains no raw error strings (`JWT`, `PostgREST`,
`SQLSTATE`, `500`, …). The `temporarily_unavailable` branch is
exercised in `tests/unit/rsvp-loader.test.ts` where the RPC can be
mocked to fail without a database outage.

## 7. Holiday starter — production shape

`tests/unit/holiday-starters.test.ts` and `tests/unit/make-party.test.ts`
prove:

- Every starter id resolves to a real `HolidayPack` (no orphans).
- `"generic"` returns the tradition-neutral `GENERIC_HOLIDAY` pack with
  non-empty `bringBoardSeeds` and `taskSeeds`, and none of its labels
  mention specific traditions (`turkey`, `latke`, `menorah`, …).
- `toHolidayStarterId(x)` narrows unknown input to `undefined`.
- `makeParty` returns a single non-duplicated `tasks` array.
- Unknown `holidayPackId` is dropped, no pack is applied.

The E2E starter test walks the full path in Playwright.

## 8. Design token contrast

`src/styles.css` retains exactly one declaration per token:

| Token       | Value              | Foreground surface / bg                   | Ratio  |
| ----------- | ------------------ | ----------------------------------------- | ------ |
| `--primary` | `hsl(10 78% 38%)`  | `text-primary-foreground` on `bg-primary` | 7.14:1 |
|             |                    | `text-primary` on `--background` cream    | 5.44:1 |
| `--success` | `hsl(150 55% 26%)` | `text-success-foreground` on `bg-success` | 7.62:1 |
|             |                    | `text-success` on `--background` cream    | 5.85:1 |

Vibrant brand values are exposed as `--brand-coral` and `--brand-mint`
for decorative art.

## 9. Reproduction

```bash
bun install --frozen-lockfile
bun run format:check
bun run lint
bun run typecheck
bun run test          # runs BEFORE build; uses isolated tmp fixtures
bun run test:coverage
bun run build
CI=1 bunx playwright install --with-deps chromium
CI=1 bun run test:e2e
```

Report exact `SHA`, exit codes, and Playwright pass/fail/skip counts on
the branch after running. Do not publish or touch domains/data/secrets.

## 10. Wrangler config path — CI contract (clean-CI review fix)

Previous GitHub run #19 (SHA `2de1303`) failed at the Unit step because
`tests/unit/wrangler-config-path.test.ts` called `resolveWranglerConfigPath()`
against the real repo and expected build output that cannot exist yet —
Unit runs BEFORE Build in CI on purpose. That test is now rewritten to
use isolated `mkdtempSync` fixtures and asserts deterministic path
semantics with no dependency on the repo's build directory.

Canonical-only mode (GitHub Actions / any env with `WRANGLER_STRICT_OUTPUT=1`)
accepts EXACTLY `.output/server/wrangler.json`. A pre-existing `dist/`
never satisfies the contract in that mode — proved by a fixture test
that seeds `dist/server/wrangler.json` only and asserts the resolver
throws. This kills the stale-dir masking failure mode.

Local sandbox mode (no `GITHUB_ACTIONS`, no `WRANGLER_STRICT_OUTPUT`)
prefers `.output/` when present and falls back to `dist/` only when
`.output/` is absent — never a silent dist-first pick. Generic `CI=1`
alone does NOT force canonical-only: the sandbox smoke run sets `CI=1`
only to force Playwright's no-reuse webServer mode; canonical
strictness is opt-in via `GITHUB_ACTIONS=true` or
`WRANGLER_STRICT_OUTPUT=1`.

The nine `tests/unit/wrangler-config-path.test.ts` cases cover: pinned
constants, canonical-only in GitHub Actions and via opt-in, generic
`CI=1` behavior, stale-dist rejection, fresh `.output/` resolution,
sandbox `.output/`-first preference when both exist, dist-only
fallback, missing-both throws with a build hint, and
`requireExists:false` for path derivation.
