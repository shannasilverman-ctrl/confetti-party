import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { BrandLockup } from "@/components/brand";

const MARKETING_SITE = "https://confettiplans.com";

export const Route = createFileRoute("/")({
  component: AppEntry,
  head: () => ({
    meta: [
      { title: "Confetti" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content: "Sign in to Confetti, or read about it at confettiplans.com.",
      },
    ],
    links: [{ rel: "canonical", href: MARKETING_SITE }],
  }),
});

/**
 * `app.confettiplans.com` used to serve a second marketing page that competed
 * with confettiplans.com — a different headline, a different pitch, a different
 * logo. There is now one story, told in one place.
 *
 * This route is only an entry point: signed-in hosts continue to their parties,
 * everyone else is sent to the marketing site. The scenes and copy that lived
 * here still exist at `/tour`, linked from below in case the redirect is slow
 * or blocked.
 */
function AppEntry() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (user) {
      void navigate({ to: "/app", replace: true });
      return;
    }
    window.location.replace(MARKETING_SITE);
  }, [user, loading, navigate]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <BrandLockup />
      <p className="text-sm text-muted-foreground" role="status">
        {loading ? "One moment…" : user ? "Taking you to your parties…" : "Taking you to Confetti…"}
      </p>
      {/* A link, not just a redirect: reachable if the redirect is blocked. */}
      <a className="text-sm font-medium text-primary underline" href={MARKETING_SITE}>
        Continue to confettiplans.com
      </a>
    </main>
  );
}
