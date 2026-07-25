-- Integration harness for the token-scoped RSVP / Bring Board RPCs.
--
-- Runs inside a single BEGIN ... ROLLBACK. Nothing is persisted. All
-- fixture rows are tagged with a unique per-run marker so the post-run
-- verification queries can prove zero rows leaked.
--
-- Invoke via `bun run test:db`, which wraps psql with ON_ERROR_STOP=1
-- and refuses connected/production hosts without an explicit opt-in.

\set ON_ERROR_STOP on
\timing off
\set QUIET on

BEGIN;

-- Unique marker for this run. Fixture rows we insert carry this in their
-- name (parties.name) and email (auth.users.email) so the post-rollback
-- verification queries can look for it.
\set fixture_marker 'rpc_harness_fixture_'`date +%s%N`

SELECT set_config('confetti.fixture_marker', :'fixture_marker', true) AS marker;

--
-- Phase A: static assertions (no fixture rows required)
--

DO $phaseA$
DECLARE
  def text;
  acl text;
  proname text;
BEGIN
  -- The obsolete 5-argument submit_rsvp overload must not exist.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'submit_rsvp' AND p.pronargs = 5
  ) THEN
    RAISE EXCEPTION 'FAIL: obsolete 5-arg submit_rsvp still exists';
  END IF;

  -- Grants: only anon, authenticated, service_role, and the owner should
  -- hold EXECUTE. PUBLIC must NOT.
  FOR proname, acl IN
    SELECT p.proname, p.proacl::text
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('submit_rsvp','get_rsvp_party','list_bring_board',
                        'claim_bring_item','release_bring_item')
  LOOP
    -- '=X/<owner>' with nothing before the '=' means PUBLIC.
    IF acl ~ '(^|,)=X/' THEN
      RAISE EXCEPTION 'FAIL: % has PUBLIC EXECUTE grant (%)', proname, acl;
    END IF;
    IF position('anon=X' in acl) = 0 THEN
      RAISE EXCEPTION 'FAIL: % missing anon EXECUTE (%)', proname, acl;
    END IF;
    IF position('authenticated=X' in acl) = 0 THEN
      RAISE EXCEPTION 'FAIL: % missing authenticated EXECUTE (%)', proname, acl;
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
-- Phase B: behavioural assertions using a synthetic party owned by a
-- synthetic auth.users row. Both are created inside this transaction and
-- rolled back at the end. Neither the user id nor the party id is printed.
--
-- Rejection assertions distinguish an expected RPC error from a harness
-- failure via a per-call `raised` boolean: PERFORM the bad call, then
-- FAIL if control returned normally. The EXCEPTION block is the expected
-- path and only swallows errors from that PERFORM.
--
-- After every rejected call the harness reads `guests`/`bring_board`
-- again and asserts they are byte-identical to the pre-call snapshot.
--

DO $phaseB$
DECLARE
  synthetic_user_id uuid := gen_random_uuid();
  party_token uuid := gen_random_uuid();
  party_id uuid;
  marker text := current_setting('confetti.fixture_marker');
  fixture_email text := marker || '@rpc-harness.invalid';
  created_synthetic_auth boolean := false;
  bring jsonb;

  res jsonb;
  claim_secret text;
  proj jsonb;
  before_guests jsonb;
  before_board jsonb;
  raised boolean;
