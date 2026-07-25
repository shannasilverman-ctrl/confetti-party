
# Security hardening — token RPCs and public projections

I'm in plan mode and can't run the migration without approval. Approving this plan runs the migration and code changes in one batch.

## Scope

One additive Supabase migration replacing five SECURITY DEFINER functions in place (CREATE OR REPLACE, no data touched, no columns dropped), plus small frontend adjustments to match the tightened public projections and single-use claim receipt. No RLS, table, or column changes. No user data deleted.

## Migration (single file)

### 1. `get_rsvp_party(token uuid)` — tighten public projection

Return only:
- `name`, `date`, `start_time`, `location`, `occasion`, `theme_id`, `theme`, `host_note`, `holiday_pack_id`
- `host_updates` sanitized to `{ id, text, at }` only (drop any other keys)
- `photo_drop` limited to `{ provider, label, url, notes }` when configured, else null
- `bring_board` items reduced to `{ id, category, label, qty, unit, status }` — remove `dietaryTags`, `assigneeName`, `assigneeHousehold`, `notes`
- `yes_count`, `maybe_count`, `total_count`

Remove: `guest_first_names` entirely.

### 2. `list_bring_board(token uuid)` — same reduction

Return items with `{ id, category, label, qty, unit, status }` only. Drop `dietaryTags`, `assigneeName`, `assigneeHousehold`, `notes`.

### 3. `claim_bring_item` — atomic + validated

- `SELECT ... FROM parties WHERE rsvp_token = token FOR UPDATE` before inspecting `bring_board`.
- Validate: `item_id` non-empty, length ≤ 64, matches `^[A-Za-z0-9_\-]+$`; `guest_name` 1..80 after btrim; `household_label` NULL or ≤ 80; `qty` NULL or `> 0 AND <= 999`.
- Verify `jsonb_typeof(bring_board) = 'array'` and cap size at 500.
- On success set `claimSecret = gen_random_uuid()`, persist, and return `{ ok: true, claimSecret }` — the only time the secret is ever returned.
- Preserve `SET search_path = public`.

### 4. `release_bring_item` — receipt-only for anonymous

- Remove the name-fallback branch entirely.
- Require `claim_secret` non-null and exact match against stored `claimSecret`.
- Same `FOR UPDATE` lock, same input validation on `item_id` / `guest_name`.
- Legacy items without `claimSecret` cannot be released via this RPC. Host reopens them from the authenticated Bring Board editor (already writes `bring_board` directly under RLS as owner — no code change needed).

### 5. `submit_rsvp` — collapse overloads, validate

- `DROP FUNCTION public.submit_rsvp(uuid, text, text, int, int)` (the older 5-arg overload). Keep only the 8-arg overload with `household_label`, `dietary`, `allergens`.
- Add validation: `dietary` and `allergens` must be `jsonb` arrays, length ≤ 20, each element a text ≤ 40 chars. Cap resulting `guests` array size at 500. Preserve existing wildcard escaping and search_path.

### 6. Grants

At end of migration:
```
REVOKE EXECUTE ON FUNCTION
  public.get_rsvp_party(uuid),
  public.list_bring_board(uuid),
  public.claim_bring_item(uuid, text, text, text, numeric),
  public.release_bring_item(uuid, text, text, text),
  public.submit_rsvp(uuid, text, text, int, int, text, jsonb, jsonb)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION ... TO anon, authenticated;
```
(exact arg lists matched to current signatures).

## Frontend changes

- `src/lib/rsvp.functions.ts` — `PartyView`: remove `guest_first_names`; `PublicBringItem`: remove `dietaryTags`, `assigneeName`, `assigneeHousehold`, `notes`.
- `src/routes/rsvp.$token.tsx` — remove any "Who's coming" chip row that consumed `guest_first_names`; keep aggregate counts.
- `src/components/public-bring-board.tsx`:
  - Drop rendering of dietary tags, "Claimed by …", and the name-based `mine` detection. `mine` = `!!secrets[it.id]` only.
  - After a successful claim, immediately persist the returned `claimSecret` to localStorage (already done) and never surface it in UI.
- Types: regenerated after migration approval.

## Verification (post-apply)

- `pg_get_functiondef` on all five functions — confirm bodies match.
- `pg_proc.proacl` — confirm no PUBLIC EXECUTE; only anon/authenticated.
- Concurrency: two parallel `claim_bring_item` calls on the same open item → exactly one `{ok:true}`, one `{ok:false, reason:'unavailable'}`.
- Release: wrong/missing secret → `{ok:false}`; correct secret → `{ok:true}`.
- `get_rsvp_party` / `list_bring_board` JSON keys asserted to exclude the prohibited set.
- `bunx tsgo` typecheck, `bun run build`, existing tests.

## Out of scope

Publishing, RLS changes, host-side Bring Board editor (already RLS-scoped), any UI redesign.
