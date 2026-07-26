import { describe, expect, it, vi } from "vitest";
import {
  PRODUCTION_APEX_URL,
  PRODUCTION_CANONICAL_URL,
  assertCanonicalReleaseWorktree,
  verifyProductionRelease,
} from "../../scripts/verify-production.mjs";

const RELEASE_SHA = "0123456789abcdef0123456789abcdef01234567";

describe("production release verification", () => {
  it("requires a clean canonical main worktree", () => {
    const execFile = vi
      .fn()
      .mockReturnValueOnce("main\n")
      .mockReturnValueOnce("")
      .mockReturnValueOnce(`${RELEASE_SHA}\n`)
      .mockReturnValueOnce(`${RELEASE_SHA}\n`);

    expect(assertCanonicalReleaseWorktree(execFile)).toBe(RELEASE_SHA);
  });

  it("rejects a dirty, non-main, or unsynced release source", () => {
    expect(() =>
      assertCanonicalReleaseWorktree(
        vi.fn().mockReturnValueOnce("agent/banner-fix\n").mockReturnValueOnce(""),
      ),
    ).toThrow(/must run from main/);

    expect(() =>
      assertCanonicalReleaseWorktree(
        vi.fn().mockReturnValueOnce("main\n").mockReturnValueOnce(" M src/app.tsx\n"),
      ),
    ).toThrow(/clean worktree/);

    expect(() =>
      assertCanonicalReleaseWorktree(
        vi
          .fn()
          .mockReturnValueOnce("main\n")
          .mockReturnValueOnce("")
          .mockReturnValueOnce(`${RELEASE_SHA}\n`)
          .mockReturnValueOnce("fedcba9876543210fedcba9876543210fedcba98\n"),
      ),
    ).toThrow(/match origin\/main/);
  });

  it("accepts a canonical www release plus an apex redirect", async () => {
    const verifyImpl = vi.fn().mockResolvedValue({
      baseUrl: PRODUCTION_CANONICAL_URL,
      releaseSha: RELEASE_SHA,
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 308,
        headers: { location: `${PRODUCTION_CANONICAL_URL}/release.json` },
      }),
    );

    await expect(
      verifyProductionRelease({ fetchImpl, expectedReleaseSha: RELEASE_SHA, verifyImpl }),
    ).resolves.toMatchObject({
      canonical: { releaseSha: RELEASE_SHA },
      apex: { mode: "redirect", destination: PRODUCTION_CANONICAL_URL },
    });
    expect(verifyImpl).toHaveBeenCalledTimes(1);
  });

  it("fully verifies the apex when it serves the app directly", async () => {
    const verifyImpl = vi
      .fn()
      .mockResolvedValueOnce({
        baseUrl: PRODUCTION_CANONICAL_URL,
        releaseSha: RELEASE_SHA,
      })
      .mockResolvedValueOnce({
        baseUrl: PRODUCTION_APEX_URL,
        releaseSha: RELEASE_SHA,
      });
    const fetchImpl = vi.fn().mockResolvedValue(new Response("ok"));

    await expect(
      verifyProductionRelease({ fetchImpl, expectedReleaseSha: RELEASE_SHA, verifyImpl }),
    ).resolves.toMatchObject({
      apex: { mode: "direct", releaseSha: RELEASE_SHA },
    });
    expect(verifyImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects an apex redirect to an unrelated host", async () => {
    const verifyImpl = vi.fn().mockResolvedValue({
      baseUrl: PRODUCTION_CANONICAL_URL,
      releaseSha: RELEASE_SHA,
    });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 308,
        headers: { location: "https://example.com/release.json" },
      }),
    );

    await expect(
      verifyProductionRelease({ fetchImpl, expectedReleaseSha: RELEASE_SHA, verifyImpl }),
    ).rejects.toThrow(/unexpected destination/);
  });
});
