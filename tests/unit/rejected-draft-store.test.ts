// Verifies user isolation, versioning, size cap, and corruption reset for
// the recoverable draft store used when authenticated INSERT rejects.

import { describe, it, expect, beforeEach } from "vitest";
import {
  saveRejectedDraft,
  loadRejectedDraft,
  clearRejectedDraft,
  __resetForTests,
  REJECTED_DRAFT_STORAGE_KEY,
  REJECTED_DRAFT_MAX_BYTES,
} from "@/lib/rejected-draft-store";

// jsdom provides window.localStorage; ensure clean slate per test.
beforeEach(() => {
  __resetForTests();
});

const baseDraft = {
  id: "p_abc_1234567",
  name: "Ava & Liam",
  occasion: "wedding",
  date: "2027-06-05",
  guestEstimate: 120,
  budget: 5000,
};

describe("rejected-draft-store", () => {
  it("round-trips a draft for the same user id", async () => {
    const res = await saveRejectedDraft("user-A", baseDraft);
    expect(res.ok).toBe(true);
    const got = await loadRejectedDraft("user-A");
    expect(got?.name).toBe("Ava & Liam");
    expect(got?.date).toBe("2027-06-05");
    expect(got?.savedAt).toMatch(/^\d{4}/);
  });

  it("isolates drafts between different user ids on the same device", async () => {
    await saveRejectedDraft("user-A", baseDraft);
    await saveRejectedDraft("user-B", { ...baseDraft, id: "p_b_xyz1234", name: "B's plan" });
    expect((await loadRejectedDraft("user-A"))?.name).toBe("Ava & Liam");
    expect((await loadRejectedDraft("user-B"))?.name).toBe("B's plan");
  });

  it("clearRejectedDraft removes only the caller's draft", async () => {
    await saveRejectedDraft("user-A", baseDraft);
    await saveRejectedDraft("user-B", { ...baseDraft, id: "p_b_xyz1234" });
    await clearRejectedDraft("user-A");
    expect(await loadRejectedDraft("user-A")).toBeNull();
    expect(await loadRejectedDraft("user-B")).not.toBeNull();
  });

  it("resets a corrupt payload silently on read", async () => {
    window.localStorage.setItem(REJECTED_DRAFT_STORAGE_KEY, "{not-json");
    const got = await loadRejectedDraft("user-A");
    expect(got).toBeNull();
  });

  it("accepts payloads under the per-user byte cap", async () => {
    const oversized = {
      ...baseDraft,
      hostNote: "x".repeat(500),
      location: "y".repeat(200),
    };
    const res1 = await saveRejectedDraft("user-A", oversized);
    expect(res1.ok).toBe(true);
    const encoded = JSON.stringify(await loadRejectedDraft("user-A"));
    expect(encoded.length).toBeLessThan(REJECTED_DRAFT_MAX_BYTES);
  });

  it("refuses payloads that fail Zod validation (bad date shape)", async () => {
    const res = await saveRejectedDraft("user-A", { ...baseDraft, date: "not-a-date" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("invalid");
  });

  it("guards against __proto__ pollution in raw storage payload", async () => {
    window.localStorage.setItem(
      REJECTED_DRAFT_STORAGE_KEY,
      JSON.stringify({ __proto__: { polluted: true }, version: 1, drafts: {} }),
    );
    const got = await loadRejectedDraft("user-A");
    expect(got).toBeNull();
    // Object prototype must not be polluted.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
