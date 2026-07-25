# Brand Parity + Product Completion — Batch 1

This batch is a **brand transplant** on top of the existing app. No routes, Supabase RPCs, RLS, Talk/Reveal/Bring Board/Party Pass/Photo Drop/Day-of/retrospective logic get replaced — only the visual layer, the landing page, the sample data hero, and the app shell chrome around them.

Working assumption to confirm: the three uploaded images are approved brand source material. I'll derive a clean SVG **Logo** from the concept board (violet ribbon "C" + three confetti pieces) rather than embedding the concept sheet, use the hero poster only as landing hero art, and pin the Ava & Liam banner to that one sample party.

## 1. Design system pass (`src/styles.css` + tokens)

- Retune tokens to the confettiapp.ai palette: cream `#FBF7EE` bg, ink `#151016` text, plum `#3B1E5E` (secondary/brand), coral `#EF5C4A`, gold `#E4B24C`, mint `#4FB393`, with existing HSL token names kept so nothing downstream breaks.
- Fonts: add editorial serif ("Fraunces") for display headings via `<link>` in `__root.tsx`, keep Nunito for body, drop Baloo 2 as the display face. Update `--font-display` accordingly. Wordmark stays Baloo (playful) or moves to serif — I'll pick serif to match the concept board.
- Add layered shadow tokens (`--shadow-soft`, `--shadow-lift`), refined gradient tokens, a subtler `--pattern-confetti` (fewer, softer dots).
- Respect `prefers-reduced-motion` (already wired) and add focus-visible ring token.

## 2. Logo component

- New `src/components/logo.tsx` exporting `<Logo />` (mark only) and `<LogoLockup />` (mark + wordmark). Pure inline SVG ribbon "C" + 3 confetti pieces (square/circle/triangle) in brand colors — scales cleanly 20px → 96px.
- Replace `BrandMark` / `BrandLockup` internals in `src/components/brand.tsx` so every existing call site (header, footers, RSVP, printable sign, invite dialog) inherits the new mark without prop churn.
- New `public/favicon.svg` (simplified ribbon-only mark) + updated `<link rel="icon">` in `__root.tsx`; delete old `public/favicon.ico` per template rule. Update `<title>` to "Confetti — Plan unforgettable gatherings" and rewrite meta description.

## 3. Landing page rebuild (`src/routes/index.tsx`)

- Keep the seasonal banner, keep the three CTAs (Start planning / Talk it out / Sample party) — reposition into a cinematic hero:
  - Full-bleed hero image (uploaded `confetti-hero-poster.jpg` uploaded via `lovable-assets`) with a plum-to-transparent overlay for AA contrast on white display type.
  - H1: "Throw the party everyone remembers." Sub: product-wedge sentence about first idea → final toast.
- Below hero, story sections alternating cream / plum-tint / cream / photo-field:
  1. Talk it out (voice orb still + copy)
  2. Reveal (screenshot-style card of a Reveal page)
  3. Next Three (task strip)
  4. Guest World + Bring Board (RSVP card + claim chips)
  5. Day-of Mode (mobile mock)
  6. Memories (retrospective card)
- Footer keeps affiliate disclosure logic + brand lockup.

## 4. Sample party hero

- Upload `ava-liam-wedding-banner.png` via `lovable-assets`, store URL on the Ava & Liam seed record (add optional `heroImageUrl` on the sample-party seed only — not a schema change; the existing themes system already supports background art).
- In the party Overview header, when `heroImageUrl` is present render an art-directed banner with plum gradient overlay, party name in serif, date + location in rounded sans. Mobile: shorter crop, no text truncation.
- Guard: only the Ava & Liam sample gets the wedding image; all other parties keep their theme art or the festive gradient.

## 5. Authenticated shell

- Refresh `src/routes/app.tsx` and party workspace header (`src/routes/party.$id.tsx`): sticky top bar with logo lockup + primary nav, cream panel background, plum accents, softer card shadows.
- Overview header gets an always-visible action row with real links (not decorative): **Reveal**, **Day-of**, **Guest link (copy)**, **Bring Board**, **Photo Drop** — each hidden if the underlying feature isn't set up (no dead buttons).
- Mobile: bottom action bar with safe-area insets (`pb-[env(safe-area-inset-bottom)]`) for the Overview primary actions.

## 6. Mobile + a11y gates

- Audit at 320/375/390: `min-w-0` on flex text children, `truncate` on titles, `min-h-11` on icon buttons, grid promotion at `sm:`.
- Add `focus-visible:ring-2 ring-ring` defaults on interactive tokens; verify contrast for muted text on cream.
- Never encode state by color alone (add icon + text to status chips).

## 7. Quality gate

- Typecheck (tsgo), lint, build. Playwright walk of `/`, `/talk`, `/party/<sample>`, `/party/<sample>/reveal`, `/party/<sample>/day-of`, `/rsvp/<sample-token>` at 375 and 1280. Screenshot each and eyeball.

## Explicitly out of scope for this batch

- Publishing / custom domain changes.
- Any schema migration, RLS or RPC change.
- New product features (composer, household editor, holiday-pack picker) — those stay on the Batch 2 backlog.
- Sending email/SMS, QR redesign, dark mode.

## Files expected to change

- `src/styles.css`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/app.tsx`, `src/routes/party.$id.tsx`, `src/components/brand.tsx`, `src/components/overview-tab.tsx`, `src/components/auth-nav.tsx`, `src/lib/party-context.tsx` (sample seed hero URL only), plus new `src/components/logo.tsx`, `src/assets/confetti-hero.jpg.asset.json`, `src/assets/ava-liam.jpg.asset.json`, `public/favicon.svg`.

Approve and I'll execute end-to-end, then report changed files + gate results.
