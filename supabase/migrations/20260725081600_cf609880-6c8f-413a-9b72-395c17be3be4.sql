-- Forward-only migration: self-serve account deletion.
--
-- Deletes the caller's own auth.users row. Existing ON DELETE CASCADE
-- foreign keys on public.parties, public.gathering_drafts,
-- public.talk_sessions, public.talk_transcripts remove all owned rows
-- transactionally as part of the same statement.
--
-- Requires a recent sign-in (auth_time within 15 minutes) as a generic
-- reauth threshold — the JWT's `iat` claim is the closest portable proxy
-- across email/password + social providers.
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid := auth.uid();
  issued_at_epoch bigint;
  issued_at timestamptz;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  -- Fresh-session gate: reject if the current access token was issued
  -- more than 15 minutes ago. Generic across providers; caller UX asks
  -- the user to sign in again when this fails.
  BEGIN
    issued_at_epoch := ((current_setting('request.jwt.claims', true))::jsonb ->> 'iat')::bigint;
  EXCEPTION WHEN others THEN
    issued_at_epoch := NULL;
  END;
  IF issued_at_epoch IS NULL THEN
    RAISE EXCEPTION 'reauth required';
  END IF;
  issued_at := to_timestamp(issued_at_epoch);
  IF now() - issued_at > interval '15 minutes' THEN
    RAISE EXCEPTION 'reauth required';
  END IF;

  -- Cascade removes owned rows in public.parties, gathering_drafts,
  -- talk_sessions, talk_transcripts (all FKs use ON DELETE CASCADE).
  DELETE FROM auth.users WHERE id = uid;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Lock down: signed-in callers only.
REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_own_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;