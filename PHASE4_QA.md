# Phase 4 QA — Final Evidence

Baseline commit: `f665f94` (Turn 1 completion). Turn 2 changes:
mobile-matrix rewrite for worker-safe evidence, hero descriptor truth-up,
and this document. No pre-change bundle baseline is retained in the repo
so byte-for-byte regressions can only be judged against the numbers in
§2 going forward.

All commands run against a frozen `bun install --frozen-lockfile` tree.

## 1. Quality gates (exact commands)

| Step      | Command                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Install   | `bun install --frozen-lockfile`                                                                                                 |
| Prettier  | `bun run format:check` (`prettier --check .`)                                                                                   |
| Lint      | `bun run lint` (`eslint .`)                                                                                                     |
| Typecheck | `bun run typecheck` (`tsc --noEmit`)                                                                                            |
| Unit      | `bun run test` (`vitest run`)                                                                                                   |
| Coverage  | `bun run test:coverage` (`vitest run --coverage`)                                                                               |
| Build     | `bun run build` (`vite build`)                                                                                                  |
| E2E + axe | `CI=1 PW_REUSE=0 bun run test:e2e` (Playwright, webServer via `scripts/wrangler-config-path.mjs` → `.output/server/wrangler.json` on CI / `dist/server/wrangler.json` in the Lovable sandbox; no `reuseExistingServer` in CI) |

Latest local execution on Turn 2 branch (baseline SHA `f665f94` + Turn 2
edits; SHA finalised on push):

| Gate                            | Result                                   |
| ------------------------------- | ---------------------------------------- |
| `bun install --frozen-lockfile` | ok                                       |
| `bun run format:check`          | Prettier — all files clean               |
| `bun run lint`                  | ESLint — 0 problems                      |
| `bun run typecheck`             | `tsc --noEmit` — 0 errors                |
| `bun run test`                  | Vitest — 117 passed / 17 files           |
| `bun run build`                 | Vite + Nitro — built in ~0.7s            |
| `CI=1 … playwright test`        | 76 passed, 48 skipped, 0 failed (exit 0) |

No release PR exists yet; when the branch is pushed the GitHub Actions
run URL should be appended here. The `48 skipped` count is the
mobile-only project skipping desktop tests (and vice-versa) — expected.

## 2. Bundle byte counts (this commit)

Measured after `bun run build`. Read from the build's public asset dir —
`.output/public/assets/**` on GitHub / non-sandbox hosts, or
`dist/client/assets/**` in the Lovable sandbox (see
`scripts/wrangler-config-path.mjs` for the parallel convention). Refresh
with `du -b "$(node -e 'import(\"./scripts/wrangler-config-path.mjs\").then(m=>console.log(m.resolveWranglerConfigPath().replace(\"server/wrangler.json\",\"\")))')"client/assets/*.{js,css}` or, equivalently, `du -b dist/client/assets/*.{js,css}` inside the sandbox.

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

Source is a managed asset pointer, `src/assets/confetti-hero.jpg.asset.json`:

| Property                 | Value                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| Descriptor bytes         | 121,037 (matches `size` field in pointer)                                                         |
| Content type             | `image/jpeg`                                                                                      |
| Decoded pixel dimensions | **1280 × 714** (verified via `PIL.Image.open` after fetching the CDN URL from the running Worker) |
| `<img>` intrinsic attrs  | `width={1280} height={714}` in `src/routes/index.tsx`, `fetchPriority="high"`, `decoding="async"` |

The intrinsic attrs and the decoded pixel dimensions now agree. Any
prior mention of `1600 × 900` was inherited from an earlier hero and is
no longer accurate — this document is the source of truth.

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
bun run test
bun run test:coverage
bun run build
CI=1 bunx playwright install --with-deps chromium
CI=1 bun run test:e2e
```

Report exact `SHA`, exit codes, and Playwright pass/fail/skip counts on
the branch after running. Do not publish or touch domains/data/secrets.
