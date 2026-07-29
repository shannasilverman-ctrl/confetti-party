export const PARTY_TAB_KEYS = [
  "overview",
  "theme",
  "shopping",
  "checklist",
  "guests",
  "bring",
  "budget",
  "timeline",
] as const;

export type PartyTabKey = (typeof PARTY_TAB_KEYS)[number];

export function isPartyTabKey(value: unknown): value is PartyTabKey {
  return typeof value === "string" && PARTY_TAB_KEYS.includes(value as PartyTabKey);
}

export function partyTabFromSearch(value: unknown): PartyTabKey {
  return isPartyTabKey(value) ? value : "overview";
}
