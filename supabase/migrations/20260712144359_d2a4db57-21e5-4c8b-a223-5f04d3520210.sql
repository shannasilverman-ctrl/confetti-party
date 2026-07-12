
-- 1. Add rsvp_token column
ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS rsvp_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS parties_rsvp_token_key ON public.parties (rsvp_token);

-- 2. Public read function: returns only safe fields
CREATE OR REPLACE FUNCTION public.get_rsvp_party(token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.parties%ROWTYPE;
  guest_names jsonb;
  yes_count int := 0;
  maybe_count int := 0;
  total_count int := 0;
  guest jsonb;
BEGIN
  SELECT * INTO p FROM public.parties WHERE rsvp_token = token LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  guest_names := '[]'::jsonb;
  IF jsonb_typeof(p.guests) = 'array' THEN
    FOR guest IN SELECT * FROM jsonb_array_elements(p.guests) LOOP
      total_count := total_count + 1;
      IF guest->>'rsvp' = 'yes' THEN yes_count := yes_count + 1; END IF;
      IF guest->>'rsvp' = 'maybe' THEN maybe_count := maybe_count + 1; END IF;
      -- first name only for privacy
      guest_names := guest_names || jsonb_build_array(
        split_part(coalesce(guest->>'name',''), ' ', 1)
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'name', p.name,
    'date', p.date,
    'occasion', p.occasion,
    'theme_id', p.theme_id,
    'theme', p.theme,
    'guest_first_names', guest_names,
    'yes_count', yes_count,
    'maybe_count', maybe_count,
    'total_count', total_count
  );
END;
$$;

-- 3. Public submit function: appends or updates a guest by case-insensitive name
CREATE OR REPLACE FUNCTION public.submit_rsvp(
  token uuid,
  guest_name text,
  rsvp text,
  adults int,
  kids int
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.parties%ROWTYPE;
  new_guests jsonb := '[]'::jsonb;
  g jsonb;
  matched boolean := false;
  clean_name text;
  a int;
  k int;
  i int;
  added int := 0;
BEGIN
  IF rsvp NOT IN ('yes','no','maybe') THEN
    RAISE EXCEPTION 'invalid rsvp value';
  END IF;

  clean_name := btrim(coalesce(guest_name,''));
  IF length(clean_name) = 0 OR length(clean_name) > 80 THEN
    RAISE EXCEPTION 'invalid name';
  END IF;

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
        -- Replace with primary (adult) entry; kids appended below
        new_guests := new_guests || jsonb_build_array(jsonb_build_object(
          'id', coalesce(g->>'id', md5(random()::text || clock_timestamp()::text)),
          'name', clean_name,
          'kind', CASE WHEN a > 0 THEN 'adult' ELSE 'kid' END,
          'rsvp', rsvp,
          'source', 'link'
        ));
      ELSIF NOT matched
         OR lower(btrim(coalesce(g->>'name',''))) <> lower(clean_name)
         OR coalesce(g->>'source','') <> 'link' THEN
        -- Keep only if it doesn't belong to a link-guest group we're replacing
        IF NOT (matched
                AND lower(btrim(coalesce(g->>'name',''))) = lower(clean_name || ' +' || (added)::text)
                AND coalesce(g->>'source','') = 'link') THEN
          new_guests := new_guests || jsonb_build_array(g);
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF NOT matched THEN
    -- Insert new primary entry
    new_guests := new_guests || jsonb_build_array(jsonb_build_object(
      'id', md5(random()::text || clock_timestamp()::text),
      'name', clean_name,
      'kind', CASE WHEN a > 0 THEN 'adult' ELSE 'kid' END,
      'rsvp', rsvp,
      'source', 'link'
    ));
  END IF;

  -- Remove any prior +N companion entries for this guest name
  new_guests := (
    SELECT coalesce(jsonb_agg(x), '[]'::jsonb)
    FROM jsonb_array_elements(new_guests) x
    WHERE NOT (
      coalesce(x->>'source','') = 'link'
      AND lower(btrim(coalesce(x->>'name',''))) LIKE lower(clean_name) || ' +%'
    )
  );

  -- Add companion entries for additional adults / kids when rsvp = yes
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
$$;

-- 4. Lock down and grant execute to anon + authenticated
REVOKE ALL ON FUNCTION public.get_rsvp_party(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_rsvp(uuid, text, text, int, int) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_rsvp_party(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_rsvp(uuid, text, text, int, int) TO anon, authenticated;
