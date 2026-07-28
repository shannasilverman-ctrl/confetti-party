import { describe, expect, it } from "vitest";
import {
  localCostContext,
  localSourcingOptions,
  reconcileSourcingDecisionTasks,
  removeLocalSourcingOption,
  selectLocalSourcingOption,
  sourcingDecisionTask,
  upsertLocalSourcingOption,
} from "@/lib/local-sourcing";
import type { LocalSourcingOption } from "@/lib/party-intelligence";

const venue: LocalSourcingOption = {
  id: "venue-1",
  suggestionId: "birthday-active-venue",
  kind: "venue",
  providerName: "Flying Squirrel",
  url: "https://example.com/party-package",
  cost: 325,
  costBasis: "vendor-quote",
  status: "quoted",
  notes: "Confirm sibling fee.",
};

describe("local sourcing continuity", () => {
  it("keeps a host-entered candidate and preserves quote provenance", () => {
    const profile = upsertLocalSourcingOption(undefined, venue);
    expect(localSourcingOptions(profile)).toEqual([venue]);
    expect(localCostContext(venue.cost, 600)).toBe("$325 · 54% of the current budget");
  });

  it("selects one working choice per recommendation without implying a booking", () => {
    const profile = {
      version: 1 as const,
      localSourcingOptions: [
        venue,
        {
          ...venue,
          id: "venue-2",
          providerName: "Play Gym",
          status: "contacted" as const,
        },
        {
          ...venue,
          id: "food-1",
          suggestionId: "birthday-easy-food",
          kind: "food" as const,
          providerName: "Publix",
          selected: true,
        },
      ],
    };

    const chosen = localSourcingOptions(selectLocalSourcingOption(profile, "venue-2"));
    expect(chosen.find((item) => item.id === "venue-1")?.selected).not.toBe(true);
    expect(chosen.find((item) => item.id === "venue-2")?.selected).toBe(true);
    expect(chosen.find((item) => item.id === "food-1")?.selected).toBe(true);
    expect(chosen.find((item) => item.id === "venue-2")?.status).toBe("contacted");
  });

  it("creates an honest, id-addressable follow-through task", () => {
    const task = sourcingDecisionTask(venue, "task-1");
    expect(task).toMatchObject({
      source: "local-sourcing",
      sourcingOptionId: "venue-1",
      action: "budget",
      done: false,
    });
    expect(task.title).toContain("availability, inclusions, and final price");
    expect(task.reason).toContain("favorite is not a booking");
  });

  it("replaces a sibling candidate's stale task when the working choice changes", () => {
    const alternative = {
      ...venue,
      id: "venue-2",
      providerName: "Play Gym",
      status: "contacted" as const,
    };
    const existing = sourcingDecisionTask(venue, "task-1");
    const unrelated = { ...existing, id: "task-other", sourcingOptionId: "food-1" };

    const tasks = reconcileSourcingDecisionTasks(
      [existing, unrelated],
      [venue, alternative],
      alternative,
      "task-2",
    );

    expect(tasks).toHaveLength(2);
    expect(tasks.find((task) => task.sourcingOptionId === venue.id)).toBeUndefined();
    expect(tasks.find((task) => task.sourcingOptionId === alternative.id)).toMatchObject({
      id: "task-2",
      done: false,
    });
    expect(tasks.find((task) => task.id === "task-other")).toEqual(unrelated);
  });

  it("drops unsafe or malformed persisted candidates instead of rendering them", () => {
    const profile = {
      version: 1 as const,
      localSourcingOptions: [
        venue,
        { ...venue, id: "bad-url", url: "javascript:alert(1)" },
        { ...venue, id: "bad-cost", cost: Number.POSITIVE_INFINITY },
        { ...venue, id: "bad-kind", kind: "rideshare" as never },
      ],
    };
    const options = localSourcingOptions(profile);
    expect(options).toHaveLength(3);
    expect(options.find((item) => item.id === "bad-url")?.url).toBeUndefined();
    expect(options.find((item) => item.id === "bad-cost")?.cost).toBeUndefined();
    expect(options.some((item) => item.id === "bad-kind")).toBe(false);
  });

  it("removes an option without disturbing other planning facts", () => {
    const profile = removeLocalSourcingOption(
      {
        version: 1,
        expectedKids: 5,
        localSourcingOptions: [venue],
      },
      venue.id,
    );
    expect(profile.expectedKids).toBe(5);
    expect(localSourcingOptions(profile)).toEqual([]);
  });
});
