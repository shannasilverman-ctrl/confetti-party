import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallAppPrompt } from "@/components/install-app-prompt";
import { installPromptIsCoolingDown, isIosDevice } from "@/lib/install-app";

function nativeInstallEvent(outcome: "accepted" | "dismissed" = "accepted") {
  return Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome, platform: "web" }),
  });
}

describe("InstallAppPrompt", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        media: "(display-mode: standalone)",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("offers the native install prompt only after browser eligibility", async () => {
    render(<InstallAppPrompt />);
    expect(screen.queryByRole("region", { name: "Install Confetti" })).not.toBeInTheDocument();

    const event = nativeInstallEvent();
    act(() => window.dispatchEvent(event));
    fireEvent.click(await screen.findByRole("button", { name: "Install Confetti" }));

    await waitFor(() => expect(event.prompt).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Install Confetti" })).not.toBeInTheDocument(),
    );
  });

  it("remembers Not now without blocking the dashboard", async () => {
    render(<InstallAppPrompt />);
    act(() => window.dispatchEvent(nativeInstallEvent()));
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));

    expect(screen.queryByRole("region", { name: "Install Confetti" })).not.toBeInTheDocument();
    expect(installPromptIsCoolingDown(window.localStorage)).toBe(true);
  });

  it("recognizes iPhone and touch-capable iPad navigator shapes", () => {
    expect(
      isIosDevice({ userAgent: "Mozilla/5.0 (iPhone)", platform: "iPhone" } as Navigator),
    ).toBe(true);
    expect(
      isIosDevice({
        userAgent: "Mozilla/5.0 (Macintosh)",
        platform: "MacIntel",
        maxTouchPoints: 5,
      } as Navigator),
    ).toBe(true);
  });
});
