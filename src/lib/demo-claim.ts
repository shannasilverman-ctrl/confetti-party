import type { Party } from "./party-context";
import {
  partyToColumns,
  type PartyClient,
  type PartyRow,
  type SaveError,
} from "./party-persistence";

export const DEMO_CLAIM_RETURN_TO = "/app?claimDemo=1";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DemoClaimFailure = {
  partyId: string;
  kind: SaveError["kind"] | "invalid" | "collision";
};

export type DemoClaimResult = {
  claimed: PartyRow[];
  failure: DemoClaimFailure | null;
};

export function prepareDemoPartyForClaim(party: Party): Party {
  const copy = JSON.parse(JSON.stringify(party)) as Party;
  // These values belong to a server row/capability, never to a browser draft.
  delete copy.rsvpToken;
  delete copy.updatedAt;
  // Curated sample imagery is local presentation metadata, not account data.
  delete copy.heroImageUrl;
  return copy;
}

function ownedBy(row: PartyRow, userId: string): boolean {
  return row.user_id === userId;
}

/**
 * Idempotently insert validated browser parties for one authenticated owner.
 *
 * Every id is fetched before insert. A same-id row is accepted only when it
 * belongs to this exact user. If an insert races or returns an error, one
 * final fetch can still prove the owned row exists. Inaccessible collisions
 * fail closed. The caller removes browser copies only for returned rows.
 */
export async function claimDemoPartiesToAccount({
  parties,
  userId,
  client,
}: {
  parties: Party[];
  userId: string;
  client: PartyClient;
}): Promise<DemoClaimResult> {
  const claimed: PartyRow[] = [];

  for (const raw of parties) {
    if (!UUID.test(raw.id)) {
      return { claimed, failure: { partyId: raw.id, kind: "invalid" } };
    }
    const party = prepareDemoPartyForClaim(raw);
    const existing = await client.fetch(party.id);
    if (existing.error) {
      return { claimed, failure: { partyId: party.id, kind: existing.error.kind } };
    }
    if (existing.data) {
      if (!ownedBy(existing.data, userId)) {
        return { claimed, failure: { partyId: party.id, kind: "collision" } };
      }
      claimed.push(existing.data);
      continue;
    }

    const inserted = await client.insert(partyToColumns(party, userId));
    if (inserted.data && ownedBy(inserted.data, userId)) {
      claimed.push(inserted.data);
      continue;
    }

    // The response may have been lost after a successful insert, or another
    // tab may have completed the same explicit claim. Refetch once before
    // reporting failure so retry remains exactly-once by party id.
    const after = await client.fetch(party.id);
    if (after.data && ownedBy(after.data, userId)) {
      claimed.push(after.data);
      continue;
    }
    const kind = inserted.error?.kind ?? after.error?.kind ?? "unknown";
    return { claimed, failure: { partyId: party.id, kind } };
  }

  return { claimed, failure: null };
}
