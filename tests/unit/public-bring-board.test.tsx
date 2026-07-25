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
});
