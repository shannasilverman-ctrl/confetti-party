
-- ============================================================
-- Atomic per-hour rate limit for Talk turns.
-- ============================================================
CREATE OR REPLACE FUNCTION public.bump_ai_turn(
  _draft_id uuid,
  _cap integer DEFAULT 40,
  _window_ms integer DEFAULT 3600000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.gathering_drafts%ROWTYPE;
  now_ts timestamptz := now();
  window_start timestamptz;
  new_turns integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF _cap IS NULL OR _cap <= 0 OR _cap > 1000 THEN
    RAISE EXCEPTION 'invalid cap';
  END IF;
  IF _window_ms IS NULL OR _window_ms <= 0 OR _window_ms > 24 * 3600 * 1000 THEN
    RAISE EXCEPTION 'invalid window';
  END IF;

  -- Row lock serializes concurrent turns on the same draft.
  SELECT * INTO d FROM public.gathering_drafts
    WHERE id = _draft_id AND user_id = auth.uid()
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft not found';
  END IF;

  window_start := COALESCE(d.ai_turns_hour_start, now_ts);
  IF now_ts - window_start >= make_interval(secs => _window_ms / 1000.0) THEN
    -- Window elapsed; reset.
    new_turns := 1;
    window_start := now_ts;
  ELSE
    new_turns := COALESCE(d.ai_turns, 0) + 1;
  END IF;

  IF new_turns > _cap THEN
    RETURN jsonb_build_object('allowed', false, 'turns', COALESCE(d.ai_turns, 0));
  END IF;

  UPDATE public.gathering_drafts
     SET ai_turns = new_turns,
         ai_turns_hour_start = window_start,
         updated_at = now_ts
   WHERE id = d.id;

  RETURN jsonb_build_object('allowed', true, 'turns', new_turns);
END;
$$;

REVOKE ALL ON FUNCTION public.bump_ai_turn(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_ai_turn(uuid, integer, integer) TO authenticated;

-- ============================================================
-- Transactional confirm: insert party and claim draft together.
-- Idempotent: if the draft was already confirmed, return the same party id.
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirm_gathering_draft(
  _draft_id uuid,
  _party jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d public.gathering_drafts%ROWTYPE;
  new_party_id uuid;
  clean_name text;
  clean_occasion text;
  clean_date date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF _party IS NULL OR jsonb_typeof(_party) <> 'object' THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  -- Lock the caller's draft row; also enforces ownership via user_id filter.
  SELECT * INTO d FROM public.gathering_drafts
    WHERE id = _draft_id AND user_id = auth.uid()
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft not found';
  END IF;

  -- Idempotent fast path.
  IF d.status = 'confirmed' AND d.confirmed_party_id IS NOT NULL THEN
    RETURN jsonb_build_object('party_id', d.confirmed_party_id, 'already_confirmed', true);
  END IF;

  clean_name := btrim(COALESCE(_party->>'name', ''));
  clean_occasion := btrim(COALESCE(_party->>'occasion', ''));
  IF length(clean_name) = 0 OR length(clean_name) > 120 THEN
    RAISE EXCEPTION 'invalid name';
  END IF;
  IF length(clean_occasion) = 0 OR length(clean_occasion) > 60 THEN
    RAISE EXCEPTION 'invalid occasion';
  END IF;
  BEGIN
    clean_date := (_party->>'date')::date;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'invalid date';
  END;

  INSERT INTO public.parties (
    user_id, name, occasion, date, start_time, location,
    guest_estimate, budget, theme, theme_id, holiday_pack_id,
    host_note, tasks, guests, budget_categories, shopping_items,
    timeline, pinned_inspiration, households, bring_board, host_updates, checkins
  )
  VALUES (
    auth.uid(),
    clean_name,
    clean_occasion,
    clean_date,
    NULLIF(btrim(COALESCE(_party->>'startTime', '')), ''),
    NULLIF(btrim(COALESCE(_party->>'location', '')), ''),
    GREATEST(0, LEAST(COALESCE((_party->>'guestEstimate')::int, 0), 2000)),
    GREATEST(0, LEAST(COALESCE((_party->>'budget')::numeric, 0)::int, 1000000)),
    COALESCE(_party->'theme', 'null'::jsonb),
    NULLIF(btrim(COALESCE(_party->>'themeId', '')), ''),
    NULLIF(btrim(COALESCE(_party->>'holidayPackId', '')), ''),
    NULLIF(btrim(COALESCE(_party->>'hostNote', '')), ''),
    COALESCE(_party->'tasks', '[]'::jsonb),
    '[]'::jsonb,
    COALESCE(_party->'budgetCategories', '[]'::jsonb),
    COALESCE(_party->'shoppingItems', '[]'::jsonb),
    COALESCE(_party->'timeline', '[]'::jsonb),
    '[]'::jsonb,
    '[]'::jsonb,
    COALESCE(_party->'bringBoard', '[]'::jsonb),
    '[]'::jsonb,
    '{}'::jsonb
  )
  RETURNING id INTO new_party_id;

  UPDATE public.gathering_drafts
     SET status = 'confirmed',
         confirmed_party_id = new_party_id,
         updated_at = now()
   WHERE id = d.id;

  RETURN jsonb_build_object('party_id', new_party_id, 'already_confirmed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_gathering_draft(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_gathering_draft(uuid, jsonb) TO authenticated;
