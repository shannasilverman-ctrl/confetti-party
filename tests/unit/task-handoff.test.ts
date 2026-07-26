import { describe, expect, it } from "vitest";
import { makeParty, type Party, type Task } from "@/lib/party-context";
import { taskHandoffMessage } from "@/lib/task-handoff";

function party(overrides: Partial<Party> = {}): Party {
  return {
    ...makeParty(
      {
        name: "Eliana turns four",
        occasion: "birthday",
        date: "2027-05-08",
        startTime: "2:00 PM",
        location: "The backyard",
        guestEstimate: 11,
        budget: 500,
        theme: "",
      },
      "party",
    ),
    ...overrides,
  };
}

const task: Task = {
  id: "cake",
  title: "Pick up the birthday cake",
  bucket: "Party week",
  done: false,
  owner: "Jordan",
  handoffNotes: "Pick up by noon and confirm candles are included.",
  reason: "The cake cannot become a day-of errand for the host.",
};

describe("task handoff brief", () => {
  it("gives the owner the outcome, timing, and reason in one message", () => {
    const message = taskHandoffMessage(party(), task);

    expect(message).toContain("Jordan — can you own this for Eliana turns four?");
    expect(message).toContain("Task: Pick up the birthday cake");
    expect(message).toContain("Timing: Party week · Party is Saturday, May 8 at 2:00 PM");
    expect(message).toContain("Done means: Pick up by noon and confirm candles are included.");
    expect(message).toContain("Why it matters:");
    expect(message).toContain("reply here to confirm");
  });

  it("does not invent a party date or completion brief when those facts are open", () => {
    const openParty = party({ date: "", startTime: "" });
    openParty.tasks.push({
      id: "date-open",
      title: "Choose the party date",
      bucket: "3-5 weeks",
      done: false,
    });

    const message = taskHandoffMessage(openParty, {
      ...task,
      owner: undefined,
      handoffNotes: undefined,
      reason: undefined,
    });

    expect(message).toContain("Can you own this for Eliana turns four?");
    expect(message).toContain("Timing: Party week");
    expect(message).not.toContain("Party is");
    expect(message).not.toContain("Done means");
    expect(message).not.toContain("Why it matters");
  });

  it("never exposes private workspace or guest state", () => {
    const privateParty = party({
      rsvpToken: "private-token",
      hostNote: "Surprise guest is Taylor",
      guests: [
        {
          id: "guest",
          name: "Ari",
          kind: "adult",
          rsvp: "yes",
          allergens: ["Peanuts"],
          responseDetails: { accessNotes: "Keep this private" },
        },
      ],
    });

    const message = taskHandoffMessage(privateParty, task);

    expect(message).not.toContain("private-token");
    expect(message).not.toContain("Surprise guest");
    expect(message).not.toContain("Peanuts");
    expect(message).not.toContain("Keep this private");
  });
});
