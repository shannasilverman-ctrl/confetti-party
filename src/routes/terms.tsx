import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "Terms · Confetti" },
      {
        name: "description",
        content: "Plain-language terms for using Confetti to plan gatherings.",
      },
      { property: "og:title", content: "Terms · Confetti" },
      {
        property: "og:description",
        content: "Plain-language terms for using Confetti to plan gatherings.",
      },
    ],
  }),
});

function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <BrandLockup />
        <Button asChild variant="ghost" size="sm">
          <Link to="/">Back to home</Link>
        </Button>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-6 pb-24">
        <h1 className="font-display text-3xl font-semibold text-secondary sm:text-4xl">Terms</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated{" "}
          {new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}.
          Plain-language product information for using Confetti (currently in beta). Not legal
          counsel.
        </p>

        <section className="prose prose-slate mt-8 max-w-none text-secondary">
          <h2 className="mt-8 font-display text-xl font-semibold">Using Confetti</h2>
          <p className="mt-3 text-sm">
            Confetti helps you plan gatherings. Use it for lawful personal or organizational
            hosting. Do not use Confetti to harass others, share illegal content, or misrepresent
            other people's identity in guest lists or notes.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">Your content</h2>
          <p className="mt-3 text-sm">
            You own the party data you enter. Confetti stores it so you can plan across sessions and
            so guests with your invite link can respond. Do not enter sensitive personal information
            about others without their consent (health records, financial data, government IDs).
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">Guest invitations</h2>
          <p className="mt-3 text-sm">
            Invite links are unguessable but not confidential. Treat them like an email invitation:
            share deliberately. Anyone with the link can RSVP and claim bring-board items.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">AI features</h2>
          <p className="mt-3 text-sm">
            The voice co-host and text suggestions are optional and may be unavailable in this
            deployment. When available, they can make mistakes — review any generated plan before
            you rely on it, and do not share confidential information you would not want processed
            by our AI subprocessor.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">Availability and warranty</h2>
          <p className="mt-3 text-sm">
            Confetti is provided "as is" without warranty. We aim for reasonable availability but do
            not guarantee uninterrupted service. The operator is not liable for lost data, missed
            events, or any indirect damages arising from use of the service.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">Ending your use</h2>
          <p className="mt-3 text-sm">
            You can delete individual parties at any time from the dashboard or from a party's
            workspace. A self-serve account deletion flow is not currently exposed; contact the
            operator of this deployment if you need it. The operator may suspend accounts that
            violate these terms.
          </p>

          <div className="mt-10 flex gap-3">
            <Button asChild variant="outline" size="sm">
              <Link to="/privacy">Privacy</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/">Home</Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
