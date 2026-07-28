-- Contextual RSVP answers, without exposing the host's planning profile.
--
-- This is deliberately versioned alongside the existing public RPCs:
-- - v2 projection returns only a coarse workflow kind, never age/counts/effort.
-- - v2 submission validates a tiny answer object, delegates all established
--   matching/rate-limit logic to submit_rsvp, then attaches the answers to the
--   one primary guest record created or updated by that submission.
-- - no contact information or medical record field is added.

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
  public_context jsonb := NULL;
BEGIN
  base := public.get_rsvp_party(token);
  IF base IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO p
    FROM public.parties
   WHERE rsvp_token = token
   LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

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

  RETURN jsonb_set(
    base,
    '{rsvp_context}',
    COALESCE(public_context, 'null'::jsonb),
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_rsvp_party_v2(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rsvp_party_v2(uuid)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_rsvp_v2(
  token uuid,
  guest_name text,
  rsvp text,
  adults integer,
  kids integer,
  household_label text DEFAULT NULL::text,
  dietary jsonb DEFAULT '[]'::jsonb,
  allergens jsonb DEFAULT '[]'::jsonb,
  response_details jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  p public.parties%ROWTYPE;
  clean_details jsonb := '{}'::jsonb;
  clean_access text;
  clean_arrival text;
  norm_name text;
  norm_household text;
  target_ordinal bigint;
  new_guests jsonb;
BEGIN
  IF response_details IS NULL THEN response_details := '{}'::jsonb; END IF;
  IF jsonb_typeof(response_details) <> 'object'
     OR pg_column_size(response_details) > 1024
     OR EXISTS (
       SELECT 1
         FROM jsonb_object_keys(response_details) AS keys(key)
        WHERE keys.key NOT IN ('arrivalPlan', 'accessNotes')
     ) THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  clean_arrival := NULLIF(btrim(COALESCE(response_details->>'arrivalPlan', '')), '');
  IF clean_arrival IS NOT NULL
     AND clean_arrival NOT IN ('from-start', 'arriving-later', 'not-sure') THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  clean_access := NULLIF(btrim(COALESCE(response_details->>'accessNotes', '')), '');
  IF clean_access IS NOT NULL AND char_length(clean_access) > 200 THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  IF clean_arrival IS NOT NULL THEN
    clean_details := clean_details || jsonb_build_object('arrivalPlan', clean_arrival);
  END IF;
  IF clean_access IS NOT NULL THEN
    clean_details := clean_details || jsonb_build_object('accessNotes', clean_access);
  END IF;

  -- Delegate matching, guest-cap enforcement, rate limiting, and the canonical
  -- RSVP write to the already-hardened function. This call and the contextual
  -- update below share one transaction.
  result := public.submit_rsvp(
    token,
    guest_name,
    rsvp,
    adults,
    kids,
    household_label,
    dietary,
    allergens
  );

  SELECT * INTO p
    FROM public.parties
   WHERE rsvp_token = token
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'party not found'; END IF;

  norm_name := lower(regexp_replace(btrim(COALESCE(guest_name, '')), '\s+', ' ', 'g'));
  norm_household := NULLIF(
    lower(regexp_replace(btrim(COALESCE(household_label, '')), '\s+', ' ', 'g')),
    ''
  );

  -- Exact-name primary entries exclude generated "+N" companions. On an
  -- ambiguous resubmit, the hardened function appends a marked link entry;
  -- prefer that newest marked entry, then an exact household match, then the
  -- newest exact-name entry.
  SELECT ordinality INTO target_ordinal
    FROM jsonb_array_elements(p.guests) WITH ORDINALITY AS entry(value, ordinality)
   WHERE lower(
     regexp_replace(btrim(COALESCE(entry.value->>'name', '')), '\s+', ' ', 'g')
   ) = norm_name
   ORDER BY
     (
       entry.value->>'source' = 'link'
       AND entry.value->>'ambiguous' = 'true'
     ) DESC,
     (
       norm_household IS NOT NULL
       AND lower(
         regexp_replace(
           btrim(COALESCE(entry.value->>'household', '')),
           '\s+',
           ' ',
           'g'
         )
       ) = norm_household
     ) DESC,
     ordinality DESC
   LIMIT 1;

  IF target_ordinal IS NULL THEN RAISE EXCEPTION 'invalid payload'; END IF;

  SELECT COALESCE(
    jsonb_agg(
      CASE
        WHEN ordinality = target_ordinal AND clean_details = '{}'::jsonb
          THEN value - 'responseDetails'
        WHEN ordinality = target_ordinal
          THEN value || jsonb_build_object('responseDetails', clean_details)
        ELSE value
      END
      ORDER BY ordinality
    ),
    '[]'::jsonb
  ) INTO new_guests
    FROM jsonb_array_elements(p.guests) WITH ORDINALITY AS entry(value, ordinality);

  UPDATE public.parties
     SET guests = new_guests,
         updated_at = now()
   WHERE id = p.id;

  RETURN result || jsonb_build_object('contextSaved', clean_details <> '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_rsvp_v2(
  uuid, text, text, integer, integer, text, jsonb, jsonb, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_rsvp_v2(
  uuid, text, text, integer, integer, text, jsonb, jsonb, jsonb
) TO anon, authenticated;
