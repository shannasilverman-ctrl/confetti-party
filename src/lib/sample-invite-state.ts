/**
 * Local-only demo state for the /sample-invite showroom.
 *
 * Never touches Supabase, RPCs, real party rows, or user records.
 * Persists only in a versioned, capped localStorage key that can be
 * reset from the sample UI at any time.
 *
 * Isolation contract (see tests/unit/sample-invite-state.test.ts):
 *   - Reads never invoke `supabase.*`
 *   - Writes never invoke `supabase.*`
 *   - The storage key is namespaced ("confetti:sample-invite:v1") and
 *     cannot collide with production party state
 */

const STORAGE_KEY = "confetti:sample-invite:v1";
const MAX_BYTES = 32 * 1024;

export type SampleRSVP = "yes" | "maybe" | "no";

export type SampleBringItem = {
  id: string;
  category: string;
  label: string;
  qty: number;
  status: "open" | "claimed";
  claimedByMe?: boolean;
};

export type SampleRsvpEntry = {
  name: string;
  choice: SampleRSVP;
  adults: number;
  kids: number;
  dietary: string[];
  allergens: string[];
  at: string;
};

export type SampleState = {
  v: 1;
  rsvp: SampleRsvpEntry | null;
  bring: SampleBringItem[];
  /** Baseline yes/maybe seeded so counts feel alive without lying about production data. */
  baseline: { yes: number; maybe: number };
};

const DEFAULT_BRING: SampleBringItem[] = [
  { id: "b-app", category: "Sides", label: "Antipasti platter", qty: 1, status: "open" },
  { id: "b-pie", category: "Dessert", label: "Tiramisu", qty: 1, status: "claimed" },
  { id: "b-wine", category: "Drinks", label: "Bottle of Chianti", qty: 3, status: "open" },
  { id: "b-ice", category: "Drinks", label: "Bag of ice", qty: 2, status: "open" },
];

export function defaultSampleState(): SampleState {
  return {
    v: 1,
    rsvp: null,
    bring: DEFAULT_BRING.map((b) => ({ ...b })),
    baseline: { yes: 14, maybe: 3 },
  };
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadSampleState(): SampleState {
  if (!isBrowser()) return defaultSampleState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSampleState();
    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed as { v?: unknown }).v !== 1 ||
      !Array.isArray((parsed as { bring?: unknown }).bring)
    ) {
      return defaultSampleState();
    }
    return parsed as SampleState;
  } catch {
    return defaultSampleState();
  }
}

export function saveSampleState(state: SampleState): { ok: boolean; reason?: "quota" | "oversized" } {
  if (!isBrowser()) return { ok: true };
  const payload = JSON.stringify(state);
  if (payload.length > MAX_BYTES) return { ok: false, reason: "oversized" };
  try {
    window.localStorage.setItem(STORAGE_KEY, payload);
    return { ok: true };
  } catch {
    return { ok: false, reason: "quota" };
  }
}

export function resetSampleState(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function derivedCounts(state: SampleState) {
  const bump = state.rsvp?.choice === "yes" ? 1 : 0;
  const bumpMaybe = state.rsvp?.choice === "maybe" ? 1 : 0;
  return {
    yes: state.baseline.yes + bump,
    maybe: state.baseline.maybe + bumpMaybe,
  };
}
