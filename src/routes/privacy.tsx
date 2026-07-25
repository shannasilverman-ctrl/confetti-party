import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacy · Confetti" },
      {
        name: "description",
        content: "How Confetti handles host and guest data, retention, and deletion requests.",
      },
      { property: "og:title", content: "Privacy · Confetti" },
      {
        property: "og:description",
        content: "How Confetti handles host and guest data, retention, and deletion requests.",
      },
    ],
  }),
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <BrandLockup />
        <Button asChild variant="ghost" size="sm">
          <Link to="/">Back to home</Link>
        </Button>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-6 pb-24">
        <h1 className="font-display text-3xl font-semibold text-secondary sm:text-4xl">
          Privacy
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated {new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}.
          Maintained by the Confetti team.
        </p>

        <section className="prose prose-slate mt-8 max-w-none text-secondary">
          <h2 className="mt-8 font-display text-xl font-semibold">What we collect</h2>
          <ul className="mt-3 list-disc space-y-1 pl-6 text-sm">
            <li>
              Host account data: email address and password hash, used only to sign you in.
            </li>
            <li>
              Party data you enter: name, date, optional start time and location, guest list
              (names, optional dietary and allergen tags), checklist, budget, shopping items,
              theme choices, host notes, bring-board items, timeline, and retrospective notes.
            </li>
            <li>
              Guest-facing RSVP token that lets anyone with the link view and respond to your
              party without an account. Guest submissions are attached to the party you created.
            </li>
            <li>
              For the optional voice co-host ("Talk it out"): a short-lived audio stream sent to
              OpenAI's Realtime API to produce a suggested party plan. Audio is not stored by
              Confetti; a transcript summary may be persisted with your party.
            </li>
          </ul>

          <h2 className="mt-8 font-display text-xl font-semibold">What we do not collect</h2>
          <ul className="mt-3 list-disc space-y-1 pl-6 text-sm">
            <li>Payment information — Confetti has no billing.</li>
            <li>Cross-site tracking cookies or third-party ad networks.</li>
            <li>Guest email addresses or phone numbers (unless you type them into a note).</li>
          </ul>

          <h2 className="mt-8 font-display text-xl font-semibold">Subprocessors</h2>
          <ul className="mt-3 list-disc space-y-1 pl-6 text-sm">
            <li>Supabase — database, authentication, and storage.</li>
            <li>Cloudflare — hosting and edge delivery.</li>
            <li>OpenAI — the Realtime API for the voice co-host, only when you use it.</li>
          </ul>

          <h2 className="mt-8 font-display text-xl font-semibold">Retention and deletion</h2>
          <p className="mt-3 text-sm">
            Party data is retained until you delete the party or your account. You can delete a
            party from your dashboard at any time. To request deletion of your entire account and
            all data associated with it, contact the host of this Confetti instance.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">Guest data</h2>
          <p className="mt-3 text-sm">
            When a guest submits an RSVP through your invitation link, their name and any
            dietary/allergen tags they enter are stored on your party. Public views of the guest
            page strip attendee identities from the bring board and only show aggregate counts.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">Contact</h2>
          <p className="mt-3 text-sm">
            Questions or deletion requests: contact the operator of this Confetti instance
            directly. This page is maintained by the app owner, not a third-party certification.
          </p>

          <div className="mt-10 flex gap-3">
            <Button asChild variant="outline" size="sm">
              <Link to="/terms">Terms</Link>
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
