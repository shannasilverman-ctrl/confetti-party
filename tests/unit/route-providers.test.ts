import { describe, expect, it } from "vitest";
import { routeProviderNeeds } from "@/lib/route-providers";

describe("route provider loading contract", () => {
  it.each(["/app", "/talk", "/party/ava-liam-wedding", "/party/x/day-of"])(
    "loads auth and party state for %s",
    (path) => {
      expect(routeProviderNeeds(path)).toEqual({ auth: true, party: true });
    },
  );

  it.each(["/", "/auth", "/reset-password", "/account", "/collaborate"])(
    "loads auth without party state for %s",
    (path) => {
      expect(routeProviderNeeds(path)).toEqual({ auth: true, party: false });
    },
  );

  it.each(["/sample-invite", "/rsvp/00000000-0000-0000-0000-000000000000", "/privacy", "/terms"])(
    "keeps public route %s free of both heavyweight providers",
    (path) => {
      expect(routeProviderNeeds(path)).toEqual({ auth: false, party: false });
    },
  );
});
