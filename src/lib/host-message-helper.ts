import { formatDateOnly } from "@/lib/date-only";
import { planningDetailIsOpen, type Guest, type Party } from "@/lib/party-context";

export type HostMessageIntent = "rsvp" | "details" | "food" | "arrival" | "bring";

export type HostMessageDraft = {
  id: HostMessageIntent;
  label: string;
  audienceLabel: string;
  audienceNames: string[];
  reason: string;
  message: string;
  missingDetails: string[];
  privacyNote?: string;
};

function attending(guest: Guest) {
  return guest.rsvp === "yes" || guest.rsvp === "maybe";
}

function names(guests: Guest[]) {
  return guests.map((guest) => guest.name.trim()).filter(Boolean);
}

function uniqueNames(values: Array<string | undefined>) {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const name = value?.trim();
    if (!name || seen.has(name.toLocaleLowerCase())) return [];
    seen.add(name.toLocaleLowerCase());
    return [name];
  });
}

function dateLine(party: Party) {
  if (planningDetailIsOpen(party, "date")) return null;
  const date = formatDateOnly(party.date, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const startTime = party.startTime?.trim();
  return startTime ? `${date} at ${startTime}` : date;
}

function partyFacts(party: Party) {
  const dateKnown = !planningDetailIsOpen(party, "date");
  const startTime = party.startTime?.trim() || null;
  const when = dateLine(party);
  const location = party.location?.trim() || null;
  return {
    when,
    location,
    missingDetails: [
      ...(!dateKnown ? ["date"] : []),
      ...(!startTime ? ["start time"] : []),
      ...(!location ? ["location"] : []),
    ],
  };
}

function linkLine(inviteUrl?: string) {
  return inviteUrl ? `\n\nGuest details and RSVP: ${inviteUrl}` : "";
}

/**
 * Builds deterministic, editable follow-ups from party state. The copy never
 * includes guest names, allergen tags, dietary tags, or private access notes,
 * so the same draft can be pasted into one-to-one conversations safely.
 */
export function hostMessageDrafts(party: Party, inviteUrl?: string): HostMessageDraft[] {
  const facts = partyFacts(party);
  const noReply = party.guests.filter((guest) => guest.rsvp === "invited");
  const coming = party.guests.filter((guest) => guest.rsvp === "yes");
  const foodFollowUp = party.guests.filter(
    (guest) => attending(guest) && Boolean(guest.allergens?.length || guest.dietary?.length),
  );
  const arrivalFollowUp = party.guests.filter(
    (guest) =>
      attending(guest) &&
      (guest.responseDetails?.arrivalPlan === "arriving-later" ||
        guest.responseDetails?.arrivalPlan === "not-sure"),
  );
  const bringers = uniqueNames(
    (party.bringBoard ?? [])
      .filter((item) => item.status === "claimed" || item.status === "done")
      .map((item) => item.assigneeName),
  );

  const drafts: HostMessageDraft[] = [];

  if (noReply.length > 0) {
    const when = facts.when ? ` on ${facts.when}` : "";
    drafts.push({
      id: "rsvp",
      label: "Get remaining RSVPs",
      audienceLabel: `${noReply.length} ${noReply.length === 1 ? "guest has" : "guests have"} not replied`,
      audienceNames: names(noReply),
      reason: "Lock the real headcount before food, seating, and supplies.",
      message: `Hi! Quick headcount check for ${party.name}${when}. Could you let me know if you can make it? ${
        inviteUrl
          ? "A yes, no, or maybe through the guest link is perfect."
          : "A yes, no, or maybe reply here is perfect."
      }${linkLine(inviteUrl)}`,
      missingDetails: facts.missingDetails.filter(
        (detail) => detail === "date" || detail === "start time",
      ),
    });
  }

  if (coming.length > 0) {
    const detailLines = [facts.when, facts.location].filter(Boolean).join("\n");
    drafts.push({
      id: "details",
      label: "Share final details",
      audienceLabel: `${coming.length} confirmed ${coming.length === 1 ? "guest" : "guests"}`,
      audienceNames: names(coming),
      reason: "Put the when and where in one easy-to-find message.",
      message: `Hi! Here are the final details for ${party.name}:${detailLines ? `\n\n${detailLines}` : ""}\n\nLooking forward to celebrating with you!${linkLine(inviteUrl)}`,
      missingDetails: facts.missingDetails,
    });
  }

  if (foodFollowUp.length > 0) {
    drafts.push({
      id: "food",
      label: "Confirm food needs",
      audienceLabel: `${foodFollowUp.length} ${foodFollowUp.length === 1 ? "guest has" : "guests have"} food notes`,
      audienceNames: names(foodFollowUp),
      reason: "Confirm the guest’s own needs before ordering or cooking.",
      message: `Hi! I’m finalizing food for ${party.name}. Could you confirm that your food needs are still current and share anything important about ingredients or preparation? I want to plan it correctly rather than assume.`,
      missingDetails: [],
      privacyNote:
        "Send this one-to-one. Confetti intentionally leaves private food details out of the copied message.",
    });
  }

  if (arrivalFollowUp.length > 0) {
    drafts.push({
      id: "arrival",
      label: "Clarify arrival times",
      audienceLabel: `${arrivalFollowUp.length} ${arrivalFollowUp.length === 1 ? "guest needs" : "guests need"} an arrival check`,
      audienceNames: names(arrivalFollowUp),
      reason: "Protect the welcome, first food, and shared moments without holding the party.",
      message: `Hi! I’m planning the flow for ${party.name}. I saw that your arrival may be later or still undecided. About what time do you expect to join? No pressure—I just want to make sure the welcome and food work for you.`,
      missingDetails: [],
      privacyNote: "Send this one-to-one so each guest can answer privately.",
    });
  }

  if (bringers.length > 0) {
    drafts.push({
      id: "bring",
      label: "Check claimed items",
      audienceLabel: `${bringers.length} ${bringers.length === 1 ? "person has" : "people have"} claimed something`,
      audienceNames: bringers,
      reason: "Catch contribution changes before the host has to fill a last-minute gap.",
      message: `Hi! Quick contribution check for ${party.name}: please review what you claimed on the Bring Board and let me know if anything changed. Thank you for helping make it happen!${linkLine(inviteUrl)}`,
      missingDetails: [],
    });
  }

  return drafts;
}

export function recommendedHostMessage(drafts: HostMessageDraft[]): HostMessageDraft | null {
  const priority: HostMessageIntent[] = ["rsvp", "food", "arrival", "bring", "details"];
  return priority.flatMap((id) => drafts.find((draft) => draft.id === id) ?? []).at(0) ?? null;
}
