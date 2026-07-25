import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: "Reset your password · Confetti" },
      { name: "description", content: "Set a new password for your Confetti account." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { updatePassword } = useAuth();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);

  // Supabase places recovery info in the URL hash and immediately establishes a
  // session server-side. Wait for onAuthStateChange PASSWORD_RECOVERY (or an
  // existing session) before enabling the form. If neither arrives within a
  // short window, show a "link expired" state instead of an unusable form.
  useEffect(() => {
    let cancelled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setReady(true);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) setReady(true);
    });
    const timer = setTimeout(() => {
      if (cancelled) return;
      setReady((r) => {
        if (!r) setInvalidLink(true);
        return r;
      });
    }, 3000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    const { error } = await updatePassword(password);
    setSubmitting(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Password updated");
    void navigate({ to: "/app", replace: true });
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

          {invalidLink && !ready ? (
            <div className="mt-6 rounded-2xl border border-border bg-muted/40 p-4 text-sm text-secondary">
              <p>This reset link looks expired or already used.</p>
              <Button asChild className="mt-3" variant="festive" size="sm">
                <Link to="/auth">Request a new link</Link>
              </Button>
            </div>
          ) : !ready ? (
            <p className="mt-6 text-sm text-muted-foreground">Verifying reset link…</p>
          ) : (
            <form onSubmit={onSubmit} className="mt-6 grid gap-4">
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
                />
              </div>
              <Button type="submit" variant="festive" disabled={submitting}>
                {submitting ? "Please wait…" : "Update password"}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
