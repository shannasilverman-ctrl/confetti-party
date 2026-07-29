import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Party } from "@/lib/party-context";

const writeText = vi.fn(async (_value: string) => undefined);
const retrySave = vi.fn();

const party: Party = {
  id: "party-1",
  name: "Neighborhood dinner",
  occasion: "dinner-party",
  date: "2027-08-15",
  startTime: "6:30 PM",
  location: "Community garden",
  guestEstimate: 12,
  budget: 300,
  theme: "",
  rsvpToken: "private-rsvp-token",
  tasks: [],
  guests: [],
  budgetCategories: [],
  timeline: [],
  shoppingItems: [],
  pinnedInspiration: [],
  bringBoard: [],
  hostUpdates: [],
  checkins: {},
};

let saveState: "saving" | "saved" | "error" = "saving";
let cloudVerified = true;

vi.mock("@/lib/party-context", () => ({
  daysUntil: () => 30,
  planningDetailIsOpen: () => false,
  useParties: () => ({
    getParty: () => party,
    isDemo: false,
    readState: { source: "server", lastSyncedAt: 1_000 },
    isPartyCloudVerified: () => cloudVerified,
    saveStates: { "party-1": saveState },
    conflicts: {},
    insertRejected: {},
    retrySave,
    resolveConflict: vi.fn(),
    discardLocalDraft: vi.fn(),
  }),
}));

vi.mock("html-to-image", () => ({ toPng: vi.fn() }));

import { InviteDialog } from "@/components/invite-dialog";
import { RsvpShareButton } from "@/components/rsvp-share-button";

beforeEach(() => {
  saveState = "saving";
  cloudVerified = true;
  writeText.mockClear();
  retrySave.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

afterEach(cleanup);

describe("InviteDialog guest share readiness", () => {
  it("hides the bearer link and disables every guest artifact until cloud acknowledgement", async () => {
    const view = render(<InviteDialog open onOpenChange={vi.fn()} partyId="party-1" />);

    const notice = await screen.findByTestId("guest-share-readiness");
    expect(notice).toHaveAttribute("data-state", "saving");
    expect(notice).toHaveTextContent("Wait for the latest details to save");
    expect(document.body).not.toHaveTextContent("private-rsvp-token");
    expect(screen.getByRole("button", { name: "Copy link" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy message" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download image" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Email invite" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).not.toHaveBeenCalled();

    saveState = "saved";
    view.rerender(<InviteDialog open onOpenChange={vi.fn()} partyId="party-1" />);

    await waitFor(() =>
      expect(screen.queryByTestId("guest-share-readiness")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Copy link" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Email invite" })).toBeInTheDocument();
    expect(document.body).toHaveTextContent("private-rsvp-token");

    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0]?.[0]).toMatch(/\/rsvp\/private-rsvp-token$/);
  });

  it("keeps error recovery beside disabled share controls", async () => {
    saveState = "error";
    render(<InviteDialog open onOpenChange={vi.fn()} partyId="party-1" />);

    expect(await screen.findByTestId("guest-share-readiness")).toHaveAttribute(
      "data-state",
      "error",
    );
    expect(screen.getByRole("button", { name: "Copy link" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retrySave).toHaveBeenCalledWith("party-1");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("unlocks a cached party after its own server row is acknowledged", async () => {
    cloudVerified = false;
    saveState = "error";
    const view = render(<InviteDialog open onOpenChange={vi.fn()} partyId="party-1" />);

    expect(await screen.findByTestId("guest-share-readiness")).toHaveAttribute(
      "data-state",
      "unverified",
    );
    expect(screen.getByRole("button", { name: "Copy link" })).toBeDisabled();

    cloudVerified = true;
    saveState = "saved";
    view.rerender(<InviteDialog open onOpenChange={vi.fn()} partyId="party-1" />);

    await waitFor(() =>
      expect(screen.queryByTestId("guest-share-readiness")).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  });

  it("lets the direct RSVP action finish in place after recovery", async () => {
    cloudVerified = false;
    saveState = "error";
    const view = render(<RsvpShareButton partyId="party-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy RSVP link" }));
    expect(await screen.findByTestId("guest-share-blocked-dialog")).toHaveTextContent(
      "Reconnect before sharing",
    );

    cloudVerified = true;
    saveState = "saved";
    view.rerender(<RsvpShareButton partyId="party-1" />);

    expect(await screen.findByRole("heading", { name: "Ready to share" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy RSVP link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  });
});
