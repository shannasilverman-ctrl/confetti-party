import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("demo-to-account route contract", () => {
  it("preserves the explicit claim destination through signup and confirmation resend", () => {
    const app = readFileSync("src/routes/app.tsx", "utf8");
    const invite = readFileSync("src/components/invite-dialog.tsx", "utf8");
    const rsvp = readFileSync("src/components/rsvp-share-button.tsx", "utf8");
    const auth = readFileSync("src/routes/auth.tsx", "utf8");

    expect(app).toContain("DEMO_CLAIM_RETURN_TO");
    expect(invite).toContain("DEMO_CLAIM_RETURN_TO");
    expect(rsvp).toContain("DEMO_CLAIM_RETURN_TO");
    expect(auth).toContain("resendSignupConfirmation(sentTo.email, returnTo)");
  });

  it("does not silently clear browser parties during an ordinary sign-in", () => {
    const provider = readFileSync("src/lib/party-context.tsx", "utf8");

    expect(provider).not.toContain("_clearDemoState()");
    expect(provider).toContain("claimDemoParties:");
    expect(provider).toContain("_removeDemoCustomParties(claimedIds)");
    expect(provider).toContain("prevIdentityRef.current !== identity");
  });

  it("shows an explicit account-scoped confirmation before moving anything", () => {
    const app = readFileSync("src/routes/app.tsx", "utf8");
    const dialog = readFileSync("src/components/demo-claim-dialog.tsx", "utf8");

    expect(dialog).toContain("Bring your plan with you");
    expect(dialog).toContain("Nothing moves until you confirm.");
    expect(dialog).toMatch(/Sample\s+parties are never moved\./);
    expect(dialog).toContain("Not now");
    expect(app).toContain("Review browser");
    expect(app).toContain("Nothing moves without your confirmation.");
  });
});
