-- Preserve a coarse, host-confirmed birthday life stage without requiring an
-- exact age. Exact ages remain authoritative. Public RSVP projections receive
-- only the minimum copy category, never the exact age or full planning profile.

WITH age_candidates AS MATERIALIZED (
  SELECT
    id,
    CASE
      WHEN planning_profile->>'honoreeAge' ~ '^[0-9]{1,3}$'
        THEN (planning_profile->>'honoreeAge')::integer
      ELSE NULL
    END AS honoree_age
  FROM public.parties
  WHERE occasion = 'birthday'
    AND jsonb_typeof(planning_profile) = 'object'
)
UPDATE public.parties AS p
SET planning_profile = jsonb_set(
  jsonb_set(
    p.planning_profile,
    '{honoreeAge}',
    to_jsonb(c.honoree_age),
    true
  ),
  '{honoreeLifeStage}',
  to_jsonb(
    CASE
      WHEN c.honoree_age BETWEEN 1 AND 12 THEN 'child'
      WHEN c.honoree_age BETWEEN 13 AND 17 THEN 'teen'
      WHEN c.honoree_age BETWEEN 18 AND 120 THEN 'adult'
    END
  ),
  true
)
FROM age_candidates AS c
WHERE p.id = c.id
  AND c.honoree_age BETWEEN 1 AND 120;

CREATE OR REPLACE FUNCTION public.canonicalize_birthday_life_stage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  age_text text;
  age_value integer;
  canonical_stage text;
