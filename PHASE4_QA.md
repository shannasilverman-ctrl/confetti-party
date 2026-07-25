# Phase 4 QA Evidence

Commit context: post-brand-parity final gate. All measurements taken with
frozen install (`bun install --frozen-lockfile`) and production build
(`bun run build`) against the Wrangler-served `dist/`.

## Quality gates

| Gate | Command | Result |
|---|---|---|
| Prettier | `bunx prettier --check .` | All files formatted |
| Lint | `bunx eslint .` | 0 errors / 0 warnings |
| Typecheck | `bunx tsgo --noEmit` | 0 errors |
| Unit | `bun run test` | 78 passed / 13 files |
| Build | `bun run build` (nitro/vite) | Success |
| E2E + axe | `bunx playwright test` (Chromium `/bin/chromium`) | 34 passed / 8 skipped |

## Evidence matrix

| Requirement | Evidence |
|---|---|
| Holiday starter selector inside New Party wizard | `src/routes/app.tsx` step 2 radiogroup + `src/lib/holiday-packs.ts` `HOLIDAY_STARTERS`, `starterPack`, `packTasks`, `packBringBoard`; unit test `tests/unit/holiday-starters.test.ts` (6 cases) |
| Starter prefills name / checklist / bring board | `src/lib/party-context.tsx` `makeParty` / `createParty` accept `holidayPackId` and seed tasks + bring board |
| Dialog keyboard contract | `tests/e2e/dialog-contract.spec.ts` — focus trap, labelled fields, Escape returns focus to trigger, initial focus lands inside dialog |
| Tap targets ≥44×44 CSS px | Dialog action size assertion in `dialog-contract.spec.ts` @ 320 / 375 / 390 / 430 widths |
| Mobile no-overflow proof | `tests/e2e/public-routes.spec.ts` overflow assertions (`scrollWidth<=clientWidth`) at mobile viewport |
| Axe (serious/critical) | 0 violations across landing (`/`), dashboard (`/app`), `/talk`, RSVP invalid state |
| RSVP sanitized 200 UI | `tests/e2e/public-routes.spec.ts` accepts `not_found` or `temporarily_unavailable` copy; never leaks JWT/PostgREST/stack traces |

## Performance evidence

### Production bundle (post-build)

| Asset | Bytes |
|---|---|
| `assets/index-*.js` (route tree entry) | 599,550 |
| `assets/party._id-*.js` (heaviest route chunk) | 140,577 |
| `assets/talk-*.js` (voice route chunk) | 78,946 |
| `assets/button-*.js` (shared UI) | 47,379 |
| `assets/styles-*.css` (single stylesheet) | 109,037 |

### Hero image (landing LCP)

- Source (bundler asset descriptor): `src/assets/confetti-hero.jpg.asset.json`
- Decoded original: **1280 × 714 px**, **121,037 bytes** (measured via Pillow)
- Markup: `<img width={1280} height={714} decoding="async" ...>` in
  `src/routes/index.tsx` — intrinsic dimensions prevent CLS.

### Below-fold images

Non-hero product / theme / holiday imagery uses `loading="lazy"` where
authored in `src/routes/index.tsx` and `src/components/theme-tab.tsx`.
The hero itself remains eager to preserve LCP.

## Known / accepted

- E2E scaffolding runs a Wrangler dev server; some routes call the
  managed Supabase backend which may return `temporarily_unavailable`
  from the sandbox. The RSVP test asserts either sanitized 200 state and
  refuses raw error strings.
- Two chunks (`index-*.js` at ~600 KB, `party._id-*.js` at ~141 KB) are
  the natural ceiling of the current route surface; further reduction
  belongs in a dedicated performance batch.
