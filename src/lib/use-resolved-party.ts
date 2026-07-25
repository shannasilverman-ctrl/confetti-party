// Shared gate for the standalone party modes (reveal, day-of, and any future
// full-screen view). The provider hydrates asynchronously — for signed-out
// visitors the demo seeds arrive in the mount tick; for signed-in hosts the
// Supabase query resolves later. Reading `parties` synchronously and throwing
// `notFound()` the instant the id is not in the list turns a valid deep link
// into a branded 404 during the intermediate window.
//
// This hook returns a discriminated union so route components can render
// deterministic states without touching TanStack's not-found boundary. We
// never `throw notFound()` for a genuinely-unknown id either — an inline
// branded panel lets the page recover if the provider later hydrates the row
// (e.g. sign-in completes, refetch succeeds, tombstone releases). CatchBoundary
// would latch on the first throw and the user would never see the recovery.
//
// The "settled" guard requires status="ready" for a full commit tick before we
// declare the id missing. Without it, an early ready-with-empty snapshot from
// a re-mounted provider can flash the missing state for one render.

import { useEffect, useRef, useState } from "react";
import { useParties } from "./party-context";
import type { Party } from "./party-context";

export type PartyModeState =
  | { state: "loading" }
  | { state: "error"; retry: () => void }
  | { state: "missing"; retry: () => void }
  | { state: "ready"; party: Party };

export function useResolvedParty(id: string): PartyModeState {
  const { parties, status, refetch } = useParties();
  const party = parties.find((p) => p.id === id);

  // Require one committed render at status="ready" before we call the id
  // missing. Prevents a transient ready-without-rows snapshot from tripping
  // the missing branch during hydration.
  const [readySeen, setReadySeen] = useState(false);
  const readyRef = useRef(false);
  useEffect(() => {
    if (status === "ready") {
      if (!readyRef.current) {
        readyRef.current = true;
        setReadySeen(true);
      }
    } else {
      readyRef.current = false;
      if (readySeen) setReadySeen(false);
    }
  }, [status, readySeen]);

  if (party) return { state: "ready", party };
  if (status === "error") return { state: "error", retry: refetch };
  if (status === "loading" || !readySeen) return { state: "loading" };
  return { state: "missing", retry: refetch };
}
