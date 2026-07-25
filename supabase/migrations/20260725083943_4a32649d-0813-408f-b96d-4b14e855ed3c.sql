-- Host timezone: optional IANA string on parties.
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS time_zone text NULL;

-- Public RSVP fetch: include time_zone.
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
  item jsonb;
  upd jsonb;
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
    public_photo := jsonb_build_object(
      'provider', p.photo_drop->>'provider',
      'label', p.photo_drop->>'label',
      'url', p.photo_drop->>'url',
      'notes', p.photo_drop->>'notes'
    );
  END IF;

  RETURN jsonb_build_object(
    'name', p.name,
    'date', p.date,
    'start_time', p.start_time,
    'time_zone', p.time_zone,
    'location', p.location,
    'occasion', p.occasion,
    'theme_id', p.theme_id,
    'theme', p.theme,
    'host_note', p.host_note,
    'holiday_pack_id', p.holiday_pack_id,
    'host_updates', public_updates,
    'bring_board', public_bring,
    'photo_drop', public_photo,
    'yes_count', yes_count,
    'maybe_count', maybe_count,
    'total_count', total_count
  );
END;
$function$;

-- Confirmation: accept timeZone with strict shape/length validation.
CREATE OR REPLACE FUNCTION public.confirm_gathering_draft(_draft_id uuid, _party jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  clean_time_zone text;
  guest_est int;
  budget_val int;
  allowed_occasions text[] := ARRAY[
    'birthday','wedding','shabbat','holiday','bbq','watch-party',
    'dinner-party','shower','graduation','custom','other'
  ];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF _party IS NULL OR jsonb_typeof(_party) <> 'object' THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  SELECT * INTO d FROM public.gathering_drafts
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
  IF length(clean_name) = 0 OR length(clean_name) > 120 THEN RAISE EXCEPTION 'invalid payload'; END IF;
  IF length(clean_occasion) = 0 OR length(clean_occasion) > 60 THEN RAISE EXCEPTION 'invalid payload'; END IF;
  IF NOT (clean_occasion = ANY (allowed_occasions)) THEN RAISE EXCEPTION 'invalid payload'; END IF;

  BEGIN
    clean_date := (_party->>'date')::date;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'invalid payload';
  END;
  IF clean_date IS NULL THEN RAISE EXCEPTION 'invalid payload'; END IF;

  clean_start_time := NULLIF(btrim(COALESCE(_party->>'startTime', '')), '');
  IF clean_start_time IS NOT NULL THEN
    IF length(clean_start_time) > 10 OR clean_start_time !~ '^[0-2][0-9]:[0-5][0-9](:[0-5][0-9])?$' THEN
      RAISE EXCEPTION 'invalid payload';
    END IF;
  END IF;

  clean_location := NULLIF(btrim(COALESCE(_party->>'location', '')), '');
  IF clean_location IS NOT NULL AND length(clean_location) > 200 THEN RAISE EXCEPTION 'invalid payload'; END IF;

  clean_theme := NULLIF(btrim(COALESCE(_party->>'theme', '')), '');
  IF clean_theme IS NOT NULL AND length(clean_theme) > 60 THEN RAISE EXCEPTION 'invalid payload'; END IF;

  clean_theme_id := NULLIF(btrim(COALESCE(_party->>'themeId', '')), '');
  IF clean_theme_id IS NOT NULL AND length(clean_theme_id) > 60 THEN RAISE EXCEPTION 'invalid payload'; END IF;

  clean_pack_id := NULLIF(btrim(COALESCE(_party->>'holidayPackId', '')), '');
  IF clean_pack_id IS NOT NULL AND length(clean_pack_id) > 60 THEN RAISE EXCEPTION 'invalid payload'; END IF;

  clean_host_note := NULLIF(btrim(COALESCE(_party->>'hostNote', '')), '');
  IF clean_host_note IS NOT NULL AND length(clean_host_note) > 500 THEN RAISE EXCEPTION 'invalid payload'; END IF;

  clean_time_zone := NULLIF(btrim(COALESCE(_party->>'timeZone', '')), '');
  IF clean_time_zone IS NOT NULL THEN
    IF length(clean_time_zone) > 60 OR clean_time_zone !~ '^[A-Za-z0-9_+\-/]+$' THEN
      RAISE EXCEPTION 'invalid payload';
    END IF;
  END IF;

  BEGIN
    guest_est := GREATEST(0, LEAST(COALESCE((_party->>'guestEstimate')::int, 0), 2000));
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid payload'; END;
  BEGIN
    budget_val := GREATEST(0, LEAST(COALESCE((_party->>'budget')::numeric, 0)::int, 1000000));
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid payload'; END;

  PERFORM public._validate_confirm_collection(_party->'tasks', 200, 4000);
  PERFORM public._validate_confirm_collection(_party->'budgetCategories', 100, 2000);
  PERFORM public._validate_confirm_collection(_party->'shoppingItems', 500, 4000);
  PERFORM public._validate_confirm_collection(_party->'timeline', 100, 2000);
  PERFORM public._validate_confirm_collection(_party->'bringBoard', 500, 4000);

  INSERT INTO public.parties (
    user_id, name, occasion, date, start_time, time_zone, location,
    guest_estimate, budget, theme, theme_id, holiday_pack_id,
    host_note, tasks, guests, budget_categories, shopping_items,
    timeline, pinned_inspiration, households, bring_board, host_updates, checkins
  )
  VALUES (
    auth.uid(),
    clean_name,
    clean_occasion,
    clean_date,
    clean_start_time,
    clean_time_zone,
    clean_location,
    guest_est,
    budget_val,
    CASE WHEN clean_theme IS NULL THEN 'null'::jsonb ELSE to_jsonb(clean_theme) END,
    clean_theme_id,
    clean_pack_id,
    clean_host_note,
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
$function$;