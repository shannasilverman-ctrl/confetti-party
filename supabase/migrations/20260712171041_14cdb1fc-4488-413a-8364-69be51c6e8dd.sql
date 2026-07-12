CREATE OR REPLACE FUNCTION public.submit_rsvp(token uuid, guest_name text, rsvp text, adults integer, kids integer)
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

  -- Escape LIKE wildcards so names containing % or _ do not over-match.
  escaped_name := replace(replace(replace(lower(clean_name), '\', '\\'), '%', '\%'), '_', '\_');

  a := greatest(0, least(coalesce(adults,0), 20));
  k := greatest(0, least(coalesce(kids,0), 20));
  IF a + k = 0 AND rsvp = 'yes' THEN
    a := 1;
  END IF;

  SELECT * INTO p FROM public.parties WHERE rsvp_token = token LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'party not found';
  END IF;

  -- Rebuild guests: update existing entry (case-insensitive name match, link source only)
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
          'source', 'link'
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
      'source', 'link'
    ));
  END IF;

  -- Remove any prior +N companion entries for this guest name (wildcards escaped).
  new_guests := (
    SELECT coalesce(jsonb_agg(x), '[]'::jsonb)
    FROM jsonb_array_elements(new_guests) x
    WHERE NOT (
      coalesce(x->>'source','') = 'link'
      AND lower(btrim(coalesce(x->>'name','')))
          LIKE escaped_name || ' +%' ESCAPE '\'
    )
  );

  IF rsvp = 'yes' THEN
    IF a > 1 THEN
      FOR i IN 2..a LOOP
        new_guests := new_guests || jsonb_build_array(jsonb_build_object(
          'id', md5(random()::text || clock_timestamp()::text || i::text),
          'name', clean_name || ' +' || (i-1)::text,
          'kind', 'adult',
          'rsvp', 'yes',
          'source', 'link'
        ));
      END LOOP;
    END IF;
    IF k > 0 THEN
      FOR i IN 1..k LOOP
        new_guests := new_guests || jsonb_build_array(jsonb_build_object(
          'id', md5(random()::text || clock_timestamp()::text || 'k' || i::text),
          'name', clean_name || ' +' || (a + i - 1)::text,
          'kind', 'kid',
          'rsvp', 'yes',
          'source', 'link'
        ));
      END LOOP;
    END IF;
  END IF;

  UPDATE public.parties
     SET guests = new_guests,
         updated_at = now()
   WHERE id = p.id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;