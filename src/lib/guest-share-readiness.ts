import type { SaveState } from "@/lib/party-persistence";

export type GuestShareReadinessKind =
  | "ready"
  | "preview"
  | "needs-date"
  | "unverified"
  | "saving"
  | "offline"
  | "error"
  | "conflict"
  | "local-draft";

export type GuestShareReadiness = {
  kind: GuestShareReadinessKind;
  /** A real RSVP URL and artifacts containing it may be exposed to guests. */
  canShare: boolean;
  /** Demo artifacts may still be exercised without exposing a real guest URL. */
  canPreview: boolean;
  title: string;
  message: string;
};

export function guestShareReadiness({
  isDemo,
  hasRsvpToken,
  dateIsOpen,
  cloudVerified,
  saveState,
  hasConflict,
  insertRejected,
}: {
  isDemo: boolean;
  hasRsvpToken: boolean;
  dateIsOpen: boolean;
  cloudVerified: boolean;
  saveState: SaveState;
  hasConflict: boolean;
  insertRejected: boolean;
}): GuestShareReadiness {
  if (dateIsOpen) {
    return {
      kind: "needs-date",
      canShare: false,
      canPreview: false,
      title: "Pick the date before sharing",
      message: "Add the real date first so guests never receive a placeholder.",
    };
  }

  if (isDemo) {
    return {
      kind: "preview",
      canShare: false,
      canPreview: true,
      title: "Preview only",
      message: "This preview has no live guest link and sends nothing.",
    };
  }

  if (insertRejected) {
    return {
      kind: "local-draft",
      canShare: false,
      canPreview: false,
      title: "Save this party before sharing",
      message:
        "This party exists only on this device. Retry the cloud save before inviting guests.",
    };
  }

  if (hasConflict || saveState === "conflict") {
    return {
      kind: "conflict",
      canShare: false,
      canPreview: false,
      title: "Resolve the changed details first",
      message:
        "Confetti cannot confirm which version guests will see. Choose a version before sharing.",
    };
  }

  if (!cloudVerified) {
    return {
      kind: "unverified",
      canShare: false,
      canPreview: false,
      title: "Reconnect before sharing",
      message:
        "This is not a freshly verified cloud copy. Reconnect so the invitation matches the guest page.",
    };
  }

  if (saveState === "saving") {
    return {
      kind: "saving",
      canShare: false,
      canPreview: false,
      title: "Wait for the latest details to save",
      message: "Sharing unlocks after the guest page acknowledges your latest changes.",
    };
  }

  if (saveState === "offline") {
    return {
      kind: "offline",
      canShare: false,
      canPreview: false,
      title: "Reconnect before sharing",
      message:
        "Your latest details are still on this device and may not match the guest page. Retry when online.",
    };
  }

  if (saveState === "error") {
    return {
      kind: "error",
      canShare: false,
      canPreview: false,
      title: "Retry the save before sharing",
      message: "The latest guest details did not reach the cloud yet.",
    };
  }

  if (!hasRsvpToken) {
    return {
      kind: "local-draft",
      canShare: false,
      canPreview: false,
      title: "Save this party before sharing",
      message: "Confetti has not received a guest link for this party yet.",
    };
  }

  return {
    kind: "ready",
    canShare: true,
    canPreview: false,
    title: "Ready to share",
    message: "The invitation matches the acknowledged guest page.",
  };
}
