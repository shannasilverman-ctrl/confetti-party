
-- 1. Party columns
ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS households jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS bring_board jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS photo_drop jsonb,
  ADD COLUMN IF NOT EXISTS host_updates jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS holiday_pack_id text,
  ADD COLUMN IF NOT EXISTS checkins jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Draft turn counter (rate-limit accounting)
ALTER TABLE public.gathering_drafts
  ADD COLUMN IF NOT EXISTS ai_turns int NOT NULL DEFAULT 0;

-- 3. Public party view — extend with pack, updates, bring board, photo drop
CREATE OR REPLACE FUNCTION public.get_rsvp_party(token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.parties%ROWTYPE;
  guest_names jsonb;
  yes_count int := 0;
  maybe_count int := 0;
  total_count int := 0;
  guest jsonb;
  public_bring jsonb := '[]'::jsonb;
  item jsonb;
BEGIN
  SELECT * INTO p FROM public.parties WHERE rsvp_token = token LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  guest_names := '[]'::jsonb;
  IF jsonb_typeof(p.guests) = 'array' THEN
    FOR guest IN SELECT * FROM jsonb_array_elements(p.guests) LOOP
      total_count := total_count + 1;
      IF guest->>'rsvp' = 'yes' THEN
        yes_count := yes_count + 1;
        guest_names := guest_names || jsonb_build_array(
          split_part(coalesce(guest->>'name',''), ' ', 1)
        );
      END IF;
      IF guest->>'rsvp' = 'maybe' THEN maybe_count := maybe_count + 1; END IF;
    END LOOP;
  END IF;

  -- Public projection of bring board — no host PII, no notes marked private.
  IF jsonb_typeof(p.bring_board) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(p.bring_board) LOOP
      public_bring := public_bring || jsonb_build_array(jsonb_build_object(
        'id', item->>'id',
        'category', item->>'category',
        'label', item->>'label',
        'qty', COALESCE((item->>'qty')::numeric, 1),
        'unit', item->>'unit',
        'dietaryTags', COALESCE(item->'dietaryTags', '[]'::jsonb),
        'status', COALESCE(item->>'status', 'open'),
        'assigneeName', item->>'assigneeName',
        'assigneeHousehold', item->>'assigneeHousehold',
        'notes', item->>'notes'
      ));
    END LOOP;
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
    'host_updates', COALESCE(p.host_updates, '[]'::jsonb),
    'bring_board', public_bring,
    'photo_drop', p.photo_drop,
    'guest_first_names', guest_names,
    'yes_count', yes_count,
    'maybe_count', maybe_count,
    'total_count', total_count
  );
END;
$$;

