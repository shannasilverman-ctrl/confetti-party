# Phase 4 QA — Final Evidence

Commit range: Phase 4 completion + code-review correction (see git log).
All commands run against a frozen `bun install --frozen-lockfile` tree.

## 1. Quality gates (frozen install, exact commands)

| Step        | Command                                     |
| ----------- | ------------------------------------------- |
| Install     | `bun install --frozen-lockfile`             |
| Prettier    | `bun run format:check`                      |
| Lint        | `bun run lint`                              |
| Typecheck   | `bun run typecheck`  (→ `tsc --noEmit`)     |
| Unit        | `bun run test`                              |
| Coverage    | `bun run test:coverage`                     |
| Build       | `bun run build`                             |
| E2E + axe   | `bun run test:e2e` (Playwright)             |

Results are recorded in the CI workflow run linked from the release PR.

Note: an earlier revision of this document mentioned `bunx tsgo`. The project
does not ship `tsgo`; the actual typecheck binary is `tsc` from the pinned
`typescript` devDependency, invoked directly via `bun run typecheck`.

## 2. Bundle byte counts (this commit)

Measured after `bun run build` from `dist/client/assets/**`:

| Bucket                | Bytes       |
| --------------------- | ----------- |
| Total client JS       | **1,134,256** |
| Total client CSS      | **109,037**   |

Largest client JS chunks:

| Bytes    | File                                 |
| -------- | ------------------------------------ |
| 601,075  | `assets/index-*.js` (router + core)  |
| 140,660  | `assets/party._id-*.js`              |
|  79,062  | `assets/talk-*.js`                   |
|  47,379  | `assets/button-*.js`                 |
|  33,149  | `assets/dist-*.js` (Radix)           |
|  26,402  | `assets/dist-*.js` (Radix)           |
|  25,457  | `assets/routes-*.js`                 |
|  24,676  | `assets/brand-*.js`                  |

Largest CSS chunk:

| Bytes    | File                     |
| -------- | ------------------------ |
| 109,037  | `assets/styles-*.css`    |

### Fonts

`Fraunces` (display) and `Outfit` (body) are loaded via a `<link>` tag in
`src/routes/__root.tsx` with `display=swap` (Google Fonts default). No
render-blocking `@font-face` blocks; text paints in fallback while custom
fonts stream.

## 3. Hero image

Source file: `src/assets/confetti-hero.jpg` (managed asset).

| Property       | Value          |
| -------------- | -------------- |
| Bytes          | 121,037        |
| Content type   | `image/jpeg`   |
| `<img>` intrinsic attrs | `width={1600} height={900}` on the hero, `decoding="async"`, `fetchPriority="high"` |

Below-fold theme thumbnails and workspace previews use `loading="lazy"` +
`decoding="async"`; grep for `loading="lazy"` under `src/routes/` and
`src/components/` to enumerate.

## 4. Route × width overflow matrix

`tests/e2e/mobile-matrix.spec.ts` visits each of the seven core public +
demo-workspace routes at 320 / 375 / 390 / 430 px and asserts
`document.documentElement.scrollWidth <= clientWidth` at every cell. It
writes the raw numbers to `PHASE4_QA_evidence.json` after the run, so the
matrix is machine-verified per run instead of pasted-in.

Routes covered:

```text
/
/talk
/app
/party/ava-liam-wedding
/party/ava-liam-wedding/reveal
/party/ava-liam-wedding/day-of
/rsvp/00000000-0000-0000-0000-000000000000
```

Any nonzero `overflowsBy` fails the corresponding test — no silent
tolerances.

## 5. Dialog contract — focus + tap targets

`tests/e2e/dialog-contract.spec.ts` (Phase 4 correction):

* Focus return is proven by **stable node identity**: before opening the
  New Party dialog, the trigger is stamped with `data-focus-probe="trigger-a"`.
  After `Escape` closes the dialog, the assertion is
  `document.activeElement.getAttribute("data-focus-probe") === "trigger-a"`.
  Text-based checks are gone.
* Tap-target check iterates **every visible `role=button`** inside the
  dialog at 320 / 375 / 390 / 430 and asserts `width ≥ 44` and
  `height ≥ 44`. It fails per-button with the button's label, so a
  regression names the exact offending control.

## 6. RSVP status affordances

`tests/e2e/public-routes.spec.ts` (Phase 4 correction) now has two
deterministic tests:

* Malformed token (`/rsvp/not-a-uuid`) → HTTP 200 + strict
  `"This invite link doesn't look right"` copy, MUST NOT contain
  `"temporarily unavailable"`.
* Well-formed unknown UUID → HTTP 200 + same not-found copy.

Both assert the body contains no raw error strings (`JWT`, `PostgREST`,
`SQLSTATE`, `500`, …).

The `temporarily_unavailable` branch is exercised as a unit test in
`tests/unit/rsvp-loader.test.ts`, where the RPC can be mocked to fail
without a real database outage.

## 7. Holiday starter — production shape

`tests/unit/holiday-starters.test.ts` and `tests/unit/make-party.test.ts`
prove:

* Every starter id resolves to a real `HolidayPack` (no orphans).
* `"generic"` returns the tradition-neutral `GENERIC_HOLIDAY` pack with
  non-empty `bringBoardSeeds` and `taskSeeds`, and none of its labels
  mention specific traditions (`turkey`, `latke`, `menorah`, …).
* `toHolidayStarterId(x)` narrows unknown input to `undefined`
  (no unsafe `as never` cast anywhere in the create path).
* `makeParty` returns a single, non-duplicated `tasks` array; pack
  tasks + generated tasks + extra tasks appear exactly once each.
* Unknown `holidayPackId` is dropped, no pack is applied,
  `bringBoard` is empty.

The E2E starter test (`Holiday starter → editable workspace`) walks the
full path: pick Thanksgiving → verify name prefill → complete wizard →
open the created party → click **Edit details** → rename → assert the
new name renders and the seeded checklist shows Thanksgiving-flavored
tasks. This proves the workspace is not just visible but **editable**.

## 8. Design token contrast (regression retune)

`src/styles.css` retains exactly one declaration per token. Retained
values and measured contrast ratios (values in comments in the file):

| Token       | Value                | Foreground surface / bg                         | Ratio  |
| ----------- | -------------------- | ----------------------------------------------- | ------ |
| `--primary` | `hsl(10 78% 38%)`    | `text-primary-foreground` on `bg-primary`       | 7.14:1 |
|             |                      | `text-primary` on `--background` cream          | 5.44:1 |
| `--success` | `hsl(150 55% 26%)`   | `text-success-foreground` on `bg-success`       | 7.62:1 |
|             |                      | `text-success` on `--background` cream          | 5.85:1 |

Vibrant brand values are exposed as `--brand-coral` and `--brand-mint`
for decorative gradients / logo art, so the landing hero still pops
without dragging button/text contrast below AA.
