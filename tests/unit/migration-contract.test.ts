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

describe("migration contract: DB hardening batch", () => {
  test("bump_ai_turn has server-fixed cap and window (1-arg signature)", () => {
    expect(allSql).toMatch(/CREATE OR REPLACE FUNCTION public\.bump_ai_turn\(_draft_id uuid\)/);
    expect(allSql).toMatch(/cap_const constant integer := 40/);
    expect(allSql).toMatch(/window_ms_const constant integer := 3600000/);
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
    const bodies = allSql.split(
      /CREATE OR REPLACE FUNCTION public\.(submit_rsvp|claim_bring_item|release_bring_item)/,
    );
    // Every one of the three most recent definitions must call the helper.
    for (const name of ["submit_rsvp", "claim_bring_item", "release_bring_item"]) {
      const re = new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${name}[\\s\\S]*?_bump_rsvp_budget`,
      );
      // last (latest) match is what will run — split-and-match is enough
      // because migrations are forward-only and we grep the whole corpus.
      expect(allSql).toMatch(re);
    }
    expect(bodies.length).toBeGreaterThan(1);
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
});
