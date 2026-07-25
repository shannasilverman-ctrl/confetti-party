import { Link } from "@tanstack/react-router";

/**
 * Minimal legal + brand footer, safe to drop into any route (dashboard,
 * RSVP, workspace) so the promises in /privacy and /terms are always
 * reachable one tap away.
 */
export function LegalFooter({ className = "" }: { className?: string }) {
  return (
    <footer
      className={`border-t border-border bg-background/80 ${className}`}
      aria-label="Site footer"
    >
      <nav
        aria-label="Legal"
        className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-2 px-6 py-4 text-xs text-muted-foreground"
      >
        <Link to="/privacy" className="hover:text-secondary">
          Privacy
        </Link>
        <Link to="/terms" className="hover:text-secondary">
          Terms
        </Link>
        <span>© {new Date().getFullYear()} Confetti · Beta</span>
      </nav>
    </footer>
  );
}
