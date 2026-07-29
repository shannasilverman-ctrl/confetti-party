// Static migration contract test. Runs in CI without live Postgres.
// Asserts the latest DB-contract/abuse-hardening migration keeps its
// key guarantees so they cannot be quietly regressed by future edits.

import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIG_DIR = join(process.cwd(), "supabase/migrations");
const allSql = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(MIG_DIR, f), "utf8"))
  .join("\n\n");

function latestFunctionBody(name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [
    ...allSql.matchAll(
      new RegExp(`CREATE OR REPLACE FUNCTION public\\.${escaped}\\b[\\s\\S]*?\\n\\$\\$;`, "g"),
    ),
  ];
  const latest = matches.at(-1)?.[0];
  if (!latest) throw new Error(`No migration definition found for ${name}`);
  return latest;
}

describe("migration contract: DB hardening batch", () => {
  test("bump_ai_turn has server-fixed cap and window (1-arg signature)", () => {
    const latest = latestFunctionBody("bump_ai_turn");
    expect(latest).toMatch(/public\.bump_ai_turn\(_draft_id uuid\)/);
    expect(latest).toMatch(/cap_const constant integer := 40/);
    expect(latest).toMatch(/window_ms_const constant integer := 3600000/);
    // Old 3-arg overload must be explicitly dropped.
    expect(allSql).toMatch(
      /DROP FUNCTION IF EXISTS public\.bump_ai_turn\(uuid, integer, integer\)/,
    );
  });

  test("confirm_gathering_draft stores theme as text and validates payload", () => {
    // Theme must be read via ->> (text), never wrapped from raw ->'theme' jsonb.
    expect(allSql).toMatch(/_party->>'theme'/);
    // Occasion enum is the exact product-domain union. Stale aliases such as
    // watch-party/bbq would reject plans created by the TypeScript app.
    expect(allSql).toMatch(
      /'birthday','baby-shower','graduation','holiday',\s*'dinner-party','game-day','cookout','other'/,
    );
    expect(allSql).not.toMatch(
      /allowed_occasions[\s\S]{0,200}'(?:wedding|shabbat|bbq|watch-party|shower|custom)'/,
    );
    // Collection validator is invoked.
    expect(allSql).toMatch(/_validate_confirm_collection/);
    expect(allSql).toMatch(/jsonb_typeof\(item\) <> 'object'/);
    // Wall-clock time is truly 00:00–23:59, not the former 00:00–29:59.
    expect(allSql).toMatch(/\^\(\[01\]\[0-9\]\|2\[0-3\]\):\[0-5\]\[0-9\]/);
    // parties.theme is text — never cast or wrap the value as jsonb.
    expect(allSql).toMatch(/COALESCE\(clean_theme, ''\)/);
    expect(allSql).not.toMatch(/to_jsonb\(clean_theme\)/);
  });

  test("RSVP resubmits prune plus-ones in both update and append paths", () => {
    const latestMigration = readFileSync(
      join(MIG_DIR, "20260725080444_e8309c3f-1539-4737-8afe-833cbb110e91.sql"),
      "utf8",
    );
    const submitBody = latestMigration.match(
      /CREATE OR REPLACE FUNCTION public\.submit_rsvp[\s\S]+?\$\$;/,
    );
    expect(submitBody).toBeTruthy();
    const pruneOccurrences = submitBody![0].match(/LIKE norm_name \|\| ' \+%'/g) ?? [];
    expect(pruneOccurrences).toHaveLength(2);
  });

  test("per-party abuse budget table is not exposed to anon/authenticated", () => {
    expect(allSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.rsvp_action_budget/);
    expect(allSql).toMatch(/GRANT ALL ON public\.rsvp_action_budget TO service_role/);
    expect(allSql).toMatch(/ALTER TABLE public\.rsvp_action_budget ENABLE ROW LEVEL SECURITY/);
    // Must not grant anon/authenticated on the budget table.
    expect(allSql).not.toMatch(
      /GRANT[^;]+ON public\.rsvp_action_budget[^;]+TO (anon|authenticated)/,
    );
  });

  test("public RSVP RPCs consult the budget helper", () => {
    // The latest definition of every public mutation must call the helper.
    // Looking only across the concatenated corpus can produce a false pass
    // when an older safe function is followed by a newer unsafe replacement.
    for (const name of ["submit_rsvp", "claim_bring_item", "release_bring_item"]) {
      expect(latestFunctionBody(name)).toMatch(/_bump_rsvp_budget/);
    }
  });

  test("voice reservations are atomic across Worker isolates", () => {
    const latest = latestFunctionBody("reserve_talk_session");
    expect(latest).toMatch(/pg_advisory_xact_lock\(hashtextextended\(caller_id::text/);
    expect(latest).toMatch(/hourly_count >= 5/);
    expect(latest).toMatch(/concurrent_count >= 2/);
    expect(latest).toMatch(/started_at >= now\(\) - interval '15 minutes'/);
    expect(latest).toMatch(/INSERT INTO public\.talk_sessions/);
    expect(allSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.reserve_talk_session\(uuid, text\) FROM PUBLIC/,
    );
    expect(allSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.reserve_talk_session\(uuid, text\) TO authenticated/,
    );
  });

  test("submit_rsvp uses deterministic normalized matching with ambiguous marker", () => {
    // Whitespace-collapsing regex used both for name and household normalization.
    expect(allSql).toMatch(/regexp_replace\(btrim\(coalesce\(g->>'name'/);
    // Ambiguous marker persisted on the new link entry.
    expect(allSql).toMatch(/'ambiguous', ambiguous/);
    // Result payload includes the ambiguous flag.
    expect(allSql).toMatch(/'ok', true, 'ambiguous'/);
  });

  test("generic error messages: no raw payload echoed on rejection", () => {
    // confirm_gathering_draft rejections use the generic string.
    const confirm = allSql.match(
      /CREATE OR REPLACE FUNCTION public\.confirm_gathering_draft[\s\S]+?\$\$;/g,
    );
    expect(confirm).toBeTruthy();
    const latest = confirm![confirm!.length - 1];
    expect(latest).toMatch(/RAISE EXCEPTION 'invalid payload'/);
    expect(latest).not.toMatch(/RAISE EXCEPTION 'invalid name'/);
    expect(latest).not.toMatch(/RAISE EXCEPTION 'invalid date'/);
  });

  test("public Photo Drop projection is HTTPS-only and preserves the host note", () => {
    const projectionMigration = readFileSync(
      join(MIG_DIR, "20260725083900_7e21e11d-6dd1-4d09-bc58-dc4776b603c9.sql"),
      "utf8",
    );
    expect(projectionMigration).toMatch(/photo_url ~\* '\^https:\/\//);
    expect(projectionMigration).toMatch(
      /COALESCE\(p\.photo_drop->>'notes', p\.photo_drop->>'note'\)/,
    );
    expect(projectionMigration).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_rsvp_party\(uuid\) FROM PUBLIC/,
    );
  });

  test("party intelligence profile is validated, persisted, and narrowly projected", () => {
    const confirm = latestFunctionBody("confirm_gathering_draft");
    expect(allSql).toMatch(
      /ADD COLUMN IF NOT EXISTS planning_profile jsonb NOT NULL DEFAULT '\{\}'::jsonb/,
    );
    expect(confirm).toMatch(/jsonb_typeof\(clean_profile\) <> 'object'/);
    expect(confirm).toMatch(
      /'version','honoreeAge','expectedKids','expectedAdults','effort','format',\s+'foodRole','foodServiceStyle','eventTimeZone'/,
    );
    expect(confirm).toMatch(/clean_profile->>'format' NOT IN \('home','venue','help-me-choose'\)/);
    expect(confirm).toMatch(/planning_profile, host_note/);

    const profileMigration = readFileSync(
      join(MIG_DIR, "20260726121000_party_planning_profile_contract.sql"),
      "utf8",
    );
    expect(profileMigration).toMatch(/'kind', 'preschool-birthday'/);
    expect(profileMigration).toMatch(/'adultLabel', 'Adults staying'/);
    expect(profileMigration).toMatch(
      /'kidHint', 'Include invited children and any siblings joining\.'/,
    );
    // Public projection intentionally exposes a behavior hint, not the
    // honoree age or the full private profile.
    const returnProjection = profileMigration.slice(
      profileMigration.lastIndexOf("RETURN jsonb_build_object"),
    );
    expect(returnProjection).toMatch(/'rsvp_context', public_rsvp_context/);
    expect(returnProjection).not.toMatch(/'planning_profile', p\.planning_profile/);
    expect(returnProjection).not.toMatch(/'honoreeAge'/);
  });

  test("Talk confirmation requires and atomically persists a validated timed-party zone", () => {
    const confirm = latestFunctionBody("confirm_gathering_draft");

    expect(confirm).toMatch(/SECURITY DEFINER/);
    expect(confirm).toMatch(/SET search_path = public/);
    expect(confirm).toMatch(/WHERE id = _draft_id AND user_id = auth\.uid\(\)\s+FOR UPDATE/);
    expect(confirm).toMatch(
      /d\.status = 'confirmed' AND d\.confirmed_party_id IS NOT NULL[\s\S]+?'already_confirmed', true/,
    );
    expect(confirm).toMatch(
      /FROM pg_catalog\.pg_timezone_names\s+WHERE name = clean_event_time_zone/,
    );
    expect(confirm).toMatch(
      /clean_profile->>'foodRole' NOT IN \('light-bites','full-meal','grazing'\)/,
    );
    expect(confirm).toMatch(
      /clean_profile->>'foodServiceStyle' NOT IN \('self-serve','family-style','served'\)/,
    );
    expect(confirm).toMatch(/clean_start_time IS NOT NULL AND clean_event_time_zone IS NULL/);
    expect(confirm).toMatch(/\(\[1-9\]\|1\[0-2\]\):\[0-5\]\[0-9\] \(AM\|PM\)/);
    expect(confirm).toMatch(
      /jsonb_set\(\s*clean_profile,\s*'\{eventTimeZone\}',\s*to_jsonb\(clean_event_time_zone\)/,
    );
    expect(confirm).toMatch(/PERFORM public\._validate_confirm_collection\(_party->'tasks'/);
    expect(confirm).toMatch(/planning_profile, host_note/);
    expect(confirm).toMatch(/clean_pack_id, clean_profile, clean_host_note/);
    expect(allSql).toMatch(
      /REVOKE ALL ON FUNCTION public\.confirm_gathering_draft\(uuid, jsonb\) FROM PUBLIC/,
    );
    expect(allSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.confirm_gathering_draft\(uuid, jsonb\) TO authenticated/,
    );
  });

  test("contextual RSVP v2 exposes only a coarse workflow and validates minimal answers", () => {
    const projection = latestFunctionBody("get_rsvp_party_v2");
    expect(projection).toMatch(/base := public\.get_rsvp_party\(token\)/);
    expect(projection).toMatch(/'kind', 'preschool-birthday'/);
    expect(projection).toMatch(/'kind', 'school-age-birthday'/);
    expect(projection).toMatch(/'kind', 'adult-birthday'/);
    expect(projection).toMatch(
      /WHEN 'baby-shower' THEN jsonb_build_object\('kind', 'baby-shower'\)/,
    );
    expect(projection).toMatch(/WHEN 'graduation' THEN jsonb_build_object\('kind', 'graduation'\)/);
    expect(projection).toMatch(/pg_timezone_names/);
    expect(projection).toMatch(/'\{event_time_zone\}'/);
    expect(projection).toMatch(/to_jsonb\(public_time_zone\)/);
    expect(projection).not.toMatch(/jsonb_build_object\('honoreeAge'/);
    expect(projection).not.toMatch(/'effort'/);
    expect(projection).not.toMatch(/'planning_profile'/);
    expect(projection).not.toMatch(/expectedAdults|expectedKids|parent|graduate/i);

    const submission = latestFunctionBody("submit_rsvp_v2");
    expect(submission).toMatch(/pg_column_size\(response_details\) > 1024/);
    expect(submission).toMatch(/key NOT IN \('arrivalPlan', 'accessNotes'\)/);
    expect(submission).toMatch(/char_length\(clean_access\) > 200/);
    expect(submission).toMatch(/result := public\.submit_rsvp\(/);
    expect(submission).toMatch(/'responseDetails', clean_details/);
    expect(submission).toMatch(/'contextSaved'/);
    expect(submission).not.toMatch(/phone|email|emergencyContact/i);
    expect(allSql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.submit_rsvp_v2\([\s\S]*?\) TO anon, authenticated/,
    );
  });

  test("SMS staging storage is content-minimal, RPC-only, deduplicated, and rate bounded", () => {
    const sms = readFileSync(join(MIG_DIR, "20260729123000_sms_staging_transport.sql"), "utf8");

    for (const table of [
      "sms_contacts",
      "sms_conversations",
      "sms_messages",
      "sms_service_budget",
      "sms_replay_tombstones",
      "sms_consent_events",
    ]) {
      expect(sms).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
      expect(sms).toMatch(
        new RegExp(
          `REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated, service_role`,
        ),
      );
      expect(sms).not.toMatch(new RegExp(`GRANT[^;]+ON TABLE public\\.${table}`));
    }

    const messageTable =
      sms.match(/CREATE TABLE IF NOT EXISTS public\.sms_messages \([\s\S]+?\n\);/)?.[0] ?? "";
    expect(messageTable).not.toMatch(/\b(phone|body|reply)\s+text\b/);
    expect(messageTable).toMatch(/body_digest text NOT NULL/);
    expect(messageTable).toMatch(/reply_ciphertext text/);
    expect(sms).toMatch(/provider_message_sid text PRIMARY KEY/);
    expect(sms).toMatch(/expires_at timestamptz[^;]+180 days/);

    const read = latestFunctionBody("get_sms_inbound_context");
    expect(read).toMatch(/_body_digest text/);
    expect(read).toMatch(/sms_replay_tombstones/);
    expect(read).toMatch(/existing_phone_hash <> _phone_hash/);
    expect(read).toMatch(/existing_body_digest <> _body_digest/);
    expect(read).toMatch(/jsonb_build_object\('status', 'duplicate'\)/);
    expect(read).not.toMatch(/replyCiphertext/);

    const commit = latestFunctionBody("commit_sms_inbound");
    expect(commit).toMatch(/pg_advisory_xact_lock\(hashtextextended\(_phone_hash, 0\)\)/);
    expect(commit).toMatch(/conversation_row\.version <> _expected_version/);
    expect(commit).toMatch(/rate_count >= 40/);
    expect(commit).toMatch(/service_rate_count >= 200/);
    expect(commit).toMatch(/_planning_kind NOT IN \('stopped', 'resumed', 'help'\)/);
    expect(commit).toMatch(/version = version \+ 1/);
    expect(commit).toMatch(/sms_consent_events/);
    expect(commit).toMatch(/sms_replay_tombstones/);
    expect(commit).toMatch(/WHEN limited\s+THEN NULL/);

    expect(sms).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_sms_inbound_context\(text, text, text\)\s+TO service_role/,
    );
    expect(sms).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.commit_sms_inbound\([\s\S]+?\) TO service_role/,
    );
    expect(sms).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.(?:get_sms_inbound_context|commit_sms_inbound)[\s\S]+?TO (?:anon|authenticated)/,
    );
    expect(sms).toMatch(/CREATE OR REPLACE FUNCTION public\.purge_expired_sms_data/);
  });
});
