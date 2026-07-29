import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { DemoClaimDialog } from "@/components/demo-claim-dialog";
import type { Party } from "@/lib/party-context";

function party(id: string, name: string): Party {
  return {
    id,
    name,
    occasion: "birthday",
    date: "2030-08-10",
    guestEstimate: 12,
    budget: 500,
    theme: "Make it yours",
    tasks: [],
    guests: [],
    budgetCategories: [],
    timeline: [],
    shoppingItems: [],
    pinnedInspiration: [],
  };
}

describe("DemoClaimDialog", () => {
  it("names the destination account and moves only the explicitly selected parties", async () => {
    const first = party("123e4567-e89b-42d3-a456-426614174001", "Backyard birthday");
    const second = party("123e4567-e89b-42d3-a456-426614174002", "Sunday dinner");
    const onClaim = vi.fn().mockResolvedValue({
      claimedIds: [first.id],
      error: null,
      cleanupPending: false,
    });
    const onFinish = vi.fn();

    render(
      <DemoClaimDialog
        open
        onOpenChange={vi.fn()}
        parties={[first, second]}
        accountEmail="shanna@example.com"
        onClaim={onClaim}
        onFinish={onFinish}
      />,
    );

    expect(screen.getByText("sh…@example.com")).toBeInTheDocument();
    expect(
      screen.getByText("Sample parties are never moved.", { exact: false }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Move 2 parties" })).toBeEnabled(),
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Move Sunday dinner" }));
    fireEvent.click(screen.getByRole("button", { name: "Move 1 party" }));

    await waitFor(() => expect(onClaim).toHaveBeenCalledWith([first.id]));
    expect(onFinish).toHaveBeenCalledWith(first.id);
  });

  it("lets a host defer without importing or deleting anything", () => {
    const candidate = party("123e4567-e89b-42d3-a456-426614174001", "Backyard birthday");
    const onClaim = vi.fn();
    const onFinish = vi.fn();

    render(
      <DemoClaimDialog
        open
        onOpenChange={vi.fn()}
        parties={[candidate]}
        accountEmail="host@example.com"
        onClaim={onClaim}
        onFinish={onFinish}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onClaim).not.toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledWith();
  });

  it("has no automated accessibility violations in its confirmation state", async () => {
    const candidate = party("123e4567-e89b-42d3-a456-426614174001", "Backyard birthday");
    render(
      <DemoClaimDialog
        open
        onOpenChange={vi.fn()}
        parties={[candidate]}
        accountEmail="host@example.com"
        onClaim={vi.fn()}
        onFinish={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Move 1 party" })).toBeEnabled());
    const results = await axe.run(screen.getByRole("dialog"), {
      rules: {
        // jsdom has no layout/paint engine; color contrast is covered by
        // Playwright on the product-wide palette.
        "color-contrast": { enabled: false },
      },
    });
    expect(results.violations).toEqual([]);
  });
});