BEGIN
  IF jsonb_typeof(NEW.planning_profile) <> 'object' THEN
    RETURN NEW;
  END IF;
  IF NEW.occasion <> 'birthday' THEN
    NEW.planning_profile := NEW.planning_profile - 'honoreeLifeStage';
    RETURN NEW;
  END IF;

  age_text := NEW.planning_profile->>'honoreeAge';
  IF age_text ~ '^[0-9]{1,3}$' THEN
    age_value := age_text::integer;
    IF age_value BETWEEN 1 AND 120 THEN
      canonical_stage := CASE
        WHEN age_value BETWEEN 1 AND 12 THEN 'child'
        WHEN age_value BETWEEN 13 AND 17 THEN 'teen'
        ELSE 'adult'
      END;
      NEW.planning_profile := jsonb_set(
        jsonb_set(
          NEW.planning_profile,
          '{honoreeAge}',
          to_jsonb(age_value),
          true
        ),
        '{honoreeLifeStage}',
        to_jsonb(canonical_stage),
        true
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS parties_canonicalize_birthday_life_stage
  ON public.parties;
CREATE TRIGGER parties_canonicalize_birthday_life_stage
BEFORE INSERT OR UPDATE OF occasion, planning_profile
ON public.parties
FOR EACH ROW
EXECUTE FUNCTION public.canonicalize_birthday_life_stage();

ALTER TABLE public.parties
  DROP CONSTRAINT IF EXISTS parties_honoree_life_stage_check;

ALTER TABLE public.parties
  ADD CONSTRAINT parties_honoree_life_stage_check
  CHECK (
    NOT (planning_profile ? 'honoreeLifeStage')
    OR (
      occasion = 'birthday'
      AND COALESCE(jsonb_typeof(planning_profile->'honoreeLifeStage'), '') = 'string'
      AND planning_profile->>'honoreeLifeStage' IN ('child', 'teen', 'adult')
      AND (
        NOT (planning_profile ? 'honoreeAge')
        OR CASE
          WHEN COALESCE(jsonb_typeof(planning_profile->'honoreeAge'), '') = 'number'
            AND planning_profile->>'honoreeAge' ~ '^[0-9]{1,3}$'
          THEN
            (planning_profile->>'honoreeAge')::integer BETWEEN 1 AND 120
            AND planning_profile->>'honoreeLifeStage' = CASE
              WHEN (planning_profile->>'honoreeAge')::integer BETWEEN 1 AND 12 THEN 'child'
              WHEN (planning_profile->>'honoreeAge')::integer BETWEEN 13 AND 17 THEN 'teen'
              WHEN (planning_profile->>'honoreeAge')::integer BETWEEN 18 AND 120 THEN 'adult'
            END
          ELSE false
        END
      )
    )
  ) NOT VALID;

ALTER TABLE public.parties
  VALIDATE CONSTRAINT parties_honoree_life_stage_check;

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
  clean_event_time_zone text;
  clean_life_stage text;
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
    clean_start_time !~ '^(([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?|([1-9]|1[0-2]):[0-5][0-9] (AM|PM))$'
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
        'version','honoreeAge','honoreeLifeStage','expectedKids','expectedAdults','effort','format',
        'foodRole','foodServiceStyle','eventTimeZone'
      ) THEN
        RAISE EXCEPTION 'invalid payload';
      END IF;
    END LOOP;
    IF COALESCE(clean_profile->>'version', '') <> '1' THEN
      RAISE EXCEPTION 'invalid payload';
    END IF;
    IF clean_profile ? 'honoreeLifeStage' THEN
      IF clean_occasion <> 'birthday'
        OR jsonb_typeof(clean_profile->'honoreeLifeStage') <> 'string'
        OR clean_profile->>'honoreeLifeStage' NOT IN ('child','teen','adult')
      THEN
        RAISE EXCEPTION 'invalid payload';
      END IF;
      clean_life_stage := clean_profile->>'honoreeLifeStage';
    END IF;
    IF clean_profile ? 'honoreeAge' THEN
      BEGIN profile_num := (clean_profile->>'honoreeAge')::int;
      EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid payload'; END;
      IF profile_num < 1 OR profile_num > 120 THEN RAISE EXCEPTION 'invalid payload'; END IF;
      IF clean_occasion = 'birthday' THEN
        clean_life_stage := CASE
          WHEN profile_num BETWEEN 1 AND 12 THEN 'child'
          WHEN profile_num BETWEEN 13 AND 17 THEN 'teen'
          ELSE 'adult'
        END;
      END IF;
    END IF;
    IF clean_life_stage IS NOT NULL THEN
      clean_profile := jsonb_set(
        clean_profile,
        '{honoreeLifeStage}',
        to_jsonb(clean_life_stage),
        true
      );
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
    IF clean_profile ? 'foodRole'
      AND clean_profile->>'foodRole' NOT IN ('light-bites','full-meal','grazing')
    THEN
      RAISE EXCEPTION 'invalid payload';
    END IF;
    IF clean_profile ? 'foodServiceStyle'
      AND clean_profile->>'foodServiceStyle' NOT IN ('self-serve','family-style','served')
    THEN
      RAISE EXCEPTION 'invalid payload';
    END IF;
    IF clean_profile ? 'eventTimeZone' THEN
      clean_event_time_zone := NULLIF(btrim(clean_profile->>'eventTimeZone'), '');
      IF clean_event_time_zone IS NULL
        OR length(clean_event_time_zone) > 80
        OR NOT EXISTS (
          SELECT 1
          FROM pg_catalog.pg_timezone_names
          WHERE name = clean_event_time_zone
        )
      THEN
        RAISE EXCEPTION 'invalid payload';
      END IF;
      clean_profile := jsonb_set(
        clean_profile,
        '{eventTimeZone}',
        to_jsonb(clean_event_time_zone),
        true
      );
    END IF;
  END IF;

  IF clean_start_time IS NOT NULL AND clean_event_time_zone IS NULL THEN
    RAISE EXCEPTION 'invalid payload';
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
  stage_text text;
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

  public_context := CASE p.occasion
    WHEN 'baby-shower' THEN jsonb_build_object('kind', 'baby-shower')
    WHEN 'graduation' THEN jsonb_build_object('kind', 'graduation')
    ELSE NULL
  END;

  IF p.occasion = 'birthday' AND jsonb_typeof(p.planning_profile) = 'object' THEN
    age_text := p.planning_profile->>'honoreeAge';
    stage_text := p.planning_profile->>'honoreeLifeStage';
    IF age_text ~ '^[0-9]{1,3}$' THEN
      age_value := age_text::integer;
      public_context := CASE
        WHEN age_value BETWEEN 1 AND 3
          THEN jsonb_build_object('kind', 'child-birthday')
        WHEN age_value BETWEEN 4 AND 5
          THEN jsonb_build_object('kind', 'preschool-birthday')
        WHEN age_value BETWEEN 6 AND 12
          THEN jsonb_build_object('kind', 'school-age-birthday')
        WHEN age_value BETWEEN 13 AND 17
          THEN jsonb_build_object('kind', 'teen-birthday')
        WHEN age_value BETWEEN 18 AND 120
          THEN jsonb_build_object('kind', 'adult-birthday')
        ELSE NULL
      END;
    ELSIF stage_text IN ('child', 'teen', 'adult') THEN
      public_context := jsonb_build_object('kind', stage_text || '-birthday');
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