-- 4. Extended submit_rsvp — accepts household + dietary + allergens
CREATE OR REPLACE FUNCTION public.submit_rsvp(
  token uuid,
  guest_name text,
  rsvp text,
  adults integer,
  kids integer,
  household_label text DEFAULT NULL,
  dietary jsonb DEFAULT '[]'::jsonb,
  allergens jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.parties%ROWTYPE;
  new_guests jsonb := '[]'::jsonb;
  g jsonb;
  matched boolean := false;
  clean_name text;
  clean_household text;
  escaped_name text;
  a int;
  k int;
  i int;
BEGIN
  IF rsvp IS NULL OR rsvp NOT IN ('yes','no','maybe') THEN
    RAISE EXCEPTION 'invalid rsvp value';
  END IF;

  clean_name := btrim(coalesce(guest_name,''));
  IF length(clean_name) = 0 OR length(clean_name) > 80 THEN
    RAISE EXCEPTION 'invalid name';
  END IF;

  clean_household := NULLIF(btrim(coalesce(household_label,'')), '');
  IF clean_household IS NOT NULL AND length(clean_household) > 80 THEN
    RAISE EXCEPTION 'invalid household';
  END IF;

  escaped_name := replace(replace(replace(lower(clean_name), '\', '\\'), '%', '\%'), '_', '\_');

  a := greatest(0, least(coalesce(adults,0), 20));
  k := greatest(0, least(coalesce(kids,0), 20));
  IF a + k = 0 AND rsvp = 'yes' THEN a := 1; END IF;

  SELECT * INTO p FROM public.parties WHERE rsvp_token = token LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'party not found'; END IF;

  IF jsonb_typeof(p.guests) = 'array' THEN
    FOR g IN SELECT * FROM jsonb_array_elements(p.guests) LOOP
      IF NOT matched
         AND lower(btrim(coalesce(g->>'name',''))) = lower(clean_name)
         AND coalesce(g->>'source','') = 'link' THEN
        matched := true;
        new_guests := new_guests || jsonb_build_array(jsonb_build_object(
          'id', coalesce(g->>'id', md5(random()::text || clock_timestamp()::text)),
          'name', clean_name,
          'kind', CASE WHEN a > 0 THEN 'adult' ELSE 'kid' END,
          'rsvp', rsvp,
          'source', 'link',
          'household', clean_household,
          'dietary', COALESCE(dietary, '[]'::jsonb),
          'allergens', COALESCE(allergens, '[]'::jsonb)
        ));
      ELSE
        new_guests := new_guests || jsonb_build_array(g);
      END IF;
    END LOOP;
  END IF;

  IF NOT matched THEN
    new_guests := new_guests || jsonb_build_array(jsonb_build_object(
      'id', md5(random()::text || clock_timestamp()::text),
      'name', clean_name,
      'kind', CASE WHEN a > 0 THEN 'adult' ELSE 'kid' END,
      'rsvp', rsvp,
      'source', 'link',
      'household', clean_household,
      'dietary', COALESCE(dietary, '[]'::jsonb),
      'allergens', COALESCE(allergens, '[]'::jsonb)
    ));
  END IF;

  new_guests := (
    SELECT coalesce(jsonb_agg(x), '[]'::jsonb)
    FROM jsonb_array_elements(new_guests) x
    WHERE NOT (
      coalesce(x->>'source','') = 'link'
      AND lower(btrim(coalesce(x->>'name',''))) LIKE escaped_name || ' +%' ESCAPE '\'
    )
  );

  IF rsvp = 'yes' THEN
    IF a > 1 THEN
      FOR i IN 2..a LOOP
        new_guests := new_guests || jsonb_build_array(jsonb_build_object(
          'id', md5(random()::text || clock_timestamp()::text || i::text),
          'name', clean_name || ' +' || (i-1)::text,
          'kind', 'adult', 'rsvp', 'yes', 'source', 'link',
          'household', clean_household
        ));
      END LOOP;
    END IF;
    IF k > 0 THEN
      FOR i IN 1..k LOOP
        new_guests := new_guests || jsonb_build_array(jsonb_build_object(
          'id', md5(random()::text || clock_timestamp()::text || 'k' || i::text),
          'name', clean_name || ' +' || (a + i - 1)::text,
          'kind', 'kid', 'rsvp', 'yes', 'source', 'link',
          'household', clean_household
        ));
      END LOOP;
    END IF;
  END IF;

  UPDATE public.parties
     SET guests = new_guests, updated_at = now()
   WHERE id = p.id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 5. Bring-board RPCs (token-scoped, granted to anon)

CREATE OR REPLACE FUNCTION public.list_bring_board(token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.parties%ROWTYPE;
  out_items jsonb := '[]'::jsonb;
  item jsonb;
BEGIN
  SELECT * INTO p FROM public.parties WHERE rsvp_token = token LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF jsonb_typeof(p.bring_board) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(p.bring_board) LOOP
      out_items := out_items || jsonb_build_array(jsonb_build_object(
        'id', item->>'id',
        'category', item->>'category',
        'label', item->>'label',
        'qty', COALESCE((item->>'qty')::numeric, 1),
        'unit', item->>'unit',
        'dietaryTags', COALESCE(item->'dietaryTags', '[]'::jsonb),
        'status', COALESCE(item->>'status', 'open'),
        'assigneeName', item->>'assigneeName',
        'assigneeHousehold', item->>'assigneeHousehold',
        'notes', item->>'notes'
      ));
    END LOOP;
  END IF;
  RETURN out_items;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_bring_item(
  token uuid,
  item_id text,
  guest_name text,
  household_label text DEFAULT NULL,
  qty numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.parties%ROWTYPE;
  new_board jsonb := '[]'::jsonb;
  item jsonb;
  claimed boolean := false;
  clean_name text;
  clean_household text;
BEGIN
  clean_name := btrim(coalesce(guest_name,''));
  IF length(clean_name) = 0 OR length(clean_name) > 80 THEN
    RAISE EXCEPTION 'invalid name';
  END IF;
  clean_household := NULLIF(btrim(coalesce(household_label,'')), '');

  SELECT * INTO p FROM public.parties WHERE rsvp_token = token LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'party not found'; END IF;

  IF jsonb_typeof(p.bring_board) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(p.bring_board) LOOP
      IF item->>'id' = item_id AND COALESCE(item->>'status','open') = 'open' THEN
        claimed := true;
        new_board := new_board || jsonb_build_array(
          item
          || jsonb_build_object(
            'status', 'claimed',
            'assigneeName', clean_name,
            'assigneeHousehold', clean_household,
            'qty', COALESCE(qty, (item->>'qty')::numeric, 1),
            'claimedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
          )
        );
      ELSE
        new_board := new_board || jsonb_build_array(item);
      END IF;
    END LOOP;
  END IF;

  IF NOT claimed THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable');
  END IF;

  UPDATE public.parties SET bring_board = new_board, updated_at = now() WHERE id = p.id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_bring_item(
  token uuid,
  item_id text,
  guest_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.parties%ROWTYPE;
  new_board jsonb := '[]'::jsonb;
  item jsonb;
  released boolean := false;
  clean_name text;
BEGIN
  clean_name := lower(btrim(coalesce(guest_name,'')));
  IF length(clean_name) = 0 THEN RAISE EXCEPTION 'invalid name'; END IF;

  SELECT * INTO p FROM public.parties WHERE rsvp_token = token LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'party not found'; END IF;

  IF jsonb_typeof(p.bring_board) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(p.bring_board) LOOP
      IF item->>'id' = item_id
         AND COALESCE(item->>'status','open') = 'claimed'
         AND lower(coalesce(item->>'assigneeName','')) = clean_name THEN
        released := true;
        new_board := new_board || jsonb_build_array(
          (item - 'assigneeName' - 'assigneeHousehold' - 'claimedAt')
          || jsonb_build_object('status', 'open')
        );
      ELSE
        new_board := new_board || jsonb_build_array(item);
      END IF;
    END LOOP;
  END IF;

  IF released THEN
    UPDATE public.parties SET bring_board = new_board, updated_at = now() WHERE id = p.id;
  END IF;
  RETURN jsonb_build_object('ok', released);
END;
$$;

REVOKE ALL ON FUNCTION public.list_bring_board(uuid) FROM public;
REVOKE ALL ON FUNCTION public.claim_bring_item(uuid, text, text, text, numeric) FROM public;
REVOKE ALL ON FUNCTION public.release_bring_item(uuid, text, text) FROM public;

GRANT EXECUTE ON FUNCTION public.list_bring_board(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_bring_item(uuid, text, text, text, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_bring_item(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_rsvp(uuid, text, text, integer, integer, text, jsonb, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_rsvp_party(uuid) TO anon, authenticated;
