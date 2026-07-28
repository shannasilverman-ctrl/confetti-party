import { describe, expect, it } from "vitest";
import {
  materializePlaybook,
  partyPlaybook,
  preschoolPartyPaths,
  reconcilePartyPlaybook,
} from "@/lib/party-intelligence";
import { makeParty } from "@/lib/party-context";

describe("party intelligence", () => {
  it("makes an editable preschool path recommendation instead of returning option soup", () => {
    const paths = preschoolPartyPaths({
      version: 1,
      honoreeAge: 4,
      expectedKids: 5,
      expectedAdults: 6,
      effort: "balanced",
      format: "help-me-choose",
    });

    expect(paths).toHaveLength(2);
    expect(paths[0]).toMatchObject({
      id: "home-play",
      format: "home",
      recommended: true,
    });
    expect(paths[0]?.recommendationReason).toContain("5-child starting list");
    expect(paths[0]?.tradeoff).toContain("setup");
    expect(paths[1]?.tradeoff).toContain("package time");
  });

  it("recommends containment for a lower-effort or larger preschool party", () => {
    for (const profile of [
      {
        version: 1 as const,
        honoreeAge: 4,
        expectedKids: 5,
        effort: "easy" as const,
        format: "help-me-choose" as const,
      },
      {
        version: 1 as const,
        honoreeAge: 5,
        expectedKids: 8,
        effort: "balanced" as const,
        format: "help-me-choose" as const,
      },
    ]) {
      expect(preschoolPartyPaths(profile)[0]?.format).toBe("venue");
    }
  });

  it("respects a host's explicit preschool format choice", () => {
    const [path] = preschoolPartyPaths({
      version: 1,
      honoreeAge: 4,
      effort: "easy",
      format: "home",
    });

    expect(path?.format).toBe("home");
    expect(path?.recommendationReason).toContain("You chose home");
  });

  it("builds an age-aware four-year-old birthday instead of a generic birthday", () => {
    const playbook = partyPlaybook({
      occasion: "birthday",
      profile: {
        version: 1,
        honoreeAge: 4,
        expectedKids: 5,
        expectedAdults: 6,
        effort: "easy",
        format: "help-me-choose",
      },
      startTime: "10:30",
    });

    expect(playbook).toMatchObject({
      id: "birthday-preschool-v1",
      ageBand: "preschool",
      recommendedDurationMinutes: 90,
      recommendedKidCount: 5,
    });
    expect(playbook?.timeline).toEqual([
      { time: "10:30", activity: "Easy arrival play while families settle in" },
      { time: "10:45", activity: "Main active or pretend-play activity" },
      { time: "11:05", activity: "Food and water" },
      { time: "11:25", activity: "Candles, cake, and the birthday moment" },
      { time: "11:40", activity: "Flexible play, photos, and calm pickup" },
      { time: "12:00", activity: "Party ends before the room runs out of steam" },
    ]);
    expect(playbook?.rsvpQuestions).toContain("Are siblings joining?");
    expect(playbook?.guardrails.some((item) => item.source === "CPSC")).toBe(true);
    expect(playbook?.tasks.some((task) => task.title.includes("door-watching"))).toBe(true);
    expect(playbook?.tasks.every((task) => task.reason && task.action)).toBe(true);
  });

  it("uses relative timeline labels when the start time is not known", () => {
    const playbook = partyPlaybook({
      occasion: "birthday",
      profile: { version: 1, honoreeAge: 4 },
    });
    expect(playbook?.timeline[0]?.time).toBe("Start");
    expect(playbook?.timeline.at(-1)?.time).toBe("+90 min");
  });

  it("does not pretend a generic birthday has preschool-specific knowledge", () => {
    expect(
      partyPlaybook({
        occasion: "birthday",
        profile: { version: 1 },
      }),
    ).toBeNull();
  });

  it("builds a school-age birthday around one anchor and a clear parent handoff", () => {
    const playbook = partyPlaybook({
      occasion: "birthday",
      profile: {
        version: 1,
        honoreeAge: 8,
        expectedKids: 10,
        expectedAdults: 3,
        format: "venue",
      },
      startTime: "14:00",
    });

    expect(playbook).toMatchObject({
      id: "birthday-school-age-v1",
      ageBand: "school-age",
      recommendedDurationMinutes: 150,
    });
    expect(playbook?.timeline[1]).toEqual({
      time: "14:20",
      activity: "Main activity, game, workshop, or venue play begins",
    });
    expect(playbook?.timeline.at(-1)).toEqual({
      time: "16:30",
      activity: "Clear pickup window and adult handoff",
    });
    expect(playbook?.tasks.some((task) => task.title.includes("one anchor activity"))).toBe(true);
    expect(playbook?.rsvpQuestions.some((question) => question.includes("drop-off"))).toBe(true);
    expect(
      playbook?.guardrails.some(
        (guardrail) =>
          guardrail.source === "American Academy of Pediatrics" &&
          guardrail.detail.includes("two to three hours"),
      ),
    ).toBe(true);
  });

  it("builds an adult birthday around the person, guest mix, and hosting load", () => {
    const playbook = partyPlaybook({
      occasion: "birthday",
      profile: {
        version: 1,
        honoreeAge: 40,
        expectedAdults: 28,
        effort: "balanced",
        format: "home",
      },
      startTime: "19:00",
    });

    expect(playbook).toMatchObject({
      id: "birthday-adult-v1",
      ageBand: "adult",
      recommendedDurationMinutes: 180,
    });
    expect(playbook?.title).toContain("40th");
    expect(playbook?.tasks.some((task) => task.title.includes("celebration brief"))).toBe(true);
    expect(playbook?.tasks.some((task) => task.title.includes("plus-one"))).toBe(true);
    expect(playbook?.rsvpQuestions.some((question) => question.includes("photo, story"))).toBe(
      true,
    );
    expect(playbook?.guardrails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "adult-honoree-consent" }),
        expect.objectContaining({ source: "USDA", level: "safety" }),
      ]),
    );
    expect(
      partyPlaybook({
        occasion: "birthday",
        profile: { version: 1, honoreeAge: 21 },
      })?.title,
    ).toContain("21st");
  });

  it("builds a culturally respectful Shabbat workflow instead of a generic holiday list", () => {
    const playbook = partyPlaybook({
      occasion: "holiday",
      holidayPackId: "shabbat",
      profile: {
        version: 1,
        expectedKids: 3,
        expectedAdults: 8,
        effort: "easy",
        format: "home",
      },
      startTime: "18:00",
    });

    expect(playbook).toMatchObject({
      id: "shabbat-dinner-v1",
      title: "A Shabbat dinner that protects the pause",
      recommendedDurationMinutes: 150,
    });
    expect(playbook?.timeline[1]).toEqual({
      time: "18:20",
      activity: "Optional candle lighting and welcome rituals",
    });
    expect(playbook?.tasks.some((task) => task.title.includes("level of observance"))).toBe(true);
    expect(playbook?.rsvpQuestions.some((question) => question.includes("kosher"))).toBe(true);
    expect(playbook?.guardrails.some((item) => item.source === "Jewish community practice")).toBe(
      true,
    );
  });

  it("anchors watch-party prep before kickoff and covers the actual broadcast path", () => {
    const playbook = partyPlaybook({
      occasion: "game-day",
      profile: { version: 1, expectedAdults: 12, effort: "balanced", format: "home" },
      startTime: "16:00",
    });

    expect(playbook?.id).toBe("game-day-v1");
    expect(playbook?.timeline[0]).toEqual({
      time: "15:00",
      activity: "Doors open; drinks and cold snacks are ready",
    });
    expect(playbook?.timeline[2]).toEqual({
      time: "16:00",
      activity: "Kickoff—stream, sound, and backup are confirmed",
    });
    expect(playbook?.tasks.some((task) => task.title.includes("blackout rules"))).toBe(true);
  });

  it("turns cookout food and fire risks into named, actionable jobs", () => {
    const playbook = partyPlaybook({
      occasion: "cookout",
      profile: { version: 1, expectedKids: 4, expectedAdults: 10 },
    });

    expect(playbook?.id).toBe("cookout-v1");
    expect(playbook?.guardrails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "USDA", level: "safety" }),
        expect.objectContaining({ source: "NFPA", level: "safety" }),
      ]),
    );
    expect(playbook?.tasks.some((task) => task.title.includes("weather decision time"))).toBe(true);
    expect(playbook?.timeline[0]?.time).toBe("-60 min");
  });

  it("materializes stable app-domain ids without mutating the playbook", () => {
    let id = 0;
    const playbook = partyPlaybook({
      occasion: "birthday",
      profile: { version: 1, honoreeAge: 4 },
    });
    const result = materializePlaybook(playbook, () => `smart-${++id}`);
    expect(result.tasks[0]).toMatchObject({
      id: "smart-1",
      done: false,
      guidanceSource: "curated",
    });
    expect(result.timeline[0]?.id).toMatch(/^smart-/);
    expect(playbook?.tasks[0]).not.toHaveProperty("id");
  });

  it("keeps a host assignment when the smart playbook is refreshed", () => {
    const party = makeParty(
      {
        name: "Eliana turns four",
        occasion: "birthday",
        date: "2026-09-12",
        guestEstimate: 10,
        budget: 500,
        theme: "Bright bounce",
        planningProfile: { version: 1, honoreeAge: 4 },
      },
      "party-owner",
    );
    const target = party.tasks.find((task) => task.source === "confetti-playbook")!;
    target.owner = "Jordan";
    target.handoffNotes = "Confirm every household and flag private follow-ups.";
    target.ownerStatus = "waiting";

    const reconciled = reconcilePartyPlaybook(
      party,
      { version: 1, honoreeAge: 4, expectedKids: 6 },
      () => "new-id",
    );
    expect(reconciled.tasks.find((task) => task.id === target.id)?.owner).toBe("Jordan");
    expect(reconciled.tasks.find((task) => task.id === target.id)?.handoffNotes).toBe(
      "Confirm every household and flag private follow-ups.",
    );
    expect(reconciled.tasks.find((task) => task.id === target.id)?.ownerStatus).toBe("waiting");
  });

  it("persists the planning profile and builds the smart workflow at party creation", () => {
    const party = makeParty(
      {
        name: "Eliana turns four",
        occasion: "birthday",
        date: "2026-09-12",
        startTime: "10:30",
        location: "Flying Squirrel",
        guestEstimate: 11,
        budget: 650,
        theme: "Bright bounce",
        planningProfile: {
          version: 1,
          honoreeAge: 4,
          expectedKids: 5,
          expectedAdults: 6,
          effort: "easy",
          format: "venue",
        },
      },
      "party-4",
    );

    expect(party.planningProfile?.honoreeAge).toBe(4);
    expect(party.timeline).toHaveLength(6);
    expect(party.timeline[0]).toMatchObject({
      time: "10:30",
      activity: "Easy arrival play while families settle in",
    });
    expect(party.tasks.some((task) => task.title.includes("allergies, sibling attendance"))).toBe(
      true,
    );
  });

  it("materializes Shabbat intelligence alongside the selected holiday pack", () => {
    const party = makeParty(
      {
        name: "Friday night together",
        occasion: "holiday",
        date: "2026-09-11",
        startTime: "18:00",
        guestEstimate: 11,
        budget: 300,
        theme: "Warm table",
        holidayPackId: "shabbat",
        planningProfile: {
          version: 1,
          expectedKids: 3,
          expectedAdults: 8,
          effort: "easy",
          format: "home",
        },
      },
      "shabbat-party",
    );

    expect(party.holidayPackId).toBe("shabbat");
    expect(party.timeline.some((item) => item.activity.includes("candle lighting"))).toBe(true);
    expect(
      party.tasks.some(
        (task) => task.source === "confetti-playbook" && task.title.includes("level of observance"),
      ),
    ).toBe(true);
    expect(party.bringBoard?.some((item) => item.label === "Challah")).toBe(true);
  });

  it("refreshes Confetti recommendations without touching host work or completion", () => {
    const party = makeParty(
      {
        name: "Eliana turns four",
        occasion: "birthday",
        date: "2026-09-12",
        startTime: "10:30",
        guestEstimate: 11,
        budget: 650,
        theme: "Bright bounce",
        planningProfile: { version: 1, honoreeAge: 4, expectedKids: 5, expectedAdults: 6 },
      },
      "party-edit",
    );
    const smartTask = party.tasks.find((task) => task.source === "confetti-playbook")!;
    smartTask.done = true;
    party.tasks.push({
      id: "host-task",
      title: "Ask Grandma to bring the camera",
      bucket: "Party week",
      done: false,
    });

    let nextId = 0;
    const refreshed = reconcilePartyPlaybook(
      party,
      {
        version: 1,
        honoreeAge: 4,
        expectedKids: 6,
        expectedAdults: 7,
        effort: "easy",
        format: "venue",
      },
      () => `refresh-${++nextId}`,
    );

    expect(refreshed.tasks).toContainEqual(
      expect.objectContaining({ id: "host-task", title: "Ask Grandma to bring the camera" }),
    );
    expect(refreshed.tasks.find((task) => task.title === smartTask.title)).toMatchObject({
      id: smartTask.id,
      done: true,
      source: "confetti-playbook",
    });
    expect(refreshed.planningProfile?.expectedKids).toBe(6);
  });
});
