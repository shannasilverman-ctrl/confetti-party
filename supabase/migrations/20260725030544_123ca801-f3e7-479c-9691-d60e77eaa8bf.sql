
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

  -- dietary/allergens MUST be a JSON array when provided (non-null).
  IF dietary IS NOT NULL THEN
    IF jsonb_typeof(dietary) <> 'array' THEN
      RAISE EXCEPTION 'dietary must be an array';
    END IF;
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

  IF allergens IS NOT NULL THEN
    IF jsonb_typeof(allergens) <> 'array' THEN
      RAISE EXCEPTION 'allergens must be an array';
    END IF;
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

REVOKE EXECUTE ON FUNCTION public.submit_rsvp(uuid, text, text, integer, integer, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_rsvp(uuid, text, text, integer, integer, text, jsonb, jsonb) TO anon, authenticated;
