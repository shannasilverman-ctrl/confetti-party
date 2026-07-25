
-- Clarify the existing partial unique index semantics. It prevents two DRAFTS
-- from pointing at the same PARTY row; it does not, by itself, prevent one
-- draft from creating two parties (that guarantee is provided by
-- confirm_gathering_draft below).
COMMENT ON INDEX public.gathering_drafts_confirmed_party_id_uidx IS
  'Prevents two drafts from claiming the same party. One-party-per-draft is enforced by confirm_gathering_draft().';

-- ---------- Atomic per-hour rate limit ----------
CREATE OR REPLACE FUNCTION public.bump_ai_turn(
  _draft_id uuid,
  _cap int,
  _window_ms int
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.gathering_drafts%ROWTYPE;
  now_ts timestamptz := now();
  within_window boolean;
  new_turns int;
  new_start timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '28000';
  END IF;
  IF _cap IS NULL OR _cap <= 0 OR _cap > 10000 THEN
    RAISE EXCEPTION 'invalid cap';
  END IF;
  IF _window_ms IS NULL OR _window_ms <= 0 OR _window_ms > 24*60*60*1000 THEN
    RAISE EXCEPTION 'invalid window';
  END IF;

  SELECT * INTO d FROM public.gathering_drafts
    WHERE id = _draft_id AND user_id = auth.uid()
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft not found' USING ERRCODE = 'P0002';
  END IF;

  within_window := d.ai_turns_hour_start IS NOT NULL
    AND (extract(epoch FROM (now_ts - d.ai_turns_hour_start)) * 1000) < _window_ms;
  IF within_window THEN
    new_turns := COALESCE(d.ai_turns, 0) + 1;
    new_start := d.ai_turns_hour_start;
  ELSE
    new_turns := 1;
    new_start := now_ts;
  END IF;

  IF new_turns > _cap THEN
    RETURN jsonb_build_object('allowed', false, 'turns', new_turns, 'hour_start', new_start);
  END IF;

  UPDATE public.gathering_drafts
     SET ai_turns = new_turns,
         ai_turns_hour_start = new_start
   WHERE id = d.id;

  RETURN jsonb_build_object('allowed', true, 'turns', new_turns, 'hour_start', new_start);
END;
$$;

REVOKE ALL ON FUNCTION public.bump_ai_turn(uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_ai_turn(uuid, int, int) TO authenticated;

-- ---------- Atomic confirm: insert party + claim draft in one transaction ----------
CREATE OR REPLACE FUNCTION public.confirm_gathering_draft(
  _draft_id uuid,
  _party jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.gathering_drafts%ROWTYPE;
  uid uuid := auth.uid();
  new_party_id uuid;
  clean_name text;
  clean_occasion text;
  clean_date date;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '28000';
  END IF;
  IF _party IS NULL OR jsonb_typeof(_party) <> 'object' THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  -- Basic input validation on the required not-null columns.
  clean_name := btrim(COALESCE(_party->>'name', ''));
  clean_occasion := btrim(COALESCE(_party->>'occasion', ''));
  IF length(clean_name) = 0 OR length(clean_name) > 200 THEN
    RAISE EXCEPTION 'invalid name';
  END IF;
  IF length(clean_occasion) = 0 OR length(clean_occasion) > 40 THEN
    RAISE EXCEPTION 'invalid occasion';
  END IF;
  BEGIN
    clean_date := (_party->>'date')::date;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'invalid date';
  END;

  -- Lock the draft; ownership is enforced by user_id predicate.
  SELECT * INTO d FROM public.gathering_drafts
    WHERE id = _draft_id AND user_id = uid
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft not found' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent fast path.
  IF d.status = 'confirmed' AND d.confirmed_party_id IS NOT NULL THEN
    RETURN jsonb_build_object('party_id', d.confirmed_party_id, 'already_confirmed', true);
  END IF;

  INSERT INTO public.parties (
    user_id, name, occasion, date, start_time, location,
    guest_estimate, budget, theme, theme_id, holiday_pack_id, host_note,
    tasks, budget_categories, shopping_items, timeline, bring_board
  ) VALUES (
    uid,
    clean_name,
    clean_occasion,
    clean_date,
    NULLIF(btrim(COALESCE(_party->>'startTime','')), ''),
    NULLIF(btrim(COALESCE(_party->>'location','')), ''),
    GREATEST(0, LEAST(500, COALESCE((_party->>'guestEstimate')::int, 0))),
    GREATEST(0, LEAST(100000, COALESCE((_party->>'budget')::numeric, 0))),
    COALESCE(_party->>'theme',''),
    NULLIF(_party->>'themeId',''),
    NULLIF(_party->>'holidayPackId',''),
    NULLIF(btrim(COALESCE(_party->>'hostNote','')), ''),
    COALESCE(_party->'tasks','[]'::jsonb),
    COALESCE(_party->'budgetCategories','[]'::jsonb),
    COALESCE(_party->'shoppingItems','[]'::jsonb),
    COALESCE(_party->'timeline','[]'::jsonb),
    COALESCE(_party->'bringBoard','[]'::jsonb)
  ) RETURNING id INTO new_party_id;

  UPDATE public.gathering_drafts
     SET status = 'confirmed',
         confirmed_party_id = new_party_id
   WHERE id = d.id;

  RETURN jsonb_build_object('party_id', new_party_id, 'already_confirmed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_gathering_draft(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_gathering_draft(uuid, jsonb) TO authenticated;
