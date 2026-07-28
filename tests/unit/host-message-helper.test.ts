import { describe, expect, it } from "vitest";
import { hostMessageDrafts, recommendedHostMessage } from "@/lib/host-message-helper";
import { makeParty, type Party } from "@/lib/party-context";

function party(overrides: Partial<Party> = {}): Party {
  return {
    ...makeParty(
      {
        name: "Jordan's 40th",
        occasion: "birthday",
        date: "2027-05-08",
        startTime: "6:00 PM",
        location: "The backyard",
        guestEstimate: 20,
        budget: 500,
        theme: "",
      },
      "party",
    ),
    ...overrides,
  };
}

describe("host message helper", () => {
  it("recommends the unanswered-RSVP follow-up and includes only that audience", () => {
    const drafts = hostMessageDrafts(
      party({
        guests: [
          { id: "waiting", name: "Sam", kind: "adult", rsvp: "invited" },
          { id: "yes", name: "Riley", kind: "adult", rsvp: "yes" },
          { id: "no", name: "Morgan", kind: "adult", rsvp: "no" },
        ],
        rsvpToken: "invite-token",
      }),
      "https://example.com/rsvp/invite-token",
    );

    const rsvp = drafts.find((draft) => draft.id === "rsvp");
    expect(rsvp?.audienceNames).toEqual(["Sam"]);
    expect(rsvp?.message).toContain("https://example.com/rsvp/invite-token");
    expect(recommendedHostMessage(drafts)?.id).toBe("rsvp");
  });

  it("keeps food tags and private access wording out of every copied message", () => {
    const privateAccess = "Please seat me far from the speaker.";
    const drafts = hostMessageDrafts(
      party({
        guests: [
          {
            id: "food",
            name: "Ari",
            kind: "adult",
            rsvp: "yes",
            dietary: ["Vegetarian"],
            allergens: ["Peanuts"],
            responseDetails: {
              arrivalPlan: "arriving-later",
              accessNotes: privateAccess,
            },
          },
        ],
      }),
    );
    const copiedMessages = drafts.map((draft) => draft.message).join("\n");

    expect(drafts.find((draft) => draft.id === "food")?.audienceNames).toEqual(["Ari"]);
    expect(copiedMessages).not.toContain("Vegetarian");
    expect(copiedMessages).not.toContain("Peanuts");
    expect(copiedMessages).not.toContain(privateAccess);
    expect(drafts.find((draft) => draft.id === "food")?.privacyNote).toMatch(/one-to-one/i);
  });

  it("discloses missing final details instead of inventing them", () => {
    const incomplete = party({
      location: undefined,
      guests: [{ id: "yes", name: "Ari", kind: "adult", rsvp: "yes" }],
    });
    incomplete.tasks.push({
      id: "date-open",
      title: "Choose the party date",
      bucket: "3-5 weeks",
      done: false,
    });

    const details = hostMessageDrafts(incomplete).find((draft) => draft.id === "details");

    expect(details?.missingDetails).toEqual(["date", "location"]);
    expect(details?.message).not.toContain(incomplete.date);
    expect(details?.message).not.toMatch(/undefined|null/i);
  });

  it("flags a missing start time even when the date is already known", () => {
    const drafts = hostMessageDrafts(
      party({
        startTime: "",
        guests: [
          { id: "waiting", name: "Sam", kind: "adult", rsvp: "invited" },
          { id: "yes", name: "Ari", kind: "adult", rsvp: "yes" },
        ],
      }),
    );

    expect(drafts.find((draft) => draft.id === "rsvp")?.missingDetails).toEqual(["start time"]);
    expect(drafts.find((draft) => draft.id === "details")?.missingDetails).toEqual(["start time"]);
  });

  it("deduplicates people who claimed more than one contribution", () => {
    const drafts = hostMessageDrafts(
      party({
        bringBoard: [
          {
            id: "one",
            category: "Sides",
            label: "Salad",
            qty: 1,
            status: "claimed",
            source: "host",
            assigneeName: "Sam",
          },
          {
            id: "two",
            category: "Dessert",
            label: "Brownies",
            qty: 1,
            status: "done",
            source: "host",
            assigneeName: "sam",
          },
        ],
      }),
    );

    expect(drafts.find((draft) => draft.id === "bring")?.audienceNames).toEqual(["Sam"]);
  });
});
