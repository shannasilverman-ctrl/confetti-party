// Branded full-screen panels shared by the standalone party modes.
// Rendering these inline (instead of throwing `notFound()` or `redirect()`)
// keeps the component mounted so recovery — a delayed sign-in, a retried
// fetch, or a settled provider — updates the UI in place.

import { Link } from "@tanstack/react-router";
import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";

export function PartyModeLoading({ label = "Loading your party…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <BrandLockup />
        <div
          role="status"
          aria-live="polite"
          data-testid="party-mode-loading"
          className="text-sm text-muted-foreground"
        >
          {label}
        </div>
      </div>
    </div>
  );
}

export function PartyModeError({ retry }: { retry: () => void }) {
  return (
    <div
      role="alert"
      data-testid="party-mode-error"
      className="flex min-h-screen items-center justify-center bg-background px-4"
    >
      <div className="max-w-sm text-center">
        <BrandLockup />
        <h1 className="mt-4 font-display text-2xl text-secondary">
          We couldn’t load your party
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Check your connection and try again. Your plan is still safe.
        </p>
        <Button className="mt-4" variant="festive" onClick={retry}>
          Try again
        </Button>
      </div>
    </div>
  );
}

export function PartyModeMissing({
  id,
  retry,
  mode,
}: {
  id: string;
  retry: () => void;
  mode: "reveal" | "day-of";
}) {
  const label = mode === "reveal" ? "reveal" : "day-of view";
  return (
    <div
      role="alert"
      data-testid="party-mode-missing"
      className="flex min-h-screen items-center justify-center bg-background px-4"
    >
      <div className="max-w-md text-center">
        <BrandLockup />
        <h1 className="mt-4 font-display text-3xl text-secondary">
          We can’t find that party
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The {label} for <span className="font-mono">{id}</span> isn’t in your list.
          It may have been deleted, or you may need to sign in with the host account.
        </p>
        <div className="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <Button variant="festive" onClick={retry}>
            Try again
          </Button>
          <Link to="/app">
            <Button variant="outline">Back to your parties</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
