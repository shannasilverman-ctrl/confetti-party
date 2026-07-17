
ALTER TABLE public.parties ADD COLUMN IF NOT EXISTS host_note text;

CREATE OR REPLACE FUNCTION public.get_rsvp_party(token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      IF guest->>'rsvp' = 'yes' THEN
        yes_count := yes_count + 1;
        guest_names := guest_names || jsonb_build_array(
          split_part(coalesce(guest->>'name',''), ' ', 1)
        );
      END IF;
      IF guest->>'rsvp' = 'maybe' THEN maybe_count := maybe_count + 1; END IF;
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
    'guest_first_names', guest_names,
    'yes_count', yes_count,
    'maybe_count', maybe_count,
    'total_count', total_count
  );
END;
$function$;
