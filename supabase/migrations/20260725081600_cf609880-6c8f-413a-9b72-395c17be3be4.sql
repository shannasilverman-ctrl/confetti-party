-- Forward-only migration: self-serve account deletion.
--
-- Deletes the caller's own auth.users row. Existing ON DELETE CASCADE
-- foreign keys on public.parties, public.gathering_drafts,
-- public.talk_sessions, public.talk_transcripts remove all owned rows
-- transactionally as part of the same statement.
--
-- Requires a real authentication method within the last 15 minutes.
-- JWT `iat` is deliberately NOT used: access-token refresh advances iat
-- without asking the person to prove control of their login method.
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, auth
AS $$
DECLARE
  uid uuid := auth.uid();
  claims jsonb := auth.jwt();
  authenticated_at_epoch bigint;
  authenticated_at timestamptz;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  -- AMR timestamps record the actual password/OAuth/OTP/etc. proof and
  -- survive routine token refresh. Fail closed when AMR is absent or bad.
  BEGIN
    SELECT max((method->>'timestamp')::bigint)
      INTO authenticated_at_epoch
      FROM jsonb_array_elements(COALESCE(claims->'amr', '[]'::jsonb)) AS method
     WHERE method->>'method' IN (
       'password','oauth','otp','totp','magiclink','recovery',
       'email/signup','invite','sso/saml'
     );
  EXCEPTION WHEN others THEN
    authenticated_at_epoch := NULL;
  END;
  IF authenticated_at_epoch IS NULL THEN
    RAISE EXCEPTION 'reauth required';
  END IF;
  authenticated_at := to_timestamp(authenticated_at_epoch);
  IF authenticated_at > now() + interval '1 minute'
     OR now() - authenticated_at > interval '15 minutes' THEN
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
