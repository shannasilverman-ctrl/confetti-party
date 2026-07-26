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
        <h1 className="font-display text-3xl font-semibold text-secondary sm:text-4xl">Privacy</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated July 25, 2026. This is plain-language product information about how Confetti
          (currently in beta) handles data. It is not legal advice or a compliance certification.
        </p>

        <section className="prose prose-slate mt-8 max-w-none text-secondary">
          <h2 className="mt-8 font-display text-xl font-semibold">What we collect</h2>
          <ul className="mt-3 list-disc space-y-1 pl-6 text-sm">
            <li>
              Host account data: email address and authentication metadata. Supabase Auth stores the
              password hash; Confetti's application code never receives your plaintext password or
              password hash.
            </li>
            <li>
              Party data you enter: name, date, optional start time and location, guest list (names,
              optional dietary and allergen tags), checklist, budget, shopping items, theme choices,
              host notes, bring-board items, timeline, and retrospective notes.
            </li>
            <li>
              Guest-facing RSVP token that lets anyone with the link view and respond to your party
              without an account. Guest submissions are attached to the party you created.
            </li>
            <li>
              The optional voice co-host ("Talk it out") streams short-lived audio to OpenAI's
              Realtime API to produce a suggested plan. Audio is not stored by Confetti. This
              feature requires an OpenAI key to be configured and may be unavailable in this
              deployment.
            </li>
          </ul>

          <h2 className="mt-8 font-display text-xl font-semibold">What we do not collect</h2>
          <ul className="mt-3 list-disc space-y-1 pl-6 text-sm">
            <li>Payment information — Confetti has no billing.</li>
            <li>Cross-site tracking cookies or third-party ad networks.</li>
            <li>Guest email addresses or phone numbers (unless you type them into a note).</li>
            <li>
              Photos used in Party Booth. The original and event-framed image are processed only in
              the guest's browser, then saved or shared from that device. Confetti does not upload
              or store either image.
            </li>
          </ul>

          <h2 className="mt-8 font-display text-xl font-semibold">Subprocessors</h2>
          <ul className="mt-3 list-disc space-y-1 pl-6 text-sm">
            <li>Supabase — database, authentication, and storage.</li>
            <li>Cloudflare — hosting and edge delivery.</li>
            <li>
              OpenAI — processes text planning turns and, only when you start one, a short-lived
              Realtime API voice session for the co-host.
            </li>
          </ul>

          <h2 className="mt-8 font-display text-xl font-semibold">Retention and deletion</h2>
          <p className="mt-3 text-sm">
            You can delete an individual party from your dashboard or from that party's workspace;
            the delete action removes it from our database and stops the guest RSVP link from
            working. From the{" "}
            <Link to="/account" className="underline underline-offset-2">
              Account page
            </Link>{" "}
            you can also download a JSON export of everything we store for your account, or
            permanently delete your account. Deleting your account cascades: every party, guest
            RSVP, bring-board item, host update, draft, and voice-session record tied to your
            account is removed from the active database. Infrastructure providers may retain
            encrypted operational backups according to the deployment's configured backup schedule;
            this beta does not promise a specific backup purge window.
          </p>
          <p className="mt-3 text-sm">
            Confetti also stores a small amount of sample/demo state in this browser's local storage
            so signed-out visitors can preview the product. That state lives only on this device and
            can be wiped at any time from the Account page or by clearing site data in your browser.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">Guest data</h2>
          <p className="mt-3 text-sm">
            When a guest submits an RSVP through your invitation link, their name and any
            dietary/allergen tags, arrival preference, or optional comfort/access note they enter
            are stored on your party. Confetti asks guests not to include medical records or
            emergency contact details. Public views of the guest page strip attendee identities from
            the bring board and only show aggregate counts.
          </p>

          <h2 className="mt-8 font-display text-xl font-semibold">Questions</h2>
          <p className="mt-3 text-sm">
            Confetti is maintained by an app owner, not a certification body. Product feedback and
            data questions should go to whoever shared this deployment with you.
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
