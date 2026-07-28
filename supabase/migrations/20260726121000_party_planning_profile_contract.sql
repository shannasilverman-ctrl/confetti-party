-- Carry the curated party-intelligence profile through Talk confirmation and
-- expose only a narrow, non-identifying RSVP context to guests.

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
    clean_start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
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
        'version','honoreeAge','expectedKids','expectedAdults','effort','format'
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

CREATE OR REPLACE FUNCTION public.get_rsvp_party(token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  p public.parties%ROWTYPE;
  yes_count int := 0;
  maybe_count int := 0;
  total_count int := 0;
  guest jsonb;
  public_bring jsonb := '[]'::jsonb;
  public_updates jsonb := '[]'::jsonb;
  public_photo jsonb := NULL;
  public_rsvp_context jsonb := NULL;
  item jsonb;
  upd jsonb;
  photo_provider text;
  photo_url text;
  age_text text;
  age_value int;
BEGIN
  SELECT * INTO p FROM public.parties WHERE rsvp_token = token LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF jsonb_typeof(p.guests) = 'array' THEN
    FOR guest IN SELECT * FROM jsonb_array_elements(p.guests) LOOP
      total_count := total_count + 1;
      IF guest->>'rsvp' = 'yes' THEN yes_count := yes_count + 1; END IF;
      IF guest->>'rsvp' = 'maybe' THEN maybe_count := maybe_count + 1; END IF;
    END LOOP;
  END IF;

  IF jsonb_typeof(p.bring_board) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(p.bring_board) LOOP
      public_bring := public_bring || jsonb_build_array(jsonb_build_object(
        'id', item->>'id',
        'category', item->>'category',
        'label', item->>'label',
        'qty', COALESCE((item->>'qty')::numeric, 1),
        'unit', item->>'unit',
        'status', COALESCE(item->>'status', 'open')
      ));
    END LOOP;
  END IF;

  IF jsonb_typeof(p.host_updates) = 'array' THEN
    FOR upd IN SELECT * FROM jsonb_array_elements(p.host_updates) LOOP
      public_updates := public_updates || jsonb_build_array(jsonb_build_object(
        'id', upd->>'id',
        'text', upd->>'text',
        'at', upd->>'at'
      ));
    END LOOP;
  END IF;

  IF p.photo_drop IS NOT NULL AND jsonb_typeof(p.photo_drop) = 'object' THEN
    photo_provider := p.photo_drop->>'provider';
    photo_url := btrim(p.photo_drop->>'url');
    IF photo_provider IN ('dropbox_request', 'google_photos', 'kululu', 'guestpix', 'custom')
       AND char_length(photo_url) BETWEEN 9 AND 2048
       AND photo_url ~* '^https://[^[:space:]/?#]+([/?#]|$)' THEN
      public_photo := jsonb_build_object(
        'provider', photo_provider,
        'label', left(nullif(btrim(p.photo_drop->>'label'), ''), 80),
        'url', photo_url,
        'notes', left(
          nullif(btrim(COALESCE(p.photo_drop->>'notes', p.photo_drop->>'note')), ''),
          160
        )
      );
    END IF;
  END IF;

  IF p.occasion = 'birthday' AND jsonb_typeof(p.planning_profile) = 'object' THEN
    age_text := p.planning_profile->>'honoreeAge';
    IF age_text ~ '^[0-9]{1,3}$' THEN
      age_value := age_text::int;
      IF age_value BETWEEN 4 AND 5 THEN
        public_rsvp_context := jsonb_build_object(
          'kind', 'preschool-birthday',
          'adultLabel', 'Adults staying',
          'kidLabel', 'Children coming',
          'kidHint', 'Include invited children and any siblings joining.'
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'name', p.name,
    'date', p.date,
    'start_time', p.start_time,
    'location', p.location,
    'occasion', p.occasion,
    'theme_id', p.theme_id,
    'theme', p.theme,
    'host_note', p.host_note,
    'holiday_pack_id', p.holiday_pack_id,
    'host_updates', public_updates,
    'bring_board', public_bring,
    'photo_drop', public_photo,
    'rsvp_context', public_rsvp_context,
    'yes_count', yes_count,
    'maybe_count', maybe_count,
    'total_count', total_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_rsvp_party(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rsvp_party(uuid) TO anon, authenticated, service_role;
