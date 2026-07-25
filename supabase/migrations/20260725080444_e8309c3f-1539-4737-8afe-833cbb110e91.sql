-- ============================================================
-- Batch: DB contract + abuse hardening
-- Forward-only; no history rewrite.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Per-party action budget (private, service_role only)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rsvp_action_budget (
  party_id uuid NOT NULL,
  action text NOT NULL,
  bucket_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (party_id, action, bucket_start)
);

-- No grants to anon/authenticated. Only trusted backend + service_role.
REVOKE ALL ON public.rsvp_action_budget FROM PUBLIC;
GRANT ALL ON public.rsvp_action_budget TO service_role;

ALTER TABLE public.rsvp_action_budget ENABLE ROW LEVEL SECURITY;
-- No policies: even authenticated cannot see it via Data API.

CREATE INDEX IF NOT EXISTS rsvp_action_budget_bucket_idx
  ON public.rsvp_action_budget (bucket_start);

COMMENT ON TABLE public.rsvp_action_budget IS
  'Per-party action counters keyed to short time buckets. Stores only party_id, action name, bucket timestamp, and count. No tokens, names, IPs, dietary data. Owned by trusted SECURITY DEFINER RPCs; not exposed via Data API.';

-- ------------------------------------------------------------
-- 2. Bounded budget helper (SECURITY DEFINER, server-only)
--    Denies once the per-bucket count exceeds the limit.
--    Opportunistically prunes rows older than 24h for the same party.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._bump_rsvp_budget(
  _party_id uuid,
  _action text,
  _limit integer,
  _bucket_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bucket_ts timestamptz;
  new_count integer;
BEGIN
  IF _party_id IS NULL OR _action IS NULL THEN RETURN false; END IF;
  IF _limit IS NULL OR _limit <= 0 THEN RETURN false; END IF;
  IF _bucket_seconds IS NULL OR _bucket_seconds <= 0 THEN RETURN false; END IF;

  -- Opportunistic expiry (party-scoped, cheap).
  DELETE FROM public.rsvp_action_budget
    WHERE party_id = _party_id
      AND bucket_start < now() - interval '24 hours';

  bucket_ts := to_timestamp(
    floor(extract(epoch FROM now()) / _bucket_seconds) * _bucket_seconds
  );

  INSERT INTO public.rsvp_action_budget (party_id, action, bucket_start, count)
    VALUES (_party_id, _action, bucket_ts, 1)
  ON CONFLICT (party_id, action, bucket_start)
    DO UPDATE SET count = public.rsvp_action_budget.count + 1
  RETURNING count INTO new_count;

  RETURN new_count <= _limit;
END;
$$;

REVOKE ALL ON FUNCTION public._bump_rsvp_budget(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._bump_rsvp_budget(uuid, text, integer, integer) TO service_role;

-- ------------------------------------------------------------
-- 3. AI-turns rate limiter: server-fixed cap/window
--    Drop the old caller-configurable signature; add a 1-arg version.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.bump_ai_turn(uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.bump_ai_turn(_draft_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Server-fixed policy. Not caller-configurable.
  cap_const constant integer := 40;
  window_ms_const constant integer := 3600000;
  d public.gathering_drafts%ROWTYPE;
  now_ts timestamptz := now();
  window_start timestamptz;
  new_turns integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT * INTO d FROM public.gathering_drafts
    WHERE id = _draft_id AND user_id = auth.uid()
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft not found';
  END IF;

  window_start := COALESCE(d.ai_turns_hour_start, now_ts);
  IF now_ts - window_start >= make_interval(secs => window_ms_const / 1000.0) THEN
    new_turns := 1;
    window_start := now_ts;
  ELSE
    new_turns := COALESCE(d.ai_turns, 0) + 1;
  END IF;

  IF new_turns > cap_const THEN
    RETURN jsonb_build_object('allowed', false, 'turns', COALESCE(d.ai_turns, 0));
  END IF;

  UPDATE public.gathering_drafts
     SET ai_turns = new_turns,
         ai_turns_hour_start = window_start,
         updated_at = now_ts
   WHERE id = d.id;

  RETURN jsonb_build_object('allowed', true, 'turns', new_turns);
END;
$$;

REVOKE ALL ON FUNCTION public.bump_ai_turn(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_ai_turn(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bump_ai_turn(uuid) TO service_role;

-- ------------------------------------------------------------
-- 4. confirm_gathering_draft: strict payload validation
--    - theme stored as clean TEXT (via ->>, not ->)
--    - allowed occasion values
--    - length/numeric/array caps
--    - JSON shape and per-item size caps
--    - generic errors (no payload echo)
-- ------------------------------------------------------------
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
  guest_est int;
  budget_val int;
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

  -- Lock the caller's draft row; also enforces ownership via user_id filter.
  SELECT * INTO d FROM public.gathering_drafts
    WHERE id = _draft_id AND user_id = auth.uid()
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft not found';
  END IF;

  IF d.status = 'confirmed' AND d.confirmed_party_id IS NOT NULL THEN
    RETURN jsonb_build_object('party_id', d.confirmed_party_id, 'already_confirmed', true);
  END IF;

  -- Scalar text fields (use ->> so we never persist raw JSON tokens).
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
    IF length(clean_start_time) > 8 OR clean_start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' THEN
      RAISE EXCEPTION 'invalid payload';
    END IF;
  END IF;

  clean_location := NULLIF(btrim(COALESCE(_party->>'location', '')), '');
  IF clean_location IS NOT NULL AND length(clean_location) > 200 THEN RAISE EXCEPTION 'invalid payload'; END IF;

  -- Theme: allow a small text label; NULL if missing. Never persist raw JSON.
  clean_theme := NULLIF(btrim(COALESCE(_party->>'theme', '')), '');
  IF clean_theme IS NOT NULL AND length(clean_theme) > 60 THEN RAISE EXCEPTION 'invalid payload'; END IF;

  clean_theme_id := NULLIF(btrim(COALESCE(_party->>'themeId', '')), '');
  IF clean_theme_id IS NOT NULL AND length(clean_theme_id) > 60 THEN RAISE EXCEPTION 'invalid payload'; END IF;

  clean_pack_id := NULLIF(btrim(COALESCE(_party->>'holidayPackId', '')), '');
  IF clean_pack_id IS NOT NULL AND length(clean_pack_id) > 60 THEN RAISE EXCEPTION 'invalid payload'; END IF;

  clean_host_note := NULLIF(btrim(COALESCE(_party->>'hostNote', '')), '');
  IF clean_host_note IS NOT NULL AND length(clean_host_note) > 500 THEN RAISE EXCEPTION 'invalid payload'; END IF;

  -- Numerics: non-negative, bounded.
  BEGIN
    guest_est := COALESCE((_party->>'guestEstimate')::int, 0);
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid payload'; END;
  IF guest_est < 0 OR guest_est > 2000 THEN RAISE EXCEPTION 'invalid payload'; END IF;
  BEGIN
    budget_val := COALESCE((_party->>'budget')::numeric, 0)::int;
  EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid payload'; END;
  IF budget_val < 0 OR budget_val > 1000000 THEN RAISE EXCEPTION 'invalid payload'; END IF;

  -- JSON collections: must be arrays; bound counts and serialized size.
  PERFORM public._validate_confirm_collection(_party->'tasks', 200, 4000);
  PERFORM public._validate_confirm_collection(_party->'budgetCategories', 100, 2000);
  PERFORM public._validate_confirm_collection(_party->'shoppingItems', 500, 4000);
  PERFORM public._validate_confirm_collection(_party->'timeline', 100, 2000);
  PERFORM public._validate_confirm_collection(_party->'bringBoard', 500, 4000);

  INSERT INTO public.parties (
    user_id, name, occasion, date, start_time, location,
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
    clean_location,
    guest_est,
    budget_val,
    -- parties.theme is TEXT. Store the clean label directly, without JSON
    -- quotes or a jsonb-to-text coercion.
    COALESCE(clean_theme, ''),
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
$$;

-- Helper validator: array-of-objects with bounded count and byte size.
CREATE OR REPLACE FUNCTION public._validate_confirm_collection(
  _val jsonb, _max_items int, _max_bytes int
) RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  item jsonb;
BEGIN
  IF _val IS NULL THEN RETURN; END IF;
  IF jsonb_typeof(_val) <> 'array' THEN RAISE EXCEPTION 'invalid payload'; END IF;
  IF jsonb_array_length(_val) > _max_items THEN RAISE EXCEPTION 'invalid payload'; END IF;
  IF octet_length(_val::text) > _max_bytes THEN RAISE EXCEPTION 'invalid payload'; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(_val) LOOP
    IF jsonb_typeof(item) <> 'object' OR octet_length(item::text) > 4000 THEN
      RAISE EXCEPTION 'invalid payload';
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public._validate_confirm_collection(jsonb, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._validate_confirm_collection(jsonb, int, int) TO service_role;

-- ------------------------------------------------------------
-- 5. submit_rsvp: deterministic matching + per-party budget
--    Matching:
--      - Normalize name (lowercased, whitespace-collapsed).
--      - Count exact normalized matches across ALL guests.
--      - Unique match → update that guest in place (any source).
--      - Multiple matches with unique (name, household) → update.
--      - Otherwise → append a NEW link entry marked ambiguous.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_rsvp(
  token uuid, guest_name text, rsvp text, adults integer, kids integer,
  household_label text DEFAULT NULL::text,
  dietary jsonb DEFAULT '[]'::jsonb,
  allergens jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.parties%ROWTYPE;
  new_guests jsonb := '[]'::jsonb;
  g jsonb;
  clean_name text;
  norm_name text;
  clean_household text;
  norm_household text;
  clean_dietary jsonb := '[]'::jsonb;
  clean_allergens jsonb := '[]'::jsonb;
  a int;
  k int;
  i int;
  guests_len int;
  tag jsonb;
  match_count int := 0;
  household_match_count int := 0;
  matched_id text;
  ambiguous boolean := false;
  updated_kind text;
BEGIN
  IF rsvp IS NULL OR rsvp NOT IN ('yes','no','maybe') THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;

  clean_name := btrim(coalesce(guest_name,''));
  IF length(clean_name) = 0 OR length(clean_name) > 80 THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;
  norm_name := lower(regexp_replace(clean_name, '\s+', ' ', 'g'));

  clean_household := NULLIF(btrim(coalesce(household_label,'')), '');
  IF clean_household IS NOT NULL AND length(clean_household) > 80 THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;
  norm_household := CASE WHEN clean_household IS NULL THEN NULL
    ELSE lower(regexp_replace(clean_household, '\s+', ' ', 'g')) END;

  IF dietary IS NOT NULL THEN
    IF jsonb_typeof(dietary) <> 'array' THEN RAISE EXCEPTION 'invalid payload'; END IF;
    IF jsonb_array_length(dietary) > 20 THEN RAISE EXCEPTION 'invalid payload'; END IF;
    FOR tag IN SELECT * FROM jsonb_array_elements(dietary) LOOP
      IF jsonb_typeof(tag) <> 'string' OR length(tag #>> '{}') > 40 THEN
        RAISE EXCEPTION 'invalid payload';
      END IF;
      clean_dietary := clean_dietary || jsonb_build_array(tag);
    END LOOP;
  END IF;

  IF allergens IS NOT NULL THEN
    IF jsonb_typeof(allergens) <> 'array' THEN RAISE EXCEPTION 'invalid payload'; END IF;
    IF jsonb_array_length(allergens) > 20 THEN RAISE EXCEPTION 'invalid payload'; END IF;
    FOR tag IN SELECT * FROM jsonb_array_elements(allergens) LOOP
      IF jsonb_typeof(tag) <> 'string' OR length(tag #>> '{}') > 40 THEN
        RAISE EXCEPTION 'invalid payload';
      END IF;
      clean_allergens := clean_allergens || jsonb_build_array(tag);
    END LOOP;
  END IF;

  a := coalesce(adults, 0);
  k := coalesce(kids, 0);
  IF a < 0 OR a > 20 OR k < 0 OR k > 20 THEN
    RAISE EXCEPTION 'invalid payload';
  END IF;
  IF a + k = 0 AND rsvp = 'yes' THEN a := 1; END IF;

  SELECT * INTO p FROM public.parties WHERE rsvp_token = token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'party not found'; END IF;

  -- Per-party budget: 60 submits per 10-minute bucket. Generous for large
  -- events; caps abusive spam of a leaked token. Denial-of-service tradeoff:
  -- a determined attacker can still stall legitimate submits within a bucket,
  -- but cannot fill the 500-guest cap. Budget auto-expires after 24h.
  IF NOT public._bump_rsvp_budget(p.id, 'submit_rsvp', 60, 600) THEN
    RAISE EXCEPTION 'temporarily unavailable';
  END IF;

  -- Deterministic matching pass across ALL guests.
  IF jsonb_typeof(p.guests) = 'array' THEN
    IF jsonb_array_length(p.guests) > 500 THEN
      RAISE EXCEPTION 'guest list too large';
    END IF;
    FOR g IN SELECT * FROM jsonb_array_elements(p.guests) LOOP
      IF lower(regexp_replace(btrim(coalesce(g->>'name','')), '\s+', ' ', 'g')) = norm_name THEN
        match_count := match_count + 1;
        matched_id := g->>'id';
        IF norm_household IS NOT NULL
           AND lower(regexp_replace(btrim(coalesce(g->>'household','')), '\s+', ' ', 'g')) = norm_household THEN
          household_match_count := household_match_count + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF match_count = 0 THEN
    ambiguous := false;
  ELSIF match_count = 1 THEN
    ambiguous := false;
  ELSIF match_count > 1 AND norm_household IS NOT NULL AND household_match_count = 1 THEN
    ambiguous := false;
    -- re-scan to find the specific matching id
    FOR g IN SELECT * FROM jsonb_array_elements(p.guests) LOOP
      IF lower(regexp_replace(btrim(coalesce(g->>'name','')), '\s+', ' ', 'g')) = norm_name
         AND lower(regexp_replace(btrim(coalesce(g->>'household','')), '\s+', ' ', 'g')) = norm_household THEN
        matched_id := g->>'id';
        EXIT;
      END IF;
    END LOOP;
  ELSE
    -- Multiple matches, cannot disambiguate → new marked link entry.
    ambiguous := true;
    matched_id := NULL;
  END IF;

  updated_kind := CASE WHEN a > 0 THEN 'adult' ELSE 'kid' END;

  IF matched_id IS NOT NULL AND NOT ambiguous THEN
    -- Update in place and prune plus-ones from the prior submission so
    -- resubmitting yes/no/maybe cannot duplicate or strand them.
    FOR g IN SELECT * FROM jsonb_array_elements(p.guests) LOOP
      IF coalesce(g->>'source','') = 'link'
         AND lower(regexp_replace(btrim(coalesce(g->>'name','')), '\s+', ' ', 'g')) LIKE norm_name || ' +%' THEN
        CONTINUE;
      END IF;
      IF g->>'id' = matched_id THEN
        new_guests := new_guests || jsonb_build_array(
          g || jsonb_build_object(
            'name', clean_name,
            'kind', updated_kind,
            'rsvp', rsvp,
            'household', COALESCE(clean_household, g->>'household'),
            'dietary', clean_dietary,
            'allergens', clean_allergens
          )
        );
      ELSE
        new_guests := new_guests || jsonb_build_array(g);
      END IF;
    END LOOP;
  ELSE
    -- Keep all existing guests; strip prior "+N" plus-ones from a previous
    -- link submission by this exact normalized name to avoid duplicates.
    FOR g IN SELECT * FROM jsonb_array_elements(p.guests) LOOP
      IF coalesce(g->>'source','') = 'link'
         AND lower(regexp_replace(btrim(coalesce(g->>'name','')), '\s+', ' ', 'g')) LIKE norm_name || ' +%' THEN
        CONTINUE;
      END IF;
      new_guests := new_guests || jsonb_build_array(g);
    END LOOP;
    -- Append new link entry (marked ambiguous when applicable).
    new_guests := new_guests || jsonb_build_array(jsonb_build_object(
      'id', md5(random()::text || clock_timestamp()::text),
      'name', clean_name,
      'kind', updated_kind,
      'rsvp', rsvp,
      'source', 'link',
      'household', clean_household,
      'dietary', clean_dietary,
      'allergens', clean_allergens,
      'ambiguous', ambiguous
    ));
  END IF;

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

  RETURN jsonb_build_object('ok', true, 'ambiguous', ambiguous);
END;
$$;

-- ------------------------------------------------------------
-- 6. claim_bring_item: add per-party budget on top of existing atomic path
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_bring_item(
  token uuid, item_id text, guest_name text,
  household_label text DEFAULT NULL::text, qty numeric DEFAULT NULL::numeric
) RETURNS jsonb
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

  SELECT * INTO p FROM public.parties
    WHERE rsvp_token = token
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'party not found'; END IF;

  -- Per-party budget: 200 claim attempts per 10-minute bucket.
  IF NOT public._bump_rsvp_budget(p.id, 'claim_bring_item', 200, 600) THEN
    RAISE EXCEPTION 'temporarily unavailable';
  END IF;

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
  RETURN jsonb_build_object('ok', true, 'claimSecret', new_secret::text);
END;
$$;

-- ------------------------------------------------------------
-- 7. release_bring_item: add per-party budget
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_bring_item(
  token uuid, item_id text, guest_name text, claim_secret text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  clean_secret := NULLIF(btrim(coalesce(claim_secret, '')), '');
  IF clean_secret IS NULL OR length(clean_secret) > 64 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  IF guest_name IS NOT NULL AND length(guest_name) > 80 THEN
    RAISE EXCEPTION 'invalid name';
  END IF;

  SELECT * INTO p FROM public.parties
    WHERE rsvp_token = token
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'party not found'; END IF;

  -- Per-party budget: 60 release attempts per 10-minute bucket.
  IF NOT public._bump_rsvp_budget(p.id, 'release_bring_item', 60, 600) THEN
    RAISE EXCEPTION 'temporarily unavailable';
  END IF;

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
$$;
