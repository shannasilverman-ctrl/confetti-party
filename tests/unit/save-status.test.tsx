// Verifies aria semantics + impact-specific labels on the SaveStatus card.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SaveStatus } from "@/components/save-status";
import type { PendingConflict } from "@/lib/party-persistence";

vi.mock("@/lib/party-context", () => {
  const state: {
    conflict: PendingConflict | null;
    rejected: boolean;
    saveState: string;
  } = { conflict: null, rejected: false, saveState: "idle" };
  return {
    __setMockState: (patch: Partial<typeof state>) => Object.assign(state, patch),
    useParties: () => ({
      isDemo: false,
      saveStates: { p1: state.saveState },
      conflicts: state.conflict ? { p1: state.conflict } : {},
      insertRejected: state.rejected ? { p1: true } : {},
      retrySave: () => {},
      resolveConflict: () => {},
      discardLocalDraft: () => {},
    }),
  };
});

import * as ctxMock from "@/lib/party-context";
const setMock = (ctxMock as unknown as { __setMockState: (p: unknown) => void }).__setMockState;

describe("SaveStatus", () => {
  it("uses assertive alert region for a guest conflict with impact-specific labels", () => {
    setMock({
      saveState: "conflict",
      conflict: {
        columns: ["guests"],
        localValues: {},
        serverValues: {},
        safeMergedValues: {},
        at: "2027-01-01T00:00:00Z",
      },
      rejected: false,
    });
    render(<SaveStatus partyId="p1" />);
    const alert = screen.getByTestId("save-status-alert");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.getAttribute("aria-live")).toBe("assertive");
    expect(screen.getByTestId("save-status-use-mine").textContent).toMatch(/replace someone else/i);
    expect(screen.getByTestId("save-status-keep-theirs").textContent).toMatch(
      /drops my guest\/claim edits/i,
    );
  });

  it("uses generic labels for a non-guest conflict", () => {
    setMock({
      saveState: "conflict",
      conflict: {
        columns: ["name"],
        localValues: {},
        serverValues: {},
        safeMergedValues: {},
        at: "2027-01-01T00:00:00Z",
      },
      rejected: false,
    });
    render(<SaveStatus partyId="p1" />);
    expect(screen.getByTestId("save-status-use-mine").textContent).toMatch(/Use mine/);
    expect(screen.getByTestId("save-status-keep-theirs").textContent).toMatch(
      /Use latest from cloud/,
    );
  });

  it("renders the rejected-insert alert with truthful copy", () => {
    setMock({ saveState: "error", conflict: null, rejected: true });
    render(<SaveStatus partyId="p1" />);
    const alert = screen.getByTestId("save-status-alert");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toMatch(/Kept in this browser/);
    expect(alert.textContent).not.toMatch(/kept on this device/i);
    expect(screen.getByTestId("save-status-retry-insert")).toBeTruthy();
    expect(screen.getByTestId("save-status-discard")).toBeTruthy();
  });
});
