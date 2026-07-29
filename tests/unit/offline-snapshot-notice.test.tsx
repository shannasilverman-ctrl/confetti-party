import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PartyReadState } from "@/lib/party-context";

let currentReadState: PartyReadState = { source: "server", lastSyncedAt: 1_000 };

vi.mock("@/lib/party-context", () => ({
  useParties: () => ({ readState: currentReadState }),
}));

import { OfflineSnapshotNotice } from "@/components/offline-snapshot-notice";

afterEach(cleanup);

describe("OfflineSnapshotNotice", () => {
  it("stays absent for an authoritative server snapshot", () => {
    currentReadState = { source: "server", lastSyncedAt: 1_000 };
    render(<OfflineSnapshotNotice />);
    expect(screen.queryByTestId("offline-snapshot-notice")).not.toBeInTheDocument();
  });

  it("labels cached data and explains reconnect behavior without claiming live state", () => {
    currentReadState = { source: "cache", lastSyncedAt: Date.UTC(2027, 7, 15, 18, 30) };
    render(<OfflineSnapshotNotice />);

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(/Offline copy · Last synced/i);
    expect(notice).toHaveTextContent(/changes stay on this device and retry/i);
    expect(notice).toHaveTextContent(/Invites and collaborator updates may be newer/i);
    expect(notice).not.toHaveTextContent(/live|up to date/i);
  });
});
