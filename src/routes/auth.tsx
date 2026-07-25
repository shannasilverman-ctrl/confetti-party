import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

type AuthMode = "signin" | "signup" | "forgot";
type AuthSearch = { mode?: AuthMode };

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  validateSearch: (s: Record<string, unknown>): AuthSearch => ({
    mode:
      s.mode === "signup"
        ? "signup"
        : s.mode === "signin"
          ? "signin"
          : s.mode === "forgot"
            ? "forgot"
            : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in · Confetti" },
      { name: "description", content: "Sign in or create your Confetti account to save parties." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 2) return `${local[0] ?? ""}…@${domain}`;
  return `${local.slice(0, 2)}…@${domain}`;
}

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const {
    user,
    signIn,
    signUp,
    resetPasswordForEmail,
    resendSignupConfirmation,
    loading: authLoading,
  } = useAuth();
  const [mode, setMode] = useState<AuthMode>(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<{ kind: "confirm" | "reset"; email: string } | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (!authLoading && user) {
      void navigate({ to: "/app", replace: true });
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  async function submitSignIn() {
    const { error } = await signIn(email, password);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Welcome back");
    void navigate({ to: "/app", replace: true });
  }

  async function submitSignUp() {
    const result = await signUp(email, password);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    // Clear the password from state as soon as signUp resolves. Resends must
    // never reuse it.
    setPassword("");
    if (result.session) {
      // Confirmation is disabled — Supabase returned an active session.
      // Navigate straight into the app.
      toast.success("Welcome to Confetti");
      void navigate({ to: "/app", replace: true });
      return;
    }
    // Confirmation required — show the persistent confirm-email state.
    setSentTo({ kind: "confirm", email });
    setResendCooldown(60);
  }

  async function submitForgot() {
    const { error } = await resetPasswordForEmail(email);
    if (error) {
      toast.error(error);
      return;
    }
    setSentTo({ kind: "reset", email });
    setResendCooldown(60);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    if (mode !== "forgot" && !password) return;
    setSubmitting(true);
    try {
      if (mode === "signup") await submitSignUp();
      else if (mode === "forgot") await submitForgot();
      else await submitSignIn();
    } finally {
      setSubmitting(false);
    }
  }

  async function resend() {
    if (!sentTo || resendCooldown > 0) return;
    setSubmitting(true);
    try {
      const { error } =
        sentTo.kind === "reset"
          ? await resetPasswordForEmail(sentTo.email)
          : await resendSignupConfirmation(sentTo.email);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Sent again");
      setResendCooldown(60);
    } finally {
      setSubmitting(false);
    }
  }

  const title =
    mode === "signup"
      ? "Create your account"
      : mode === "forgot"
        ? "Reset your password"
        : "Welcome back";
  const submitLabel =
    mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in";

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
          {sentTo ? (
            <>
              <h1 className="font-display text-2xl font-semibold text-secondary">
                {sentTo.kind === "reset" ? "Check your email" : "Confirm your email"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {sentTo.kind === "reset"
                  ? `We sent a password reset link to ${maskEmail(sentTo.email)}.`
                  : `We sent a confirmation link to ${maskEmail(sentTo.email)}. Click it to activate your account.`}
              </p>
              <div className="mt-6 flex flex-col gap-2">
                <Button
                  variant="outline"
                  disabled={resendCooldown > 0 || submitting}
                  onClick={resend}
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend email"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSentTo(null);
                    setMode("signin");
                  }}
                >
                  Back to sign in
                </Button>
              </div>
            </>
          ) : (
            <>
              <h1 className="font-display text-2xl font-semibold text-secondary">{title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "signup"
                  ? "Save your parties and pick up where you left off."
                  : mode === "forgot"
                    ? "Enter the email you signed up with. We'll send a reset link."
                    : "Sign in to your parties."}
              </p>

              <form onSubmit={onSubmit} className="mt-6 grid gap-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                {mode !== "forgot" && (
                  <div>
                    <div className="flex items-baseline justify-between">
                      <Label htmlFor="password">Password</Label>
                      {mode === "signin" && (
                        <button
                          type="button"
                          className="text-xs font-medium text-primary hover:underline"
                          onClick={() => setMode("forgot")}
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <Input
                      id="password"
                      type="password"
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      required
                      minLength={mode === "signup" ? 8 : 6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                )}
                <Button type="submit" variant="festive" disabled={submitting}>
                  {submitting ? "Please wait…" : submitLabel}
                </Button>
              </form>

              <div className="mt-6 text-center text-sm text-muted-foreground">
                {mode === "signup" ? (
                  <>
                    Already have an account?{" "}
                    <button
                      type="button"
                      className="font-medium text-primary hover:underline"
                      onClick={() => setMode("signin")}
                    >
                      Sign in
                    </button>
                  </>
                ) : mode === "forgot" ? (
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => setMode("signin")}
                  >
                    Back to sign in
                  </button>
                ) : (
                  <>
                    New to Confetti?{" "}
                    <button
                      type="button"
                      className="font-medium text-primary hover:underline"
                      onClick={() => setMode("signup")}
                    >
                      Create an account
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing you agree to our{" "}
          <Link to="/terms" className="underline hover:text-secondary">
            Terms
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="underline hover:text-secondary">
            Privacy
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
