import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCollaborationInviteUrl,
  normalizeCollaboratorDisplayName,
  parsePartyPeople,
} from "@/lib/collaboration.functions";

const migrationPath =
  "supabase/migrations/20260728150000_party_memberships_and_migration_control.sql";

describe("collaboration contracts", () => {
  it("parses the narrow people projection and rejects malformed roles", () => {
    expect(
      parsePartyPeople({
        callerRole: "owner",
        members: [
          {
            userId: "user-a",
            role: "owner",
            displayName: null,
            joinedAt: "2026-07-28T00:00:00Z",
            isYou: true,
          },
        ],
        invitations: [],
      }),
    ).toMatchObject({ callerRole: "owner", members: [{ role: "owner", isYou: true }] });
    expect(
      parsePartyPeople({
        callerRole: "viewer",
        members: [],
        invitations: [],
      }),
    ).toBeNull();
  });

  it("stores collaborator bearers hashed and keeps RSVP authority separate", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/token_hash text NOT NULL UNIQUE/);
    expect(sql).toMatch(/extensions\.digest\(_token::text, 'sha256'\)/);
    expect(sql).not.toMatch(/party_collaboration_invitations[\s\S]{0,300}rsvp_token/);
    expect(sql).toMatch(
      /REVOKE ALL ON public\.party_collaboration_invitations FROM PUBLIC, anon, authenticated/,
    );
  });

  it("keeps collaborator bearers out of request paths, queries, and auth redirects", () => {
    const token = "123e4567-e89b-42d3-a456-426614174000";
    const url = new URL(buildCollaborationInviteUrl("https://preview.example", token));
    expect(url.pathname).toBe("/collaborate");
    expect(url.search).toBe("");
    expect(url.hash).toBe(`#invite=${token}`);

    const route = readFileSync("src/routes/collaborate.tsx", "utf8");
    expect(route).toContain(
      'window.history.replaceState(window.history.state, "", "/collaborate")',
    );
    expect(route).toContain("window.sessionStorage.setItem");
    expect(route).toContain('returnTo: "/collaborate"');
    expect(route).not.toContain("/collaborate/$token");
  });

  it("lets accepted collaborator audit history survive account deletion", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/accepted_by uuid REFERENCES auth\.users\(id\) ON DELETE SET NULL/);
    expect(sql).not.toMatch(/accepted_at IS NULL OR accepted_by IS NOT NULL/);
  });

  it("requires a bounded, recognizable cohost label without using email", () => {
    expect(normalizeCollaboratorDisplayName("  Jamie   Rivera  ")).toBe("Jamie Rivera");
    expect(normalizeCollaboratorDisplayName("")).toBeNull();
    expect(normalizeCollaboratorDisplayName(`Jamie\u0000Rivera`)).toBeNull();
    expect(normalizeCollaboratorDisplayName("Jamie\nRivera")).toBeNull();
    expect(normalizeCollaboratorDisplayName("x".repeat(81))).toBeNull();

    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/char_length\(clean_display_name\) > 80/);
    expect(sql).toMatch(/COALESCE\(_display_name, ''\) ~ '\[\[:cntrl:\]\]'/);
    expect(sql).toMatch(
      /INSERT INTO public\.party_memberships \(party_id, user_id, role, display_name\)/,
    );
    const route = readFileSync("src/routes/collaborate.tsx", "utf8");
    expect(route).toContain("Name the host will recognize");
    expect(route).toContain("does not reveal your email");
  });

  it("protects ownership and exposes a confirmed transfer path in the UI", () => {
    const sql = readFileSync(migrationPath, "utf8");
    const component = readFileSync("src/components/party-people-dialog.tsx", "utf8");
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.transfer_party_ownership/);
    expect(sql).toMatch(/new owner must be an active cohost/);
    expect(sql).toMatch(/CREATE TRIGGER protect_party_owner_before_update/);
    expect(component).toContain("transferPartyOwnership");
    expect(component).toContain("Transfer party ownership?");
    expect(component).toContain("Transfer ownership");
  });

  it("blocks account deletion while an owned party is shared", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/shared\.role = 'cohost'/);
    expect(sql).toMatch(/RAISE EXCEPTION 'shared parties require transfer'/);
  });

  it("maintains local owner roles across create, clone, discard, delete, and restore", () => {
    const provider = readFileSync("src/lib/party-context.tsx", "utf8");
    expect(provider).toMatch(/setPartyRoles\(\(prev\) => \(\{ \.\.\.prev, \[id\]: "owner" \}\)\)/);
    expect(provider).toMatch(
      /setPartyRoles\(\(prev\) => \(\{ \.\.\.prev, \[newId\]: "owner" \}\)\)/,
    );
    expect(
      provider.match(/const \{ \[id\]: _drop, \.\.\.rest \} = prev/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(2);
    expect(provider).toMatch(
      /const restoreTarget[\s\S]*setPartyRoles\(\(prev\) => \(\{ \.\.\.prev, \[id\]: "owner" \}\)\)/,
    );
  });

  it("keeps migration control tables service-only and avoids email identity keys", () => {
    const sql = readFileSync(migrationPath, "utf8");
    for (const table of ["external_identities", "migration_runs", "migration_records"]) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
      expect(sql).toMatch(
        new RegExp(`REVOKE ALL ON public\\.${table} FROM PUBLIC, anon, authenticated`),
      );
      expect(sql).toMatch(new RegExp(`GRANT ALL ON public\\.${table} TO service_role`));
    }
    const identityTable = sql.slice(
      sql.indexOf("CREATE TABLE public.external_identities"),
      sql.indexOf("CREATE TABLE public.migration_runs"),
    );
    expect(identityTable).not.toMatch(/\bemail\b/i);
  });
});
