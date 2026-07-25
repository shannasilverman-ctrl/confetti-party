// Static contract preventing regressions where a leaf route nests under a
// parent that never renders <Outlet />. If someone renames
// `party.$id_.reveal.tsx` back to `party.$id.reveal.tsx` without adding an
// Outlet to the workspace, this test will fail loudly.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const TREE = readFileSync("src/routeTree.gen.ts", "utf8");
const WORKSPACE = readFileSync("src/routes/party.$id.tsx", "utf8");
const REVEAL = readFileSync("src/routes/party.$id_.reveal.tsx", "utf8");
const DAY_OF = readFileSync("src/routes/party.$id_.day-of.tsx", "utf8");

describe("route tree contract", () => {
  it("mounts the party workspace at /party/$id", () => {
    expect(TREE).toContain("path: '/party/$id'");
  });

  it("mounts reveal at /party/$id/reveal without nesting under $id", () => {
    // URL path stays /party/$id/reveal (public contract), but the internal
    // route id must be /party/$id_/reveal so it does NOT inherit the
    // workspace layout (which has no <Outlet />).
    expect(TREE).toContain("path: '/party/$id/reveal'");
    expect(TREE).toContain("id: '/party/$id_/reveal'");
  });

  it("mounts day-of at /party/$id/day-of without nesting under $id", () => {
    expect(TREE).toContain("path: '/party/$id/day-of'");
    expect(TREE).toContain("id: '/party/$id_/day-of'");
  });

  it("workspace does not need to render <Outlet /> for reveal or day-of", () => {
    // If a future change nests reveal/day-of under party.$id again, the
    // workspace MUST render <Outlet />. This assertion catches the pair
    // where nesting exists but no Outlet was added.
    const hasOutlet = /<Outlet\b/.test(WORKSPACE);
    const revealNested = /'\/party\/\$id\/reveal'\s*\n[^]*?parentRoute:\s*typeof PartyIdRoute/.test(
      TREE,
    );
    const dayOfNested = /'\/party\/\$id\/day-of'\s*\n[^]*?parentRoute:\s*typeof PartyIdRoute/.test(
      TREE,
    );
    if (revealNested || dayOfNested) {
      expect(hasOutlet, "workspace nests dedicated modes but has no <Outlet />").toBe(true);
    } else {
      expect(revealNested).toBe(false);
      expect(dayOfNested).toBe(false);
    }
  });

  it("standalone modes wait for PartyProvider hydration before deciding not-found", () => {
    for (const source of [REVEAL, DAY_OF]) {
      // Standalone routes now delegate loading/missing/error rendering to the
      // shared useResolvedParty hook + PartyMode* panels rather than throwing
      // notFound() inline. This avoids CatchBoundary latching on transient
      // hydration states.
      expect(source).toContain("useResolvedParty");
      expect(source).toContain("PartyModeMissing");
      expect(source).toContain("PartyModeLoading");
      // Must NOT synchronously throw notFound() on the render path.
      expect(source).not.toMatch(/^\s*throw notFound\(\)/m);
    }
  });
});
