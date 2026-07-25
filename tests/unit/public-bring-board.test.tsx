import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublicBringBoard } from "@/components/public-bring-board";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc },
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
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

function status() {
  return screen.getByTestId("bring-status").textContent ?? "";
}

describe("PublicBringBoard", () => {
  beforeEach(() => {
    rpc.mockReset();
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps an in-memory retry-release affordance when storage AND compensation fail", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      const err = new Error("Quota exceeded");
      err.name = "QuotaExceededError";
      throw err;
    });
    rpc
      .mockResolvedValueOnce({
        data: { ok: true, claimSecret: "11111111-1111-1111-1111-111111111111" },
        error: null,
      })
      .mockResolvedValueOnce({ data: { ok: false }, error: null }) // compensation fails
      .mockResolvedValueOnce({ data: { ok: true }, error: null }); // user-driven retry succeeds

    render(<PublicBringBoard token={TOKEN} items={[ITEM]} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/your name/i), "Shanna");
    await user.click(screen.getByRole("button", { name: /i'll bring it/i }));

    const retry = await screen.findByRole("button", { name: /retry release/i });
    expect(status()).toMatch(/keep this tab open/i);
    // Compensating release RPC used the freshly-minted secret.
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "release_bring_item",
      expect.objectContaining({
        claim_secret: "11111111-1111-1111-1111-111111111111",
      }),
    );

    await user.click(retry);
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(3));
    expect(await screen.findByRole("button", { name: /i'll bring it/i })).toBeVisible();
    expect(status()).toMatch(/released/i);
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

    await waitFor(() => expect(status()).toMatch(/couldn't release/i));
    expect(screen.getByRole("button", { name: /^release$/i })).toBeVisible();
    expect(
      JSON.parse(window.localStorage.getItem(`confetti.bring.secrets.${TOKEN}`) ?? "{}"),
    ).toHaveProperty("ice");
  });

  it("distinguishes a network failure from a genuine already-claimed conflict", async () => {
    rpc.mockRejectedValueOnce(new Error("Failed to fetch")).mockResolvedValueOnce({
      data: { ok: false, reason: "unavailable" },
      error: null,
    });

    render(<PublicBringBoard token={TOKEN} items={[ITEM]} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/your name/i), "Rae");
    await user.click(screen.getByRole("button", { name: /i'll bring it/i }));
    await waitFor(() => expect(status()).toMatch(/network hiccup/i));

    await user.click(screen.getByRole("button", { name: /i'll bring it/i }));
    await waitFor(() => expect(status()).toMatch(/someone just claimed/i));
    expect(screen.getByRole("button", { name: /i'll bring it/i })).not.toBeDisabled();
  });

  it("resets receipts and name-dirty state when the token changes", async () => {
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
    expect(await screen.findByRole("button", { name: /^release$/i })).toBeVisible();

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

  it("awaits the parent's canonical refresh before clearing busyId", async () => {
    let resolveRefresh: () => void = () => {};
    const refreshPromise = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    const onChanged = vi.fn().mockReturnValue(refreshPromise);
    rpc.mockResolvedValueOnce({
      data: { ok: true, claimSecret: "33333333-3333-3333-3333-333333333333" },
      error: null,
    });

    render(<PublicBringBoard token={TOKEN} items={[ITEM]} onChanged={onChanged} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/your name/i), "Sam");
    await user.click(screen.getByRole("button", { name: /i'll bring it/i }));

    const release = await screen.findByRole("button", { name: /^release$/i });
    expect(release).toBeDisabled();
    resolveRefresh();
    await waitFor(() => expect(release).not.toBeDisabled());
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});
