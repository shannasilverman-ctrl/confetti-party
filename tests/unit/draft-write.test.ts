import { describe, expect, it, vi } from "vitest";
import { performCreateDraft, performDeleteDraft } from "@/lib/talk.functions";

function createClient(result: {
  data: { id: string } | null;
  error: { message: string; code?: string } | null;
}) {
  const single = vi.fn(async () => result);
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  return {
    client: { from: vi.fn(() => ({ insert })) },
    insert,
  };
}

function deleteClient(error: { message: string; code?: string } | null = null) {
  const secondEq = vi.fn(async () => ({ error }));
  const firstEq = vi.fn(() => ({ eq: secondEq }));
  const del = vi.fn(() => ({ eq: firstEq }));
  return {
    client: { from: vi.fn(() => ({ delete: del })) },
    firstEq,
    secondEq,
  };
}

describe("draft write helpers", () => {
  it("creates a draft owned by the authenticated user", async () => {
    const mock = createClient({ data: { id: "draft-1" }, error: null });
    await expect(performCreateDraft(mock.client, "user-1")).resolves.toEqual({
      id: "draft-1",
    });
    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", draft: expect.any(Object) }),
    );
  });

  it("keeps raw create errors server-side", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const mock = createClient({
      data: null,
      error: { message: "row contains private@example.com", code: "23505" },
    });
    await expect(performCreateDraft(mock.client, "user-1")).rejects.toThrow("create_draft_failed");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("private@example.com");
    spy.mockRestore();
  });

  it("deletes by both draft id and authenticated owner", async () => {
    const mock = deleteClient();
    await expect(performDeleteDraft(mock.client, "user-1", "draft-1")).resolves.toEqual({
      ok: true,
    });
    expect(mock.firstEq).toHaveBeenCalledWith("id", "draft-1");
    expect(mock.secondEq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("keeps raw delete errors server-side", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const mock = deleteClient({
      message: "draft-1 belongs to private@example.com",
      code: "42501",
    });
    await expect(performDeleteDraft(mock.client, "user-1", "draft-1")).rejects.toThrow(
      "delete_draft_failed",
    );
    expect(JSON.stringify(spy.mock.calls)).not.toContain("private@example.com");
    spy.mockRestore();
  });
});
