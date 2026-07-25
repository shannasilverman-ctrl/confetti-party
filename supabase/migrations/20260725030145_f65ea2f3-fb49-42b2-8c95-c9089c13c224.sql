
-- =========================================================================
-- Security hardening for public/token RPCs.
-- Additive: replaces function bodies in place; no data changes.
-- =========================================================================

-- ---------- get_rsvp_party: tighten public projection ----------
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

  -- Bring board: expose only structural item fields. No claimant identity,
  -- no dietary tags, no notes.
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

  -- Host updates: only { id, text, at }.
  IF jsonb_typeof(p.host_updates) = 'array' THEN
    FOR upd IN SELECT * FROM jsonb_array_elements(p.host_updates) LOOP
      public_updates := public_updates || jsonb_build_array(jsonb_build_object(
        'id', upd->>'id',
        'text', upd->>'text',
        'at', upd->>'at'
      ));
    END LOOP;
  END IF;

  -- Photo drop: only externally-configured drop info.
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

-- ---------- list_bring_board: same reduction ----------
CREATE OR REPLACE FUNCTION public.list_bring_board(token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        'status', COALESCE(item->>'status', 'open')
      ));
    END LOOP;
  END IF;
  RETURN out_items;
END;
$function$;

-- ---------- claim_bring_item: atomic + validated ----------
CREATE OR REPLACE FUNCTION public.claim_bring_item(
  token uuid,
  item_id text,
  guest_name text,
  household_label text DEFAULT NULL::text,
  qty numeric DEFAULT NULL::numeric
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p public.parties%ROWTYPE;
  new_board jsonb := '[]'::jsonb;
  item jsonb;
  claimed boolean := false;
  clean_name text;
  clean_household text;
  clean_item_id text;
  new_secret uuid := gen_random_uuid();
  board_len int;
BEGIN
  clean_item_id := btrim(coalesce(item_id, ''));
  IF length(clean_item_id) = 0 OR length(clean_item_id) > 64
     OR clean_item_id !~ '^[A-Za-z0-9_\-]+$' THEN
    RAISE EXCEPTION 'invalid item_id';
  END IF;

  clean_name := btrim(coalesce(guest_name, ''));
  IF length(clean_name) = 0 OR length(clean_name) > 80 THEN
    RAISE EXCEPTION 'invalid name';
  END IF;

  clean_household := NULLIF(btrim(coalesce(household_label, '')), '');
  IF clean_household IS NOT NULL AND length(clean_household) > 80 THEN
    RAISE EXCEPTION 'invalid household';
  END IF;

  IF qty IS NOT NULL AND (qty <= 0 OR qty > 999) THEN
    RAISE EXCEPTION 'invalid qty';
  END IF;

  -- Lock the party row so concurrent claims serialize on this event.
  SELECT * INTO p FROM public.parties
    WHERE rsvp_token = token
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'party not found'; END IF;

  IF jsonb_typeof(p.bring_board) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable');
  END IF;

  board_len := jsonb_array_length(p.bring_board);
  IF board_len > 500 THEN
    RAISE EXCEPTION 'board too large';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p.bring_board) LOOP
    IF item->>'id' = clean_item_id AND COALESCE(item->>'status','open') = 'open' THEN
      claimed := true;
      new_board := new_board || jsonb_build_array(
        item
        || jsonb_build_object(
          'status', 'claimed',
          'assigneeName', clean_name,
          'assigneeHousehold', clean_household,
          'qty', COALESCE(qty, (item->>'qty')::numeric, 1),
          'claimSecret', new_secret::text,
          'claimedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
      );
    ELSE
      new_board := new_board || jsonb_build_array(item);
    END IF;
  END LOOP;

  IF NOT claimed THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable');
  END IF;

  UPDATE public.parties SET bring_board = new_board, updated_at = now() WHERE id = p.id;
  -- The claim receipt is returned exactly once, to the successful claimant.
  RETURN jsonb_build_object('ok', true, 'claimSecret', new_secret::text);
END;
$function$;

-- ---------- release_bring_item: receipt-only, no name fallback ----------
CREATE OR REPLACE FUNCTION public.release_bring_item(
  token uuid,
  item_id text,
  guest_name text,
  claim_secret text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p public.parties%ROWTYPE;
  new_board jsonb := '[]'::jsonb;
  item jsonb;
  released boolean := false;
  clean_item_id text;
  clean_secret text;
  stored_secret text;
BEGIN
  clean_item_id := btrim(coalesce(item_id, ''));
  IF length(clean_item_id) = 0 OR length(clean_item_id) > 64
     OR clean_item_id !~ '^[A-Za-z0-9_\-]+$' THEN
    RAISE EXCEPTION 'invalid item_id';
  END IF;

  -- Anonymous release requires the exact claim receipt. Name is accepted
  -- only for input compatibility and ignored for authorization.
  clean_secret := NULLIF(btrim(coalesce(claim_secret, '')), '');
  IF clean_secret IS NULL OR length(clean_secret) > 64 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  -- guest_name is validated for length only.
  IF guest_name IS NOT NULL AND length(guest_name) > 80 THEN
    RAISE EXCEPTION 'invalid name';
  END IF;

  SELECT * INTO p FROM public.parties
    WHERE rsvp_token = token
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'party not found'; END IF;

  IF jsonb_typeof(p.bring_board) <> 'array' THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p.bring_board) LOOP
    stored_secret := item->>'claimSecret';
    IF item->>'id' = clean_item_id
       AND COALESCE(item->>'status','open') = 'claimed'
       AND stored_secret IS NOT NULL
       AND stored_secret = clean_secret
    THEN
      released := true;
      new_board := new_board || jsonb_build_array(
        (item - 'assigneeName' - 'assigneeHousehold' - 'claimedAt' - 'claimSecret')
        || jsonb_build_object('status', 'open')
      );
    ELSE
      new_board := new_board || jsonb_build_array(item);
    END IF;
  END LOOP;

  IF released THEN
    UPDATE public.parties SET bring_board = new_board, updated_at = now() WHERE id = p.id;
  END IF;
  RETURN jsonb_build_object('ok', released);
END;
$function$;

-- ---------- submit_rsvp: drop legacy 5-arg overload, harden the current one ----------
DROP FUNCTION IF EXISTS public.submit_rsvp(uuid, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.submit_rsvp(
  token uuid,
  guest_name text,
  rsvp text,
  adults integer,
  kids integer,
  household_label text DEFAULT NULL::text,
  dietary jsonb DEFAULT '[]'::jsonb,
  allergens jsonb DEFAULT '[]'::jsonb
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p public.parties%ROWTYPE;
  new_guests jsonb := '[]'::jsonb;
  g jsonb;
  matched boolean := false;
  clean_name text;
  clean_household text;
  escaped_name text;
  clean_dietary jsonb := '[]'::jsonb;
  clean_allergens jsonb := '[]'::jsonb;
  a int;
  k int;
  i int;
  guests_len int;
  tag jsonb;
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

  -- Validate dietary/allergens: jsonb arrays, <=20 elements, each text <=40.
  IF dietary IS NOT NULL AND jsonb_typeof(dietary) = 'array' THEN
    IF jsonb_array_length(dietary) > 20 THEN
      RAISE EXCEPTION 'too many dietary tags';
    END IF;
    FOR tag IN SELECT * FROM jsonb_array_elements(dietary) LOOP
      IF jsonb_typeof(tag) <> 'string' OR length(tag #>> '{}') > 40 THEN
        RAISE EXCEPTION 'invalid dietary tag';
      END IF;
      clean_dietary := clean_dietary || jsonb_build_array(tag);
    END LOOP;
  END IF;

  IF allergens IS NOT NULL AND jsonb_typeof(allergens) = 'array' THEN
    IF jsonb_array_length(allergens) > 20 THEN
      RAISE EXCEPTION 'too many allergens';
    END IF;
    FOR tag IN SELECT * FROM jsonb_array_elements(allergens) LOOP
      IF jsonb_typeof(tag) <> 'string' OR length(tag #>> '{}') > 40 THEN
        RAISE EXCEPTION 'invalid allergen';
      END IF;
      clean_allergens := clean_allergens || jsonb_build_array(tag);
    END LOOP;
  END IF;

  escaped_name := replace(replace(replace(lower(clean_name), '\', '\\'), '%', '\%'), '_', '\_');

  a := greatest(0, least(coalesce(adults,0), 20));
  k := greatest(0, least(coalesce(kids,0), 20));
  IF a + k = 0 AND rsvp = 'yes' THEN a := 1; END IF;

  SELECT * INTO p FROM public.parties WHERE rsvp_token = token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'party not found'; END IF;

  IF jsonb_typeof(p.guests) = 'array' THEN
    IF jsonb_array_length(p.guests) > 500 THEN
      RAISE EXCEPTION 'guest list too large';
    END IF;
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
          'dietary', clean_dietary,
          'allergens', clean_allergens
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
      'dietary', clean_dietary,
      'allergens', clean_allergens
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

  guests_len := jsonb_array_length(new_guests);
  IF guests_len > 500 THEN
    RAISE EXCEPTION 'guest list too large';
  END IF;

  UPDATE public.parties
     SET guests = new_guests, updated_at = now()
   WHERE id = p.id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ---------- Grants: revoke PUBLIC, grant only anon/authenticated ----------
REVOKE EXECUTE ON FUNCTION public.get_rsvp_party(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_bring_board(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_bring_item(uuid, text, text, text, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_bring_item(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_rsvp(uuid, text, text, integer, integer, text, jsonb, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_rsvp_party(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_bring_board(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_bring_item(uuid, text, text, text, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_bring_item(uuid, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_rsvp(uuid, text, text, integer, integer, text, jsonb, jsonb) TO anon, authenticated;
