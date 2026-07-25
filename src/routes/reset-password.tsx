import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { normalizeAuthReturnTo } from "@/lib/auth-redirect";

type ResetSearch = { returnTo?: string };
type Phase = "checking" | "ready" | "invalid" | "not_recovery";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  validateSearch: (s: Record<string, unknown>): ResetSearch => ({
    returnTo: typeof s.returnTo === "string" ? normalizeAuthReturnTo(s.returnTo) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Reset your password · Confetti" },
      { name: "description", content: "Set a new password for your Confetti account." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

/** Heuristic: a recovery landing carries `type=recovery` in the URL hash
 * (or `?type=recovery` when the provider forwards it as a query). No hint
 * means the user reached /reset-password directly and cannot masquerade an
 * ordinary session as a recovery flow. */
function hasRecoveryHint(): boolean {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash ?? "";
  const search = window.location.search ?? "";
  const inHash = /(^|[#&?])type=recovery(?=&|$)/.test(hash);
  const inQuery = /(^|[?&])type=recovery(?=&|$)/.test(search);
  // Some Supabase configurations use a `code=` query param (PKCE). Treat that
  // as a hint too — the client will exchange it for a session, then fire
  // PASSWORD_RECOVERY.
  const hasCode = /(^|[?&])code=/.test(search);
  return inHash || inQuery || hasCode;
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { updatePassword } = useAuth();
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const submitLockRef = useRef(false);
  const recoveryFiredRef = useRef(false);

  useEffect(() => {
    // Deterministic branch: no recovery hint → this is a direct visit, not
    // a real reset flow. Never allow an ordinary signed-in session to reveal
    // the update-password form here.
    if (!hasRecoveryHint()) {
      setPhase("not_recovery");
      return;
    }

    let cancelled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY") {
        recoveryFiredRef.current = true;
        setPhase("ready");
      }
    });

    // Guard against event-before-mount: if Supabase already processed the
    // recovery hash before the listener attached, the session exists AND
    // aud === 'recovery' typically, but there's no reliable public field.
    // Fall back to a bounded timeout to declare the link expired/used.
    const timer = setTimeout(() => {
      if (cancelled || recoveryFiredRef.current) return;
      setPhase((p) => (p === "ready" ? p : "invalid"));
    }, 6000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitLockRef.current) return;
    if (password.length < 8) {
      setInlineError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setInlineError("Passwords don't match.");
      return;
    }
    submitLockRef.current = true;
    setSubmitting(true);
    setInlineError(null);
    try {
      const { error } = await updatePassword(password);
      if (error) {
        setInlineError("Couldn't update the password. Request a fresh reset link and try again.");
        return;
      }
      // Clear the recovery marker; from here on the user has a normal session.
      recoveryFiredRef.current = false;
      setPassword("");
      setConfirm("");
      void navigate({ to: normalizeAuthReturnTo(search.returnTo), replace: true });
    } catch {
      setInlineError("Couldn't reach the sign-in service. Check your connection and try again.");
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <BrandLockup />
        <Button asChild variant="ghost" size="sm">
          <Link to="/">Back to home</Link>
        </Button>
      </header>

      <main className="mx-auto flex max-w-md flex-col items-stretch px-6 py-10">
        <div className="rounded-3xl border border-border bg-card p-8 shadow-card">
          <h1 className="font-display text-2xl font-semibold text-secondary">Set a new password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a password with at least 8 characters.
          </p>

          {phase === "invalid" || phase === "not_recovery" ? (
            <div
              role="alert"
              aria-live="polite"
              className="mt-6 rounded-2xl border border-border bg-muted/40 p-4 text-sm text-secondary"
            >
              <p>
                {phase === "not_recovery"
                  ? "This page is only reachable from a password reset link. Request one to continue."
                  : "This reset link looks expired or already used."}
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button asChild variant="festive" size="sm" className="min-h-11">
                  <Link to="/auth" search={{ mode: "forgot" }}>
                    Request a new link
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm" className="min-h-11">
                  <Link to="/auth" search={{ mode: "signin" }}>
                    Back to sign in
                  </Link>
                </Button>
              </div>
            </div>
          ) : phase === "checking" ? (
            <p className="mt-6 text-sm text-muted-foreground" role="status" aria-live="polite">
              Verifying reset link…
            </p>
          ) : (
            <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
              <div>
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="min-h-11"
                />
              </div>
              <div>
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="min-h-11"
                />
              </div>
              <div
                role="alert"
                aria-live="assertive"
                className="min-h-[1.25rem] text-sm text-destructive"
              >
                {inlineError}
              </div>
              <Button type="submit" variant="festive" className="min-h-11" disabled={submitting}>
                {submitting ? "Please wait…" : "Update password"}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
