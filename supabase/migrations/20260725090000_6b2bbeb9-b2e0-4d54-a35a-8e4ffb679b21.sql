-- Atomically reserve an OpenAI Realtime session across every Worker isolate.
--
-- The previous route performed SELECT -> INSERT -> SELECT with an in-process
-- mutex. That was safe on one isolate but two edge isolates could both admit
-- a third concurrent session. This transaction-scoped advisory lock makes the
-- limit decision and insert one serialized database operation per user.

CREATE OR REPLACE FUNCTION public.reserve_talk_session(
  _draft_id uuid DEFAULT NULL,
  _model text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  hourly_count integer;
  concurrent_count integer;
  new_session_id uuid;
  clean_model text := NULLIF(btrim(COALESCE(_model, '')), '');
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  IF clean_model IS NULL OR length(clean_model) > 100 THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  IF _draft_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.gathering_drafts
     WHERE id = _draft_id AND user_id = caller_id
  ) THEN
    RAISE EXCEPTION 'draft not found';
  END IF;

  -- Same user + same seed maps to the same bigint on every connection.
  -- The lock is released automatically at transaction end, including errors.
  PERFORM pg_advisory_xact_lock(hashtextextended(caller_id::text, 726331));

  SELECT count(*)::integer
    INTO hourly_count
    FROM public.talk_sessions
   WHERE user_id = caller_id
     AND started_at >= now() - interval '1 hour';

  IF hourly_count >= 5 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'rate_limited');
  END IF;

  SELECT count(*)::integer
    INTO concurrent_count
    FROM public.talk_sessions
   WHERE user_id = caller_id
     AND ended_at IS NULL
     AND started_at >= now() - interval '15 minutes';

  IF concurrent_count >= 2 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'too_many_concurrent');
  END IF;

  INSERT INTO public.talk_sessions (user_id, draft_id, model)
  VALUES (caller_id, _draft_id, clean_model)
  RETURNING id INTO new_session_id;

  RETURN jsonb_build_object(
    'allowed', true,
    'session_id', new_session_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_talk_session(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_talk_session(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reserve_talk_session(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_talk_session(uuid, text) TO service_role;
