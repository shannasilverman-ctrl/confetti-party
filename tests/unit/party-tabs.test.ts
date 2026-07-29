import { describe, expect, it } from "vitest";
import { isPartyTabKey, partyTabFromSearch } from "@/lib/party-tabs";

describe("party workspace tabs", () => {
  it.each(["overview", "theme", "shopping", "checklist", "guests", "bring", "budget", "timeline"])(
    "accepts the supported %s section",
    (tab) => {
      expect(isPartyTabKey(tab)).toBe(true);
      expect(partyTabFromSearch(tab)).toBe(tab);
    },
  );

  it("falls back safely for missing or unknown sections", () => {
    expect(partyTabFromSearch(undefined)).toBe("overview");
    expect(partyTabFromSearch("vendors")).toBe("overview");
    expect(partyTabFromSearch(["checklist"])).toBe("overview");
  });
});
