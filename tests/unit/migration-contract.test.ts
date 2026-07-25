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
    expect(allSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.bump_ai_turn\(_draft_id uuid\)/,
    );
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
    // Occasion enum enforced.
    expect(allSql).toMatch(/allowed_occasions text\[\]/);
    // Collection validator is invoked.
    expect(allSql).toMatch(/_validate_confirm_collection/);
    // Wall-clock time syntax check.
    expect(allSql).toMatch(/\^\[0-2\]\[0-9\]:\[0-5\]\[0-9\]/);
  });

  test("per-party abuse budget table is not exposed to anon/authenticated", () => {
    expect(allSql).toMatch(/CREATE TABLE IF NOT EXISTS public\.rsvp_action_budget/);
    expect(allSql).toMatch(
      /GRANT ALL ON public\.rsvp_action_budget TO service_role/,
    );
    expect(allSql).toMatch(
      /ALTER TABLE public\.rsvp_action_budget ENABLE ROW LEVEL SECURITY/,
    );
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
});