BEGIN
  -- Owner FK strategy:
  --   1. Try to create a synthetic auth.users row tagged with this run's
  --      marker so leak checks can prove zero residue in BOTH tables.
  --   2. If the harness role lacks INSERT on auth (typical for the
  --      shared connected DB), fall back to reusing any existing owner
  --      id purely as an internal FK. We do NOT print the id.
  --   3. If neither is possible, error out — never skip Phase B.
  BEGIN
    INSERT INTO auth.users (id, email)
    VALUES (synthetic_user_id, fixture_email);
    created_synthetic_auth := true;
  EXCEPTION WHEN insufficient_privilege THEN
    SELECT user_id INTO synthetic_user_id FROM public.parties LIMIT 1;
    IF synthetic_user_id IS NULL THEN
      RAISE EXCEPTION 'FAIL: cannot create synthetic auth user and no existing owner to reuse';
    END IF;
    RAISE NOTICE 'phaseB: no auth.users INSERT privilege — reusing existing owner FK only (id not printed)';
  END;

  INSERT INTO public.parties (
    user_id, name, occasion, date, guest_estimate, budget, theme, tasks,
    guests, budget_categories, shopping_items, timeline, rsvp_token,
    pinned_inspiration, households, bring_board, host_updates, checkins,
    photo_drop
  ) VALUES (
    synthetic_user_id, marker, 'birthday', current_date + 14, 10, 100, 'default',

    '[]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'id','g_link','name','Alex Doe','kind','adult','rsvp','maybe','source','link'
    )),
    '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, party_token,
    '[]'::jsonb, '[]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'id','item_1','category','food','label','Salad','qty',1,'unit','bowl',
      'status','open','notes','SECRET_NOTE','dietaryTags',jsonb_build_array('vegan')
    )),
    jsonb_build_array(jsonb_build_object(
      'id','upd_1','text','Bring warm jackets','at','2026-01-01T00:00:00Z',
      'authorEmail','host@example.invalid','internalNote','SECRET_UPDATE_NOTE'
    )),
    '{}'::jsonb,
    jsonb_build_object(
      'provider','icloud','label','Album','url','https://example.com/drop',
      'notes','shared album',
      'ownerEmail','host@example.invalid'
    )
  ) RETURNING id INTO party_id;

  -- ---------------------------------------------------------------
  -- Projection allowlist checks (exact keys, not just forbidden regex)
  -- ---------------------------------------------------------------
  proj := public.get_rsvp_party(party_token);
  IF proj IS NULL THEN RAISE EXCEPTION 'FAIL: get_rsvp_party returned NULL for known token'; END IF;

  -- bring_board items: exactly {id, category, label, qty, unit, status}
  bring := proj->'bring_board';
  IF jsonb_typeof(bring) <> 'array' OR jsonb_array_length(bring) <> 1 THEN
    RAISE EXCEPTION 'FAIL: get_rsvp_party bring_board shape wrong: %', bring::text;
  END IF;
  IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(bring->0) k)
     <> ARRAY['category','id','label','qty','status','unit'] THEN
    RAISE EXCEPTION 'FAIL: bring_board item keys not exactly allowlisted: %',
      (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(bring->0) k);
  END IF;

  -- host_updates: exactly {id, text, at}
  IF jsonb_typeof(proj->'host_updates') <> 'array'
     OR jsonb_array_length(proj->'host_updates') <> 1 THEN
    RAISE EXCEPTION 'FAIL: host_updates shape wrong: %', (proj->'host_updates')::text;
  END IF;
  IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(proj->'host_updates'->0) k)
     <> ARRAY['at','id','text'] THEN
    RAISE EXCEPTION 'FAIL: host_updates keys not exactly allowlisted: %',
      (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(proj->'host_updates'->0) k);
  END IF;

  -- photo_drop: exactly {provider, label, url, notes} — no ownerEmail
  IF jsonb_typeof(proj->'photo_drop') <> 'object' THEN
    RAISE EXCEPTION 'FAIL: photo_drop missing/wrong shape: %', (proj->'photo_drop')::text;
  END IF;
  IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(proj->'photo_drop') k)
     <> ARRAY['label','notes','provider','url'] THEN
    RAISE EXCEPTION 'FAIL: photo_drop keys not exactly allowlisted: %',
      (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(proj->'photo_drop') k);
  END IF;

  -- Belt-and-braces regex sweep: no assignee identity, no dietary tags,
  -- no notes/authorEmail/ownerEmail leaked from any nested structure.
  IF proj::text ~* '(assigneeName|assigneeHousehold|claimSecret|dietaryTags|SECRET_NOTE|SECRET_UPDATE_NOTE|authorEmail|internalNote|ownerEmail|host@example\.invalid)' THEN
    RAISE EXCEPTION 'FAIL: get_rsvp_party leaked forbidden field: %', proj::text;
  END IF;

  -- list_bring_board: same allowlist as bring_board items.
  proj := public.list_bring_board(party_token);
  IF jsonb_typeof(proj) <> 'array' OR jsonb_array_length(proj) <> 1 THEN
    RAISE EXCEPTION 'FAIL: list_bring_board shape wrong: %', proj::text;
  END IF;
  IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(proj->0) k)
     <> ARRAY['category','id','label','qty','status','unit'] THEN
    RAISE EXCEPTION 'FAIL: list_bring_board item keys not allowlisted: %',
      (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(proj->0) k);
  END IF;
  IF proj::text ~* '(assigneeName|assigneeHousehold|claimSecret|dietaryTags|SECRET_NOTE|notes|authorEmail|host@example\.invalid)' THEN
    RAISE EXCEPTION 'FAIL: list_bring_board leaked forbidden field: %', proj::text;
  END IF;

  -- ---------------------------------------------------------------
  -- submit_rsvp happy path updates counts inside the transaction.
  -- ---------------------------------------------------------------
  res := public.submit_rsvp(party_token, 'Alex Doe', 'yes', 2, 1, NULL,
                            '[]'::jsonb, '[]'::jsonb);
  IF NOT (res->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL: submit_rsvp happy path'; END IF;
  proj := public.get_rsvp_party(party_token);
  IF (proj->>'yes_count')::int < 3 THEN
    RAISE EXCEPTION 'FAIL: yes_count did not increase (%)', proj->>'yes_count';
  END IF;

  -- ---------------------------------------------------------------
  -- Rejection assertions.
  -- Pattern: PERFORM the bad call; if control returns normally, set
  -- raised := false and RAISE explicitly. The EXCEPTION block is the
  -- expected path and only swallows errors from the enclosed PERFORM.
  -- Snapshot state before and re-verify byte-identical after each call.
  -- ---------------------------------------------------------------

  -- Snapshot pre-rejection state once.
  SELECT guests, bring_board INTO before_guests, before_board
    FROM public.parties WHERE id = party_id;

  -- (a) dietary must be an array
  BEGIN
    raised := true;
    PERFORM public.submit_rsvp(party_token, 'Bad', 'yes', 1, 0, NULL,
                               '"notarray"'::jsonb, '[]'::jsonb);
    raised := false;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'FAIL: dietary non-array accepted'; END IF;

  -- (b) allergens must be an array
  BEGIN
    raised := true;
    PERFORM public.submit_rsvp(party_token, 'Bad2', 'yes', 1, 0, NULL,
                               '[]'::jsonb, '{"k":1}'::jsonb);
    raised := false;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'FAIL: allergens non-array accepted'; END IF;

  -- (c) too many dietary tags (>20)
  BEGIN
    raised := true;
    PERFORM public.submit_rsvp(
      party_token, 'Bad3', 'yes', 1, 0, NULL,
      (SELECT jsonb_agg(to_jsonb('t'||g::text)) FROM generate_series(1,25) g),
      '[]'::jsonb
    );
    raised := false;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'FAIL: >20 dietary tags accepted'; END IF;

  -- (d) oversized dietary tag string (>40 chars)
  BEGIN
    raised := true;
    PERFORM public.submit_rsvp(party_token, 'Bad4', 'yes', 1, 0, NULL,
                               jsonb_build_array(repeat('x', 50)), '[]'::jsonb);
    raised := false;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'FAIL: oversized dietary tag accepted'; END IF;

  -- (e) blank guest name
  BEGIN
    raised := true;
    PERFORM public.submit_rsvp(party_token, '   ', 'yes', 1, 0, NULL,
                               '[]'::jsonb, '[]'::jsonb);
    raised := false;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'FAIL: blank name accepted'; END IF;

  -- (f) oversized guest name (>80 chars)
  BEGIN
    raised := true;
    PERFORM public.submit_rsvp(party_token, repeat('x', 200), 'yes', 1, 0, NULL,
                               '[]'::jsonb, '[]'::jsonb);
    raised := false;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'FAIL: oversized name accepted'; END IF;

  -- (g) invalid rsvp value
  BEGIN
    raised := true;
    PERFORM public.submit_rsvp(party_token, 'Alex', 'garbage', 1, 0, NULL,
                               '[]'::jsonb, '[]'::jsonb);
    raised := false;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'FAIL: invalid rsvp value accepted'; END IF;

  -- (h) claim_bring_item: invalid item_id (bad characters)
  BEGIN
    raised := true;
    PERFORM public.claim_bring_item(party_token, 'bad id!', 'Alex', NULL, 1);
    raised := false;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'FAIL: invalid item_id accepted'; END IF;

  -- (i) claim_bring_item: oversized item_id (>64 chars)
  BEGIN
    raised := true;
    PERFORM public.claim_bring_item(party_token, repeat('a', 80), 'Alex', NULL, 1);
    raised := false;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'FAIL: oversized item_id accepted'; END IF;

  -- (j) claim_bring_item: invalid qty (zero)
  BEGIN
    raised := true;
    PERFORM public.claim_bring_item(party_token, 'item_1', 'Alex', NULL, 0);
    raised := false;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'FAIL: qty=0 accepted'; END IF;

  -- (k) claim_bring_item: qty over cap
  BEGIN
    raised := true;
    PERFORM public.claim_bring_item(party_token, 'item_1', 'Alex', NULL, 1000);
    raised := false;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'FAIL: qty>999 accepted'; END IF;

  -- After all rejections, state MUST be byte-identical.
  IF (SELECT guests FROM public.parties WHERE id = party_id) IS DISTINCT FROM before_guests THEN
    RAISE EXCEPTION 'FAIL: guests changed after rejected calls';
  END IF;
  IF (SELECT bring_board FROM public.parties WHERE id = party_id) IS DISTINCT FROM before_board THEN
    RAISE EXCEPTION 'FAIL: bring_board changed after rejected calls';
  END IF;

  -- ---------------------------------------------------------------
  -- claim_bring_item: first claim wins, receipt returned; second fails.
  -- (Sequential — this is loser-behavior only; true two-session race
  -- lives in supabase/tests/concurrency_claim.sql.)
  -- ---------------------------------------------------------------
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

  -- release_bring_item requires the exact receipt.
  res := public.release_bring_item(party_token, 'item_1', 'Alex Doe', NULL);
  IF (res->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL: release without secret succeeded'; END IF;

  res := public.release_bring_item(party_token, 'item_1', 'Alex Doe', 'not-the-secret');
  IF (res->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL: release with wrong secret succeeded'; END IF;

  res := public.release_bring_item(party_token, 'item_1', 'Alex Doe', claim_secret);
  IF NOT (res->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL: release with correct secret failed: %', res::text; END IF;

  RAISE NOTICE 'PASS phaseB: allowlist projections, rejections, atomic claim, receipt-only release';
END;
$phaseB$;

-- Pre-rollback sanity: prove both fixtures exist in the transaction.
SELECT 'pre_rollback_marker' AS check,
       current_setting('confetti.fixture_marker') AS marker;

-- Reading auth.users may itself be denied on shared DBs. Do it via a
-- guarded DO block so a permission error becomes a NOTICE, not a stop.
DO $prechk$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM auth.users
   WHERE email = current_setting('confetti.fixture_marker') || '@rpc-harness.invalid';
  RAISE NOTICE 'pre_rollback_auth_users: %', n;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'pre_rollback_auth_users: <no SELECT privilege on auth.users>';
END;
$prechk$;

SELECT 'pre_rollback_parties' AS check,
       count(*) AS rows
FROM public.parties
WHERE name = current_setting('confetti.fixture_marker');

ROLLBACK;

-- Post-rollback: prove zero fixture rows leaked. Matches the run-unique
-- marker prefix in BOTH tables. The shell runner also performs an
-- independent leak check after this file exits.
DO $postchk$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM auth.users
   WHERE email LIKE 'rpc_harness_fixture_%@rpc-harness.invalid';
  IF n <> 0 THEN
    RAISE EXCEPTION 'FAIL: % marker rows persisted in auth.users after ROLLBACK', n;
  END IF;
  RAISE NOTICE 'post_rollback_auth_users: 0';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'post_rollback_auth_users: <no SELECT privilege on auth.users> (shell runner still checks)';
END;
$postchk$;

SELECT 'post_rollback_parties' AS check,
       count(*) AS rows
FROM public.parties
WHERE name LIKE 'rpc_harness_fixture_%';

-- ============================================================
-- Phase C: DB-contract + abuse-hardening (post-batch)
-- Runs in its own BEGIN/ROLLBACK so nothing leaks either.
-- ============================================================
BEGIN;

\set fixture_marker_c 'rpc_harness_c_'`date +%s%N`
SELECT set_config('confetti.fixture_marker_c', :'fixture_marker_c', true);

DO $phaseC_static$
DECLARE
  def text;
BEGIN
  -- Old caller-configurable bump_ai_turn signature must be gone.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'bump_ai_turn' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'FAIL: obsolete 3-arg bump_ai_turn still exists';
  END IF;
  -- New 1-arg signature must exist.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'bump_ai_turn' AND p.pronargs = 1
  ) THEN
    RAISE EXCEPTION 'FAIL: 1-arg bump_ai_turn missing';
  END IF;
  -- Body must contain the fixed constants, not caller args.
  def := pg_get_functiondef('public.bump_ai_turn(uuid)'::regprocedure);
  IF def !~ 'cap_const constant' OR def !~ 'window_ms_const constant' THEN
    RAISE EXCEPTION 'FAIL: bump_ai_turn cap/window not server-fixed';
  END IF;

  -- confirm_gathering_draft must store theme via ->> (text), not raw ->'theme'.
  def := pg_get_functiondef('public.confirm_gathering_draft(uuid,jsonb)'::regprocedure);
  IF def ~ E'COALESCE\\(_party->''theme''' THEN
    RAISE EXCEPTION 'FAIL: confirm_gathering_draft still persists raw JSON theme';
  END IF;
  IF def !~ E'_party->>''theme''' THEN
    RAISE EXCEPTION 'FAIL: confirm_gathering_draft not reading theme as text';
  END IF;
  IF def !~ 'allowed_occasions' THEN
    RAISE EXCEPTION 'FAIL: confirm_gathering_draft missing occasion allowlist';
  END IF;
  IF def !~ '_validate_confirm_collection' THEN
    RAISE EXCEPTION 'FAIL: confirm_gathering_draft missing collection validation';
  END IF;

  -- Abuse budget table must not be reachable via anon/authenticated.
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='rsvp_action_budget'
      AND grantee IN ('anon','authenticated')
  ) THEN
    RAISE EXCEPTION 'FAIL: rsvp_action_budget exposed to anon/authenticated';
  END IF;

  -- Each public RSVP RPC must call the budget helper.
  FOR def IN
    SELECT pg_get_functiondef(p.oid)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN ('submit_rsvp','claim_bring_item','release_bring_item')
  LOOP
    IF def !~ '_bump_rsvp_budget' THEN
      RAISE EXCEPTION 'FAIL: an RSVP RPC does not consult _bump_rsvp_budget';
    END IF;
  END LOOP;

  RAISE NOTICE 'PASS phaseC_static: bump_ai_turn constants, theme-as-text, occasion enum, budget wiring';
END;
$phaseC_static$;

DO $phaseC_behavior$
DECLARE
  synthetic_user_id uuid := gen_random_uuid();
  party_token uuid := gen_random_uuid();
  party_id uuid;
  marker text := current_setting('confetti.fixture_marker_c');
  fixture_email text := marker || '@rpc-harness.invalid';
  created_synthetic_auth boolean := false;
  res jsonb;
  i int;
  denied boolean := false;
  raised boolean;
  theme_val jsonb;
BEGIN
  BEGIN
    INSERT INTO auth.users (id, email) VALUES (synthetic_user_id, fixture_email);
    created_synthetic_auth := true;
  EXCEPTION WHEN insufficient_privilege THEN
    SELECT user_id INTO synthetic_user_id FROM public.parties LIMIT 1;
    IF synthetic_user_id IS NULL THEN
      RAISE EXCEPTION 'FAIL: cannot bootstrap owner for phaseC';
    END IF;
  END;

  INSERT INTO public.parties (
    user_id, name, occasion, date, guest_estimate, budget, theme,
    tasks, guests, budget_categories, shopping_items, timeline, rsvp_token,
    pinned_inspiration, households, bring_board, host_updates, checkins
  ) VALUES (
    synthetic_user_id, marker, 'birthday', current_date + 14, 10, 100, 'null'::jsonb,
    '[]'::jsonb,
    jsonb_build_array(
      jsonb_build_object('id','g_host1','name','Sam Kim','kind','adult','rsvp','maybe','source','host','household','Kim'),
      jsonb_build_object('id','g_host2','name','Sam Kim','kind','adult','rsvp','maybe','source','host','household','Park')
    ),
    '[]'::jsonb,'[]'::jsonb,'[]'::jsonb, party_token,
    '[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'{}'::jsonb
  ) RETURNING id INTO party_id;

  -- Deterministic matching: unique host-invited guest gets updated in place.
  UPDATE public.parties SET guests = jsonb_build_array(
    jsonb_build_object('id','g_unique','name','Rita Lopez','kind','adult','rsvp','maybe','source','host')
  ) WHERE id = party_id;
  res := public.submit_rsvp(party_token, 'Rita Lopez', 'yes', 1, 0, NULL, '[]'::jsonb, '[]'::jsonb);
  IF NOT (res->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL: unique host match not accepted'; END IF;
  IF (res->>'ambiguous')::boolean THEN RAISE EXCEPTION 'FAIL: unique match marked ambiguous'; END IF;
  IF (SELECT jsonb_array_length(guests) FROM public.parties WHERE id=party_id) <> 1 THEN
    RAISE EXCEPTION 'FAIL: unique match duplicated the guest';
  END IF;
  IF (SELECT guests->0->>'rsvp' FROM public.parties WHERE id=party_id) <> 'yes' THEN
    RAISE EXCEPTION 'FAIL: unique match did not update rsvp in place';
  END IF;

  -- Ambiguous names: without household → new ambiguous link entry, existing rows untouched.
  UPDATE public.parties SET guests = jsonb_build_array(
    jsonb_build_object('id','g_a','name','Sam Kim','kind','adult','rsvp','maybe','source','host','household','Kim'),
    jsonb_build_object('id','g_b','name','Sam Kim','kind','adult','rsvp','maybe','source','host','household','Park')
  ) WHERE id = party_id;
  res := public.submit_rsvp(party_token, 'Sam Kim', 'yes', 1, 0, NULL, '[]'::jsonb, '[]'::jsonb);
  IF NOT (res->>'ambiguous')::boolean THEN RAISE EXCEPTION 'FAIL: duplicate names not flagged ambiguous'; END IF;
  IF (SELECT jsonb_array_length(guests) FROM public.parties WHERE id=party_id) <> 3 THEN
    RAISE EXCEPTION 'FAIL: ambiguous submit did not append new marked entry';
  END IF;

  -- Ambiguous names with household disambiguator resolves to that unique host row.
  UPDATE public.parties SET guests = jsonb_build_array(
    jsonb_build_object('id','g_a','name','Sam Kim','kind','adult','rsvp','maybe','source','host','household','Kim'),
    jsonb_build_object('id','g_b','name','Sam Kim','kind','adult','rsvp','maybe','source','host','household','Park')
  ) WHERE id = party_id;
  res := public.submit_rsvp(party_token, 'Sam Kim', 'yes', 1, 0, 'Kim', '[]'::jsonb, '[]'::jsonb);
  IF (res->>'ambiguous')::boolean THEN RAISE EXCEPTION 'FAIL: household disambiguator ignored'; END IF;
  IF (SELECT jsonb_array_length(guests) FROM public.parties WHERE id=party_id) <> 2 THEN
    RAISE EXCEPTION 'FAIL: disambiguated update grew the guest list';
  END IF;
  IF (SELECT guests->0->>'rsvp' FROM public.parties WHERE id=party_id) <> 'yes' THEN
    RAISE EXCEPTION 'FAIL: household-disambiguated update did not flip Kim to yes';
  END IF;

  -- Per-party budget denial (60/bucket). Force to a small limit by pre-filling
  -- rows into the current bucket, then observe the next call denies.
  INSERT INTO public.rsvp_action_budget(party_id, action, bucket_start, count)
  VALUES (
    party_id, 'submit_rsvp',
    to_timestamp(floor(extract(epoch FROM now())/600)*600) AT TIME ZONE 'UTC',
    60
  ) ON CONFLICT (party_id, action, bucket_start) DO UPDATE SET count = 60;
  BEGIN
    raised := true;
    PERFORM public.submit_rsvp(party_token, 'Any Name', 'yes', 1, 0, NULL, '[]'::jsonb, '[]'::jsonb);
    raised := false;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF NOT raised THEN RAISE EXCEPTION 'FAIL: over-budget submit accepted'; END IF;

  -- Budget expiry: rows > 24h old are pruned on the next attempt.
  DELETE FROM public.rsvp_action_budget WHERE party_id = party_id;
  INSERT INTO public.rsvp_action_budget(party_id, action, bucket_start, count)
  VALUES (party_id, 'submit_rsvp', now() - interval '48 hours', 60);
  res := public.submit_rsvp(party_token, 'Fresh Name', 'yes', 1, 0, NULL, '[]'::jsonb, '[]'::jsonb);
  IF NOT (res->>'ok')::boolean THEN RAISE EXCEPTION 'FAIL: fresh submit after expiry denied'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.rsvp_action_budget
    WHERE party_id = party_id AND bucket_start < now() - interval '24 hours'
  ) THEN RAISE EXCEPTION 'FAIL: expired budget rows not pruned'; END IF;

  RAISE NOTICE 'PASS phaseC_behavior: matching, disambiguation, budget cap, budget expiry';
END;
$phaseC_behavior$;

ROLLBACK;

-- Post-rollback: prove phase-C fixtures did not leak.
DO $postchk_c$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.parties WHERE name LIKE 'rpc_harness_c_%';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: phaseC parties persisted after ROLLBACK: %', n; END IF;
  SELECT count(*) INTO n FROM public.rsvp_action_budget WHERE party_id IN (
    SELECT id FROM public.parties WHERE name LIKE 'rpc_harness_c_%'
  );
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: phaseC budget rows persisted: %', n; END IF;
  RAISE NOTICE 'post_rollback phaseC: 0';
END;
$postchk_c$;

