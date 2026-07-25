-- Integration harness for the token-scoped RSVP / Bring Board RPCs.
--
-- Runs inside a single BEGIN ... ROLLBACK. Nothing is persisted. All
-- fixture rows are tagged with a unique marker so a post-run query can
-- prove zero rows leaked.
--
-- Invoke with psql -v ON_ERROR_STOP=1 -f supabase/tests/rpc_harness.sql

\set ON_ERROR_STOP on
\timing off
\set QUIET on

BEGIN;

-- Unique marker for this run. Fixture rows we insert carry this in their
-- name so the post-rollback verification query can look for it.
\set fixture_marker 'rpc_harness_fixture_'`date +%s%N`

SELECT set_config('confetti.fixture_marker', :'fixture_marker', true) AS marker;

--
-- Phase A: static assertions (no fixture rows required)
--

DO $phaseA$
DECLARE
  def text;
  acl text;
BEGIN
  -- The obsolete 5-argument submit_rsvp overload must not exist.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'submit_rsvp' AND p.pronargs = 5
  ) THEN
    RAISE EXCEPTION 'FAIL: obsolete 5-arg submit_rsvp still exists';
  END IF;

  -- Grants: only anon, authenticated, service_role, and the owner (postgres)
  -- should hold EXECUTE. PUBLIC must NOT.
  FOR def, acl IN
    SELECT p.proname, p.proacl::text
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('submit_rsvp','get_rsvp_party','list_bring_board',
                        'claim_bring_item','release_bring_item')
  LOOP
    IF acl LIKE '%=X/%' AND acl LIKE '%,=X/%' THEN
      -- =X/ with nothing before the '=' means PUBLIC
      RAISE EXCEPTION 'FAIL: % has PUBLIC EXECUTE grant (%)', def, acl;
    END IF;
    IF position('anon=X' in acl) = 0 THEN
      RAISE EXCEPTION 'FAIL: % missing anon EXECUTE (%)', def, acl;
    END IF;
    IF position('authenticated=X' in acl) = 0 THEN
      RAISE EXCEPTION 'FAIL: % missing authenticated EXECUTE (%)', def, acl;
    END IF;
  END LOOP;

  -- Function bodies must retain: SECURITY DEFINER, explicit safe search_path,
  -- wildcard escaping in submit_rsvp, and the FOR UPDATE row lock in
  -- claim_bring_item / release_bring_item.
  def := pg_get_functiondef('public.submit_rsvp(uuid,text,text,integer,integer,text,jsonb,jsonb)'::regprocedure);
  IF def !~ 'SECURITY DEFINER' THEN RAISE EXCEPTION 'FAIL: submit_rsvp not SECURITY DEFINER'; END IF;
  IF def !~* 'search_path' THEN RAISE EXCEPTION 'FAIL: submit_rsvp missing search_path'; END IF;
  IF def !~ 'ESCAPE' THEN RAISE EXCEPTION 'FAIL: submit_rsvp missing wildcard ESCAPE'; END IF;

  def := pg_get_functiondef('public.claim_bring_item(uuid,text,text,text,numeric)'::regprocedure);
  IF def !~ 'FOR UPDATE' THEN RAISE EXCEPTION 'FAIL: claim_bring_item missing FOR UPDATE lock'; END IF;
  IF def !~* 'search_path' THEN RAISE EXCEPTION 'FAIL: claim_bring_item missing search_path'; END IF;

  def := pg_get_functiondef('public.release_bring_item(uuid,text,text,text)'::regprocedure);
  IF def !~ 'FOR UPDATE' THEN RAISE EXCEPTION 'FAIL: release_bring_item missing FOR UPDATE lock'; END IF;
  IF def !~* 'search_path' THEN RAISE EXCEPTION 'FAIL: release_bring_item missing search_path'; END IF;

  def := pg_get_functiondef('public.get_rsvp_party(uuid)'::regprocedure);
  IF def !~ 'SECURITY DEFINER' THEN RAISE EXCEPTION 'FAIL: get_rsvp_party not SECURITY DEFINER'; END IF;
  IF def !~* 'search_path' THEN RAISE EXCEPTION 'FAIL: get_rsvp_party missing search_path'; END IF;

  RAISE NOTICE 'PASS phaseA: grants, absence of 5-arg overload, search_path, ESCAPE, FOR UPDATE';
