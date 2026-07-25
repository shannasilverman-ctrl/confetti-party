import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { BrandLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { normalizeAuthReturnTo } from "@/lib/auth-redirect";

type AuthMode = "signin" | "signup" | "forgot";
type AuthSearch = { mode?: AuthMode; returnTo?: string };

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
    returnTo: typeof s.returnTo === "string" ? normalizeAuthReturnTo(s.returnTo) : undefined,
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

/** Normalize email: trim + lowercase. Preserves the raw input for typing. */
function normalizeEmailForSubmit(v: string): string {
  return v.trim().toLowerCase();
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
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<{ kind: "confirm" | "reset"; email: string } | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const submitLockRef = useRef(false);
  const returnTo = normalizeAuthReturnTo(search.returnTo);

  useEffect(() => {
    if (!authLoading && user) {
      window.location.replace(returnTo);
    }
  }, [user, authLoading, returnTo]);

  useEffect(() => {
    setMode(search.mode ?? "signin");
    setInlineError(null);
    setPassword("");
    setShowPassword(false);
  }, [search.mode]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  async function submitSignIn(normalizedEmail: string) {
    const { error } = await signIn(normalizedEmail, password);
    if (error) {
      setInlineError(error.message);
      setPassword("");
      return;
    }
    window.location.replace(returnTo);
  }

  async function submitSignUp(normalizedEmail: string) {
    const result = await signUp(normalizedEmail, password, returnTo);
    if (result.error) {
      setInlineError(result.error.message);
      setPassword("");
      return;
    }
    setPassword("");
    if (result.session) {
      window.location.replace(returnTo);
      return;
    }
    setSentTo({ kind: "confirm", email: normalizedEmail });
    setResendCooldown(60);
  }

  async function submitForgot(normalizedEmail: string) {
    const { error } = await resetPasswordForEmail(normalizedEmail, returnTo);
    // Non-enumerating: show the same confirmation whether or not the address
    // exists. Only surface an inline error on transport/rate-limit failures.
    if (error && error.kind === "network") {
      setInlineError(error.message);
      return;
    }
    if (error && error.kind === "rate_limited") {
      setInlineError(error.message);
      return;
    }
    setSentTo({ kind: "reset", email: normalizedEmail });
    setResendCooldown(60);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitLockRef.current) return;
    const normalizedEmail = normalizeEmailForSubmit(email);
    if (!normalizedEmail) return;
    if (mode !== "forgot" && !password) return;
    submitLockRef.current = true;
    setSubmitting(true);
    setInlineError(null);
    setInlineNotice(null);
    try {
      if (mode === "signup") await submitSignUp(normalizedEmail);
      else if (mode === "forgot") await submitForgot(normalizedEmail);
      else await submitSignIn(normalizedEmail);
    } catch {
      setInlineError("Couldn't reach the sign-in service. Check your connection and try again.");
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }

  async function resend() {
    if (!sentTo || resendCooldown > 0 || submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    setInlineError(null);
    setInlineNotice(null);
    try {
      const { error } =
        sentTo.kind === "reset"
          ? await resetPasswordForEmail(sentTo.email, returnTo)
          : await resendSignupConfirmation(sentTo.email);
      if (error) {
        setInlineError(error.message);
        return;
      }
      setInlineNotice("Sent again. Check your inbox.");
      setResendCooldown(60);
    } finally {
      submitLockRef.current = false;
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

  function changeMode(next: AuthMode) {
    setSentTo(null);
    setInlineError(null);
    setInlineNotice(null);
    setPassword("");
    setShowPassword(false);
    setMode(next);
    void navigate({
      to: "/auth",
      search: { mode: next, returnTo },
      replace: false,
    });
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
          {sentTo ? (
            <>
              <h1 className="font-display text-2xl font-semibold text-secondary">
                {sentTo.kind === "reset" ? "Check your email" : "Confirm your email"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {sentTo.kind === "reset"
                  ? `If an account exists for ${maskEmail(sentTo.email)}, we sent a password reset link.`
                  : `We sent a confirmation link to ${maskEmail(sentTo.email)}. Click it to activate your account.`}
              </p>
              <div
                role="status"
                aria-live="polite"
                className="min-h-[1.25rem] text-sm"
              >
                {inlineError ? (
                  <span className="text-destructive">{inlineError}</span>
                ) : inlineNotice ? (
                  <span className="text-secondary">{inlineNotice}</span>
                ) : null}
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="min-h-11"
                  disabled={resendCooldown > 0 || submitting}
                  onClick={resend}
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend email"}
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-11"
                  onClick={() => {
                    setSentTo(null);
                    changeMode("signin");
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

              <form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="min-h-11"
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
                          onClick={() => changeMode("forgot")}
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete={mode === "signup" ? "new-password" : "current-password"}
                        required
                        minLength={mode === "signup" ? 8 : 6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="min-h-11 pr-11"
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-2 top-1/2 flex h-9 min-h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-secondary focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden />
                        )}
                      </button>
                    </div>
                  </div>
                )}
                <div
                  role="alert"
                  aria-live="assertive"
                  className="min-h-[1.25rem] text-sm text-destructive"
                >
                  {inlineError}
                </div>
                <Button
                  type="submit"
                  variant="festive"
                  className="min-h-11"
                  disabled={submitting}
                >
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
                      onClick={() => changeMode("signin")}
                    >
                      Sign in
                    </button>
                  </>
                ) : mode === "forgot" ? (
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => changeMode("signin")}
                  >
                    Back to sign in
                  </button>
                ) : (
                  <>
                    New to Confetti?{" "}
                    <button
                      type="button"
                      className="font-medium text-primary hover:underline"
                      onClick={() => changeMode("signup")}
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
