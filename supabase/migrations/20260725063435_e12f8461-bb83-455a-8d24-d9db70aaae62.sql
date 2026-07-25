-- Rolling AI turn-limit anchor for gathering_drafts.
--
-- Prior schema stored only `ai_turns` (lifetime counter) plus `updated_at`,
-- which conflated data changes with rate-limit windows: any lifetime turn
-- count above the cap kept blocking new hours forever. This adds an explicit
-- window anchor so the limit is truly rolling per hour.
ALTER TABLE public.gathering_drafts
  ADD COLUMN IF NOT EXISTS ai_turns_hour_start timestamptz;

-- Idempotency guard for Talk confirm: prevents the same draft from ever
-- pointing at two different confirmed parties (double-click / retry race).
-- Partial unique index because most drafts are still active (NULL).
CREATE UNIQUE INDEX IF NOT EXISTS gathering_drafts_confirmed_party_id_uidx
  ON public.gathering_drafts(confirmed_party_id)
  WHERE confirmed_party_id IS NOT NULL;