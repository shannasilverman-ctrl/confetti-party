import { daysUntil, type Party } from "@/lib/party-context";

/**
 * Splits parties into upcoming (today or later) and past, and returns
 * an honest summary line for the dashboard header.
 */
export function partiesSummary(parties: Pick<Party, "date">[]): {
  active: number;
  past: number;
  copy: string;
} {
  const active = parties.filter((p) => daysUntil(p.date) >= 0).length;
  const past = parties.length - active;
  if (parties.length === 0) {
    return { active: 0, past: 0, copy: "Nothing here yet — plan your first party." };
  }
  if (active === 0) {
    return { active, past, copy: `${past} wrapped — start a new one.` };
  }
  const activeCopy = `${active} upcoming`;
  return {
    active,
    past,
    copy:
      past > 0
        ? `${activeCopy} · ${past} past — pick one to keep planning.`
        : `${activeCopy} — pick one to keep planning.`,
  };
}
