-- Expose only a validated IANA event zone to invitation guests. The value
-- already lives in planning_profile, so this adds no column and reveals none
-- of the host's other planning inputs.

CREATE OR REPLACE FUNCTION public.get_rsvp_party_v2(token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base jsonb;
  p public.parties%ROWTYPE;
  age_text text;
  age_value integer;
  zone_text text;
  public_context jsonb := NULL;
  public_time_zone text := NULL;
BEGIN
  base := public.get_rsvp_party(token);
  IF base IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO p
    FROM public.parties
   WHERE rsvp_token = token
   LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF jsonb_typeof(p.planning_profile) = 'object' THEN
    zone_text := p.planning_profile->>'eventTimeZone';
    IF zone_text IS NOT NULL
       AND char_length(zone_text) BETWEEN 3 AND 80
       AND (
         zone_text = 'UTC'
         OR zone_text ~ '^[A-Za-z_+-]+(/[A-Za-z0-9_+-]+)+$'
       )
       AND EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = zone_text) THEN
      public_time_zone := zone_text;
    END IF;
  END IF;

  IF p.occasion = 'birthday' AND jsonb_typeof(p.planning_profile) = 'object' THEN
    age_text := p.planning_profile->>'honoreeAge';
    IF age_text ~ '^[0-9]{1,3}$' THEN
      age_value := age_text::integer;
      public_context := CASE
        WHEN age_value BETWEEN 4 AND 5
          THEN jsonb_build_object('kind', 'preschool-birthday')
        WHEN age_value BETWEEN 6 AND 12
          THEN jsonb_build_object('kind', 'school-age-birthday')
        WHEN age_value BETWEEN 18 AND 120
          THEN jsonb_build_object('kind', 'adult-birthday')
        ELSE NULL
      END;
    END IF;
  END IF;

  base := jsonb_set(
    base,
    '{rsvp_context}',
    COALESCE(public_context, 'null'::jsonb),
    true
  );
  RETURN jsonb_set(
    base,
    '{event_time_zone}',
    COALESCE(to_jsonb(public_time_zone), 'null'::jsonb),
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_rsvp_party_v2(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rsvp_party_v2(uuid)
  TO anon, authenticated, service_role;
