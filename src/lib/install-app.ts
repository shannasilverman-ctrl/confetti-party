export const INSTALL_DISMISS_KEY = "confetti.install-prompt-dismissed-at";
export const INSTALL_DISMISS_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1_000;

type InstallChoice = { outcome: "accepted" | "dismissed"; platform: string };

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

export type NavigatorWithStandalone = Navigator & { standalone?: boolean };

export function isStandaloneApp(
  browserWindow?: Pick<Window, "matchMedia">,
  browserNavigator?: NavigatorWithStandalone,
) {
  return Boolean(
    browserNavigator?.standalone ||
    browserWindow?.matchMedia?.("(display-mode: standalone)").matches,
  );
}

export function isIosDevice(browserNavigator?: Navigator) {
  if (!browserNavigator) return false;
  return (
    /iPhone|iPad|iPod/i.test(browserNavigator.userAgent) ||
    (browserNavigator.platform === "MacIntel" && browserNavigator.maxTouchPoints > 1)
  );
}

export function installPromptIsCoolingDown(
  storage: Pick<Storage, "getItem"> | undefined,
  now = Date.now(),
) {
  if (!storage) return false;
  try {
    const dismissedAt = Number(storage.getItem(INSTALL_DISMISS_KEY));
    return (
      Number.isFinite(dismissedAt) &&
      dismissedAt > 0 &&
      now - dismissedAt < INSTALL_DISMISS_COOLDOWN_MS
    );
  } catch {
    return false;
  }
}

export function rememberInstallPromptDismissal(
  storage: Pick<Storage, "setItem"> | undefined,
  now = Date.now(),
) {
  try {
    storage?.setItem(INSTALL_DISMISS_KEY, String(now));
  } catch {
    // Private browsing or a storage policy can deny access. Dismiss for this
    // render without making installation a prerequisite for using Confetti.
  }
}
