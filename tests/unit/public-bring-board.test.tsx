import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublicBringBoard } from "@/components/public-bring-board";

const { rpc, toastError, toastSuccess } = vi.hoisted(() => ({
  rpc: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc },
}));
vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));
vi.mock("@/components/confetti-burst", () => ({
  celebrate: vi.fn(),
}));

const TOKEN = "00000000-0000-0000-0000-000000000000";
const ITEM = {
  id: "ice",
  category: "Drinks",
  label: "Bag of ice",
  qty: 1,
  status: "open" as const,
};

describe("PublicBringBoard recovery", () => {
  beforeEach(() => {
    rpc.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
    window.localStorage.clear();
  });

  it("keeps an in-memory release receipt when storage and compensation both fail", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      const error = new Error("Quota exceeded");
      error.name = "QuotaExceededError";
      throw error;
    });
    rpc
      .mockResolvedValueOnce({
        data: { ok: true, claimSecret: "11111111-1111-1111-1111-111111111111" },
        error: null,
      })
      .mockResolvedValueOnce({ data: { ok: false }, error: null })
      .mockResolvedValueOnce({ data: { ok: true }, error: null });

    render(<PublicBringBoard token={TOKEN} items={[ITEM]} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/your name/i), "Shanna");
    await user.click(screen.getByRole("button", { name: /i'll bring it/i }));

    const release = await screen.findByRole("button", { name: /^release$/i });
    expect(toastError).toHaveBeenCalledWith(
      expect.stringMatching(/keep this page open and tap Release/i),
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "release_bring_item",
      expect.objectContaining({
        claim_secret: "11111111-1111-1111-1111-111111111111",
      }),
    );

    await user.click(release);
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(3));
    expect(await screen.findByRole("button", { name: /i'll bring it/i })).toBeVisible();
    expect(toastSuccess).toHaveBeenCalledWith("Released. Someone else can grab it now.");
    setItem.mockRestore();
  });

  it("does not treat an empty RPC payload as a successful release", async () => {
    window.localStorage.setItem(
      `confetti.bring.secrets.${TOKEN}`,
      JSON.stringify({ ice: "22222222-2222-2222-2222-222222222222" }),
    );
    rpc.mockResolvedValueOnce({ data: null, error: null });

    render(<PublicBringBoard token={TOKEN} items={[{ ...ITEM, status: "claimed" }]} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^release$/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /^release$/i })).toBeVisible();
    expect(
      JSON.parse(window.localStorage.getItem(`confetti.bring.secrets.${TOKEN}`) ?? "{}"),
    ).toHaveProperty("ice");
});

describe("PublicBringBoard semantics", () => {
  beforeEach(() => {
    rpc.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
    window.localStorage.clear();
  });

  it("distinguishes a network failure from a genuine already-claimed conflict", async () => {
    // First call throws (network); second returns a benign 'not open' payload.
    rpc.mockRejectedValueOnce(new Error("Failed to fetch")).mockResolvedValueOnce({
      data: { ok: false, reason: "unavailable" },
      error: null,
    });
    const onChanged = vi.fn().mockResolvedValue(undefined);

    render(<PublicBringBoard token={TOKEN} items={[ITEM]} onChanged={onChanged} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/your name/i), "Rae");
    const claimBtn = screen.getByRole("button", { name: /i'll bring it/i });
    await user.click(claimBtn);

    // Network path — copy must say "hiccup", not "someone claimed".
    await waitFor(() => {
      expect(screen.getByTestId("bring-status").textContent).toMatch(/network hiccup/i);
    });

    await user.click(screen.getByRole("button", { name: /i'll bring it/i }));
    await waitFor(() => {
      expect(screen.getByTestId("bring-status").textContent).toMatch(/someone just claimed/i);
    });
    // busyId always cleared via finally.
    expect(screen.getByRole("button", { name: /i'll bring it/i })).not.toBeDisabled();
  });

  it("resets receipts and name-dirty state when the token changes", async () => {
    // Seed a receipt under token A only.
    window.localStorage.setItem(
      `confetti.bring.secrets.${TOKEN}`,
      JSON.stringify({ ice: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }),
    );
    const OTHER = "11111111-1111-1111-1111-111111111111";
    const { rerender } = render(
      <PublicBringBoard
        token={TOKEN}
        items={[{ ...ITEM, status: "claimed" }]}
        defaultName="Ana"
      />,
    );
    // Under token A we see "Claimed by you" + Release.
    expect(await screen.findByRole("button", { name: /^release$/i })).toBeVisible();

    // Now swap to a different token — receipts and name must not leak across.
    rerender(
      <PublicBringBoard
        token={OTHER}
        items={[{ ...ITEM, status: "claimed" }]}
        defaultName="Ben"
      />,
    );
    expect(screen.queryByRole("button", { name: /^release$/i })).toBeNull();
    expect(screen.getByLabelText(/your name/i)).toHaveValue("Ben");
  });

  it("awaits the parent's canonical refresh before releasing busyId", async () => {
    let resolveRefresh: (() => void) | null = null;
    const onChanged = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    rpc.mockResolvedValueOnce({
      data: { ok: true, claimSecret: "33333333-3333-3333-3333-333333333333" },
      error: null,
    });
    render(<PublicBringBoard token={TOKEN} items={[ITEM]} onChanged={onChanged} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/your name/i), "Sam");
    await user.click(screen.getByRole("button", { name: /i'll bring it/i }));

    // Button flips to Release once state updates, but busyId is still true
    // until the parent's refresh resolves.
    const release = await screen.findByRole("button", { name: /^release$/i });
    expect(release).toBeDisabled();
    resolveRefresh?.();
    await waitFor(() => expect(release).not.toBeDisabled());
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("surfaces a Retry release affordance when storage AND compensation fail", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      const err = new Error("Quota exceeded");
      err.name = "QuotaExceededError";
      throw err;
    });
    // 1) claim ok, 2) compensating release fails, 3) user-triggered retry succeeds.
    rpc
      .mockResolvedValueOnce({
        data: { ok: true, claimSecret: "44444444-4444-4444-4444-444444444444" },
        error: null,
      })
      .mockResolvedValueOnce({ data: { ok: false }, error: null })
      .mockResolvedValueOnce({ data: { ok: true }, error: null });

    render(<PublicBringBoard token={TOKEN} items={[ITEM]} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/your name/i), "Kai");
    await user.click(screen.getByRole("button", { name: /i'll bring it/i }));

    const retry = await screen.findByRole("button", { name: /retry release/i });
    expect(screen.getByTestId("bring-status").textContent).toMatch(/keep this tab open/i);

    await user.click(retry);
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(3));
    expect(await screen.findByRole("button", { name: /i'll bring it/i })).toBeVisible();
    setItem.mockRestore();
  });
});
});
