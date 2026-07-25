/**
 * Centralized product vocabulary.
 *
 * The user-facing product uses these terms consistently:
 *   - "Guest invite"  (never "Party Pass" or "Guest World" in UI copy)
 *   - "Bring Board"
 *   - "Photo Drop"
 *   - "Day-of Mode"
 *   - "Reveal"
 *   - "Host notes"
 *
 * Internal route paths ("/rsvp/$token"), DB shapes, and RPC names are
 * implementation details — never surface them in UI copy.
 */
export const VOCAB = {
  guestInvite: "Guest invite",
  guestInviteLong: "Your private guest invite",
  rsvpLink: "Guest invite link",
  bringBoard: "Bring Board",
  photoDrop: "Photo Drop",
  dayOf: "Day-of Mode",
  reveal: "Reveal",
  hostNotes: "Host notes",
  /** Neutral placeholder when no real invite URL exists yet. */
  urlPlaceholder: "Your private RSVP link",
} as const;

export type VocabKey = keyof typeof VOCAB;