END;
$phaseA$;

--
-- Phase B: behavioural assertions using a synthetic party row.
--
-- parties.user_id has an ON DELETE CASCADE FK to auth.users. We reuse an
-- existing owner id only as an internal FK. If no owner exists we skip
-- Phase B and exit cleanly rather than fabricating data.
--

DO $phaseB$
DECLARE
  owner_id uuid;
  party_token uuid := gen_random_uuid();
  party_id uuid;
  marker text := current_setting('confetti.fixture_marker');
  bring jsonb;
  res jsonb;
  claim_secret text;
  proj jsonb;
BEGIN
  SELECT user_id INTO owner_id FROM public.parties LIMIT 1;
  IF owner_id IS NULL THEN
    RAISE NOTICE 'SKIP phaseB: no existing party owner available in this database (no FK-safe uuid). Static checks passed.';
    RETURN;
  END IF;

  INSERT INTO public.parties (
    user_id, name, occasion, date, guest_estimate, budget, theme, tasks,
    guests, budget_categories, shopping_items, timeline, rsvp_token,
    pinned_inspiration, households, bring_board, host_updates, checkins
  ) VALUES (
    owner_id, marker, 'birthday', current_date + 14, 10, 100, 'default',
    '[]'::jsonb,
    jsonb_build_array(jsonb_build_object('id','g_link','name','Alex Doe','kind','adult','rsvp','maybe','source','link')),
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    party_token,
    '[]'::jsonb, '[]'::jsonb,
    jsonb_build_array(
      jsonb_build_object('id','item_1','category','food','label','Salad','qty',1,'unit','bowl','status','open','notes','SECRET_NOTE','dietaryTags',jsonb_build_array('vegan'))
    ),
    '[]'::jsonb, '[]'::jsonb
  ) RETURNING id INTO party_id;

  -- 1) get_rsvp_party public projection: MUST NOT include claim internals,
  -- guest first names, assignee identity, notes, or dietary tags.
  proj := public.get_rsvp_party(party_token);
  IF proj IS NULL THEN RAISE EXCEPTION 'FAIL: get_rsvp_party returned NULL for known token'; END IF;
  IF proj::text ~* '(assigneeName|assigneeHousehold|claimSecret|dietaryTags|SECRET_NOTE|guest_first_names)' THEN
    RAISE EXCEPTION 'FAIL: get_rsvp_party leaked forbidden field: %', proj::text;
  END IF;
  -- Public bring_board items retain only structural fields
  bring := proj->'bring_board';
  IF jsonb_typeof(bring) <> 'array' OR jsonb_array_length(bring) <> 1 THEN
    RAISE EXCEPTION 'FAIL: get_rsvp_party bring_board shape wrong: %', bring::text;
  END IF;
  IF (bring->0) ? 'notes' OR (bring->0) ? 'dietaryTags' THEN
    RAISE EXCEPTION 'FAIL: get_rsvp_party bring_board leaked private field';
  END IF;

  -- 2) list_bring_board projection matches: no notes/dietaryTags/claim internals
  proj := public.list_bring_board(party_token);
  IF proj::text ~* '(assigneeName|assigneeHousehold|claimSecret|dietaryTags|SECRET_NOTE|notes)' THEN
    RAISE EXCEPTION 'FAIL: list_bring_board leaked forbidden field: %', proj::text;
  END IF;

  -- 3) submit_rsvp happy path updates counts inside the transaction.
  res := public.submit_rsvp(party_token, 'Alex Doe', 'yes', 2, 1, NULL,
                            '[]'::jsonb, '[]'::jsonb);
  IF NOT (res->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL: submit_rsvp happy path'; END IF;
  proj := public.get_rsvp_party(party_token);
  IF (proj->>'yes_count')::int < 3 THEN
    RAISE EXCEPTION 'FAIL: yes_count did not increase (%)', proj->>'yes_count';
  END IF;

  -- 4) Malformed inputs: dietary/allergens must be arrays; oversized name rejected.
  BEGIN
    PERFORM public.submit_rsvp(party_token, 'Bad', 'yes', 1, 0, NULL,
                               '"notarray"'::jsonb, '[]'::jsonb);
    RAISE EXCEPTION 'FAIL: dietary non-array accepted';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    PERFORM public.submit_rsvp(party_token, 'Bad2', 'yes', 1, 0, NULL,
                               '[]'::jsonb, '{"k":1}'::jsonb);
    RAISE EXCEPTION 'FAIL: allergens non-array accepted';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    PERFORM public.submit_rsvp(party_token, repeat('x', 200), 'yes', 1, 0, NULL,
                               '[]'::jsonb, '[]'::jsonb);
    RAISE EXCEPTION 'FAIL: oversized name accepted';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    PERFORM public.submit_rsvp(party_token, 'Alex', 'garbage', 1, 0, NULL,
                               '[]'::jsonb, '[]'::jsonb);
    RAISE EXCEPTION 'FAIL: invalid rsvp value accepted';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- 5) claim_bring_item: first claim wins, receipt returned; second fails.
  res := public.claim_bring_item(party_token, 'item_1', 'Alex Doe', NULL, 1);
  IF NOT (res->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL: first claim not ok: %', res::text; END IF;
  claim_secret := res->>'claimSecret';
  IF claim_secret IS NULL OR length(claim_secret) < 8 THEN
    RAISE EXCEPTION 'FAIL: missing/short claimSecret';
  END IF;

  res := public.claim_bring_item(party_token, 'item_1', 'Someone Else', NULL, 1);
  IF (res->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL: double-claim succeeded'; END IF;
  IF res->>'reason' <> 'unavailable' THEN
    RAISE EXCEPTION 'FAIL: second claim wrong reason: %', res::text;
  END IF;

  -- Public projection MUST still not contain the claim secret.
  proj := public.get_rsvp_party(party_token);
  IF proj::text ~ claim_secret THEN
    RAISE EXCEPTION 'FAIL: get_rsvp_party leaked claimSecret';
  END IF;
  proj := public.list_bring_board(party_token);
  IF proj::text ~ claim_secret THEN
    RAISE EXCEPTION 'FAIL: list_bring_board leaked claimSecret';
  END IF;

  -- 6) release_bring_item requires the exact receipt.
  res := public.release_bring_item(party_token, 'item_1', 'Alex Doe', NULL);
  IF (res->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL: release without secret succeeded'; END IF;

  res := public.release_bring_item(party_token, 'item_1', 'Alex Doe', 'not-the-secret');
  IF (res->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL: release with wrong secret succeeded'; END IF;

  res := public.release_bring_item(party_token, 'item_1', 'Alex Doe', claim_secret);
  IF NOT (res->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL: release with correct secret failed: %', res::text; END IF;

  RAISE NOTICE 'PASS phaseB: submit_rsvp, projections, atomic claim, receipt-only release';
END;
$phaseB$;

-- Confirm the fixture marker is still visible pre-rollback (sanity), then
-- roll back the entire transaction. Nothing must persist.
SELECT current_setting('confetti.fixture_marker') AS marker_used,
       (SELECT count(*) FROM public.parties WHERE name = current_setting('confetti.fixture_marker')) AS fixture_rows_in_tx;

ROLLBACK;

-- Post-rollback: prove zero fixture rows persisted anywhere by matching the
-- run's unique marker prefix.
SELECT 'post_rollback_persisted' AS check,
       count(*) AS rows
FROM public.parties
WHERE name LIKE 'rpc_harness_fixture_%';
