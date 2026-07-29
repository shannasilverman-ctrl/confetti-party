-- Timed Talk plans must carry the host-confirmed event time zone atomically
-- with the materialized party. The client canonicalizes IANA aliases before
-- confirmation; this server boundary independently validates the exact zone
-- name and fails closed when a timed payload omits it.

CREATE OR REPLACE FUNCTION public.confirm_gathering_draft(_draft_id uuid, _party jsonb)
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
  clean_start_time text;
  clean_location text;
  clean_theme text;
  clean_theme_id text;
  clean_pack_id text;
  clean_host_note text;
  clean_profile jsonb := '{}'::jsonb;
  clean_event_time_zone text;
  profile_key text;
  guest_est int;
  budget_val int;
  profile_num int;
  allowed_occasions text[] := ARRAY[
    'birthday','baby-shower','graduation','holiday',
    'dinner-party','game-day','cookout','other'
  ];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF _party IS NULL OR jsonb_typeof(_party) <> 'object' THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  SELECT * INTO d
    FROM public.gathering_drafts
    WHERE id = _draft_id AND user_id = auth.uid()
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft not found';
  END IF;

  IF d.status = 'confirmed' AND d.confirmed_party_id IS NOT NULL THEN
    RETURN jsonb_build_object('party_id', d.confirmed_party_id, 'already_confirmed', true);
  END IF;

  clean_name := btrim(COALESCE(_party->>'name', ''));
  clean_occasion := btrim(COALESCE(_party->>'occasion', ''));
  IF length(clean_name) = 0 OR length(clean_name) > 120 THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;
  IF length(clean_occasion) = 0 OR length(clean_occasion) > 60 THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;
  IF NOT (clean_occasion = ANY (allowed_occasions)) THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  BEGIN
    clean_date := (_party->>'date')::date;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'invalid payload';
  END;
  IF clean_date IS NULL THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  clean_start_time := NULLIF(btrim(COALESCE(_party->>'startTime', '')), '');
  IF clean_start_time IS NOT NULL AND (
    length(clean_start_time) > 8 OR
    clean_start_time !~ '^(([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?|([1-9]|1[0-2]):[0-5][0-9] (AM|PM))$'
  ) THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  clean_location := NULLIF(btrim(COALESCE(_party->>'location', '')), '');
  IF clean_location IS NOT NULL AND length(clean_location) > 200 THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  clean_theme := NULLIF(btrim(COALESCE(_party->>'theme', '')), '');
  IF clean_theme IS NOT NULL AND length(clean_theme) > 60 THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;
  clean_theme_id := NULLIF(btrim(COALESCE(_party->>'themeId', '')), '');
  IF clean_theme_id IS NOT NULL AND length(clean_theme_id) > 60 THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;
  clean_pack_id := NULLIF(btrim(COALESCE(_party->>'holidayPackId', '')), '');
  IF clean_pack_id IS NOT NULL AND length(clean_pack_id) > 60 THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;
  clean_host_note := NULLIF(btrim(COALESCE(_party->>'hostNote', '')), '');
  IF clean_host_note IS NOT NULL AND length(clean_host_note) > 500 THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  BEGIN
    guest_est := COALESCE((_party->>'guestEstimate')::int, 0);
    budget_val := COALESCE((_party->>'budget')::numeric, 0)::int;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'invalid payload';
  END;
  IF guest_est < 0 OR guest_est > 2000 OR budget_val < 0 OR budget_val > 1000000 THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  PERFORM public._validate_confirm_collection(_party->'tasks', 200, 4000);
  PERFORM public._validate_confirm_collection(_party->'budgetCategories', 100, 2000);
  PERFORM public._validate_confirm_collection(_party->'shoppingItems', 500, 4000);
  PERFORM public._validate_confirm_collection(_party->'timeline', 100, 2000);
  PERFORM public._validate_confirm_collection(_party->'bringBoard', 500, 4000);

  IF _party ? 'planningProfile' AND _party->'planningProfile' IS NOT NULL THEN
    clean_profile := _party->'planningProfile';
    IF jsonb_typeof(clean_profile) <> 'object' OR octet_length(clean_profile::text) > 2000 THEN
      RAISE EXCEPTION 'invalid payload';
    END IF;
    FOR profile_key IN SELECT jsonb_object_keys(clean_profile) LOOP
      IF profile_key NOT IN (
        'version','honoreeAge','expectedKids','expectedAdults','effort','format',
        'foodRole','foodServiceStyle','eventTimeZone'
      ) THEN
        RAISE EXCEPTION 'invalid payload';
      END IF;
    END LOOP;
    IF COALESCE(clean_profile->>'version', '') <> '1' THEN
      RAISE EXCEPTION 'invalid payload';
    END IF;
    IF clean_profile ? 'honoreeAge' THEN
      BEGIN profile_num := (clean_profile->>'honoreeAge')::int;
      EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid payload'; END;
      IF profile_num < 1 OR profile_num > 120 THEN RAISE EXCEPTION 'invalid payload'; END IF;
    END IF;
    IF clean_profile ? 'expectedKids' THEN
      BEGIN profile_num := (clean_profile->>'expectedKids')::int;
      EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid payload'; END;
      IF profile_num < 0 OR profile_num > 500 THEN RAISE EXCEPTION 'invalid payload'; END IF;
    END IF;
    IF clean_profile ? 'expectedAdults' THEN
      BEGIN profile_num := (clean_profile->>'expectedAdults')::int;
      EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid payload'; END;
      IF profile_num < 0 OR profile_num > 500 THEN RAISE EXCEPTION 'invalid payload'; END IF;
    END IF;
    IF clean_profile ? 'effort' AND clean_profile->>'effort' NOT IN ('easy','balanced','all-out') THEN
      RAISE EXCEPTION 'invalid payload';
    END IF;
    IF clean_profile ? 'format' AND clean_profile->>'format' NOT IN ('home','venue','help-me-choose') THEN
      RAISE EXCEPTION 'invalid payload';
    END IF;
    IF clean_profile ? 'foodRole'
      AND clean_profile->>'foodRole' NOT IN ('light-bites','full-meal','grazing')
    THEN
      RAISE EXCEPTION 'invalid payload';
    END IF;
    IF clean_profile ? 'foodServiceStyle'
      AND clean_profile->>'foodServiceStyle' NOT IN ('self-serve','family-style','served')
    THEN
      RAISE EXCEPTION 'invalid payload';
    END IF;
    IF clean_profile ? 'eventTimeZone' THEN
      clean_event_time_zone := NULLIF(btrim(clean_profile->>'eventTimeZone'), '');
      IF clean_event_time_zone IS NULL
        OR length(clean_event_time_zone) > 80
        OR NOT EXISTS (
          SELECT 1
          FROM pg_catalog.pg_timezone_names
          WHERE name = clean_event_time_zone
        )
      THEN
        RAISE EXCEPTION 'invalid payload';
      END IF;
      clean_profile := jsonb_set(
        clean_profile,
        '{eventTimeZone}',
        to_jsonb(clean_event_time_zone),
        true
      );
    END IF;
  END IF;

  IF clean_start_time IS NOT NULL AND clean_event_time_zone IS NULL THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  INSERT INTO public.parties (
    user_id, name, occasion, date, start_time, location,
    guest_estimate, budget, theme, theme_id, holiday_pack_id,
    planning_profile, host_note, tasks, guests, budget_categories,
    shopping_items, timeline, pinned_inspiration, households, bring_board,
    host_updates, checkins
  )
  VALUES (
    auth.uid(), clean_name, clean_occasion, clean_date, clean_start_time,
    clean_location, guest_est, budget_val, COALESCE(clean_theme, ''),
    clean_theme_id, clean_pack_id, clean_profile, clean_host_note,
    COALESCE(_party->'tasks', '[]'::jsonb), '[]'::jsonb,
    COALESCE(_party->'budgetCategories', '[]'::jsonb),
    COALESCE(_party->'shoppingItems', '[]'::jsonb),
    COALESCE(_party->'timeline', '[]'::jsonb), '[]'::jsonb, '[]'::jsonb,
    COALESCE(_party->'bringBoard', '[]'::jsonb), '[]'::jsonb, '{}'::jsonb
  )
  RETURNING id INTO new_party_id;

  UPDATE public.gathering_drafts
    SET status = 'confirmed', confirmed_party_id = new_party_id, updated_at = now()
    WHERE id = d.id;

  RETURN jsonb_build_object('party_id', new_party_id, 'already_confirmed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_gathering_draft(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_gathering_draft(uuid, jsonb) TO authenticated;
