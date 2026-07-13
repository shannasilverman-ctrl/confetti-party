
## Goal

Reshape the Theme tab so it feels like a product page for the party's look (browsing decor, seeing inspiration, adding to cart in one motion), and reshape the Shopping tab's "Shop needed items" into a real cart that hands off cleanly to Amazon / Target / Walmart. No changes to budget math, RSVP, wizard, auth, or the theme data model beyond what's listed.

## Part A — Theme design as a product page

### A1. More inspiration imagery per theme (data)

Extend `Theme` in `src/lib/themes.ts` with:

```ts
inspiration: {
  entry: string;
  activity: string;
  photoSpot: string;
}
```

(Existing `heroImage` and `visionBoard.{table,decor,dessert}` stay.) Generate 3 new images per theme (20 themes × 3 = 60 fresh assets) matching the existing style: `entry` = welcome moment, `activity` = play/craft zone, `photoSpot` = the wall/backdrop already described in the setup zones. Saved under `src/assets/themes/<slug>-{entry,activity,photo}.jpg` and imported the same way as today.

### A2. Product-page layout for the active theme

Rebuild `src/components/theme-tab.tsx` into these sections (mobile-first, verified at 375px):

1. **Gallery strip** (unchanged behavior, tightened) — small horizontal thumbnails to switch themes. Current chosen theme highlighted. Moves out of the way once a theme is picked.
2. **Product hero** — large hero image left, on the right: theme name, vibe, palette chips, and two CTAs:
   - Primary: **"Shop this theme — $NN"** (see A4).
   - Secondary: "Add DIYs to checklist" (bulk-adds all DIY ideas to tasks).
   Below the CTAs: small status line — "X of Y items already in your shopping list · $Z estimated".
3. **Inspiration board** — 6-tile masonry (`table, decor, dessert, entry, activity, photoSpot`). Each tile:
   - Tap opens a lightweight lightbox (existing `Dialog`) with the image + caption.
   - "Pin" toggle in the corner stores the tile id on the party (see A3).
   - "Shop this look" button under the lightbox jumps to the matching decor ideas below (anchor + subtle highlight).
4. **Decor ideas as product tiles** (replaces the text list). Grid of cards, one per idea:
   - Thumbnail = the vision-board image most related to the idea (map by bucket/keyword; fallback = decor tile).
   - Title, DIY/Buy chip, bucket, and estimated price.
   - Primary action:
     - Buy tile → **Add to cart** (adds to shopping list). Shows "In cart · $NN" once added.
     - DIY tile → **Add to checklist**.
   - Buy tiles also show three tiny retailer chips (Amazon/Target/Walmart) that open a search in a new tab, same helpers as today.
5. **Styling tips** and **Setup plan** — kept, restyled to match the new card language (no functional change).

### A3. Pinned inspiration (lightweight)

Add `pinnedInspiration?: string[]` to `Party` (jsonb-persisted for logged-in users, local for demo). Values are `${themeId}:${tileKey}`. Pinned tiles get a filled pin badge on the board and appear as a small "Your pins" strip above the inspiration board when non-empty. No new tab, no gallery view.

### A4. "Shop this theme" one-click bundle

New helper on `src/lib/party-context.tsx`: `addThemeToShopping(party, theme)` iterates every `Buy` idea in `theme.decorIdeas`, skips ones already present in `shoppingItems` by name, and appends the rest as "Decorations" items. Returns the updated party plus a summary `{added, skipped, estTotal}`.

Wired to the hero CTA. On click:
- If nothing to add → toast "Everything from this theme is already in your list".
- Otherwise → confirm dialog: "Add N items · est $M to your shopping list?" with a scrollable preview list and a "Skip DIYs" note. Confirm → apply + `celebrate("small")` at the click origin + toast "Added N items".

## Part B — Cart with retailer handoff (Shopping tab)

### B1. Cart view replaces the current "Shop needed items" dialog

In `src/components/shopping-tab.tsx`, replace the current dialog with a Cart dialog that groups items by retailer preference:

- Each item picks a retailer (default: Amazon). User can switch between Amazon/Target/Walmart with a chip row per item. Selection persists on the item as `preferredRetailer?: "amazon" | "target" | "walmart"` (new optional field on `ShoppingItem`, jsonb-persisted).
- Groups are rendered as three collapsible sections. Each group header shows count + total estimate and a big **"Open N searches on <Retailer>"** button that opens each item's search in a new tab (spaced ~150ms apart so popup blockers don't swallow them; first click uses the user gesture directly, rest are queued behind a small "Continue opening" prompt if the browser blocks).
- Under the group button: "Mark all as In cart" chip that flips those items' status to `in-cart` (no purchase yet — purchase is still confirmed on the row).
- Existing "Copy list" and per-item retailer chips stay.
- Existing affiliate disclosure stays visible at the bottom.

### B2. Cart badge

The Shopping tab trigger in `src/routes/party.$id.tsx` shows a small badge with the count of items whose status is `needed` or `in-cart`. Purely visual, no behavior change.

## Out of scope

Real product APIs, real prices, per-idea AI-generated product photos, checkout inside the app, changing the wizard, RSVP page, budget math, purchase-to-expense wiring, dark mode, mobile-app packaging.

## Files touched

- `src/lib/themes.ts` — add `inspiration` per theme + new image imports
- `src/assets/themes/*-{entry,activity,photo}.jpg` — 60 new generated images
- `src/lib/party-context.tsx` — `pinnedInspiration`, `preferredRetailer` on ShoppingItem, `addThemeToShopping` helper, jsonb persistence
- `src/components/theme-tab.tsx` — rebuilt as product page + inspiration board + product tiles + Shop-the-theme flow
- `src/components/shopping-tab.tsx` — cart dialog grouped by retailer, staggered tab opening, per-item retailer chip, mark-all-in-cart
- `src/routes/party.$id.tsx` — Shopping tab badge count
- `src/integrations/supabase/types.ts` — regen types after the jsonb shape widens (no schema change; jsonb column already exists)

## Verification (before I mark done)

Playwright at 375px and 1280px, signed-in test user:
1. Pick a theme → see product hero, click "Shop this theme" → confirm → items appear on Shopping tab with correct estimated total.
2. Pin two inspiration tiles → refresh page → pins persist.
3. Open Cart from Shopping tab → switch one item's retailer to Target → click "Open on Target" → new tab opens Target search with the right query.
4. Mark an item Purchased with an actual price → budget projected total updates and stays consistent with existing math (regression check).
5. Demo (logged-out) party: theme product page still works locally; Shop-the-theme adds to the local demo state and the existing "sign up to save" note applies.
