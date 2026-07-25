-- Idempotent import keys for signed-out → signed-in handoff.
-- Both columns are nullable so existing rows are unaffected; the unique
-- indexes are partial (WHERE key IS NOT NULL) so ordinary rows keep NULL.

ALTER TABLE public.gathering_drafts
  ADD COLUMN IF NOT EXISTS import_idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS gathering_drafts_user_import_key_uniq
  ON public.gathering_drafts (user_id, import_idempotency_key)
  WHERE import_idempotency_key IS NOT NULL;

ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS import_local_id text;

CREATE UNIQUE INDEX IF NOT EXISTS parties_user_import_local_id_uniq
  ON public.parties (user_id, import_local_id)
  WHERE import_local_id IS NOT NULL;