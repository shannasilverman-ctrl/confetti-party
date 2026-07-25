import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDelete } from "@/components/confirm-delete";

describe("ConfirmDelete", () => {
  it("forwards undo behavior without nesting interactive elements", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDelete
        mode="undo"
        itemLabel="task"
        onConfirm={onConfirm}
        trigger={
          <button type="button" aria-label="Remove task">
            X
          </button>
        }
      />,
    );

    expect(document.querySelector("button button")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove task" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("keeps the confirmation open and explains a failed mutation", async () => {
    const onConfirm = vi.fn().mockResolvedValue({ ok: false, error: "Network down" });
    render(
      <ConfirmDelete
        mode="confirm"
        itemLabel="guest"
        onConfirm={onConfirm}
        trigger={
          <button type="button" aria-label="Remove guest">
            X
          </button>
        }
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove guest" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveTextContent("Network down");
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("closes after a successful async confirmation", async () => {
    render(
      <ConfirmDelete
        mode="confirm"
        itemLabel="guest"
        onConfirm={vi.fn().mockResolvedValue({ ok: true })}
        trigger={
          <button type="button" aria-label="Remove guest">
            X
          </button>
        }
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove guest" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument(),
    );
  });
});
