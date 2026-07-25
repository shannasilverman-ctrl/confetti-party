import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDelete } from "@/components/confirm-delete";

describe("ConfirmDelete", () => {
  it("undo mode does not wrap the trigger in a second button", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDelete
        mode="undo"
        itemLabel="task"
        onConfirm={onConfirm}
        onUndo={() => {}}
        trigger={
          <button type="button" aria-label="Remove task">
            X
          </button>
        }
      />,
    );
    // No nested-interactive HTML: no <button> inside a <button>.
    const nested = document.querySelectorAll("button button");
    expect(nested.length).toBe(0);
    // The forwarded aria-label survives the Slot.
    expect(screen.getByRole("button", { name: "Remove task" })).toBeTruthy();
  });

  it("undo mode forwards click and preserves accessible name/keyboard", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Remove task" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("confirm mode keeps dialog open when onConfirm reports failure", async () => {
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
    const removeBtn = await screen.findByRole("button", { name: /remove/i });
    fireEvent.click(removeBtn);
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    // Inline error surfaces, dialog stays open (Cancel still visible).
    expect(await screen.findByText("Network down")).toBeTruthy();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeTruthy();
  });
});
