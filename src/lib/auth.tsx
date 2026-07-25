import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { normalizeAuthReturnTo } from "@/lib/auth-redirect";
import { friendlyAuthError, type AuthErrorKind, type FriendlyAuthError } from "@/lib/friendly-auth-error";

export type AuthOpResult = { error: FriendlyAuthError | null };

export type SignUpResult = AuthOpResult & {
  /** Non-null only when confirmation is disabled and Supabase returned a session. */
  session: Session | null;
  /** True when Supabase created the user but no session — i.e. must confirm email. */
  needsConfirmation: boolean;
};

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthOpResult>;
  signUp: (email: string, password: string, returnTo?: string) => Promise<SignUpResult>;
  resendSignupConfirmation: (email: string) => Promise<AuthOpResult>;
  signOut: () => Promise<void>;
  resetPasswordForEmail: (email: string, returnTo?: string) => Promise<AuthOpResult>;
  updatePassword: (password: string) => Promise<AuthOpResult>;
};

const Ctx = createContext<AuthCtx | null>(null);

function originOrUndefined(): string | undefined {
  return typeof window !== "undefined" ? window.location.origin : undefined;
}

function buildResetRedirect(returnTo?: string): string | undefined {
  const origin = originOrUndefined();
  if (!origin) return undefined;
  const safe = normalizeAuthReturnTo(returnTo);
  const url = new URL("/reset-password", origin);
  if (safe && safe !== "/app") url.searchParams.set("returnTo", safe);
  return url.toString();
}

async function safeCall<T>(fn: () => Promise<T>, fallback: AuthErrorKind = "unknown"): Promise<{ data: T | null; error: FriendlyAuthError | null }> {
  try {
    const data = await fn();
    return { data, error: null };
  } catch (e) {
    return { data: null, error: friendlyAuthError(e, fallback) };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      signIn: async (email, password) => {
        const { data, error } = await safeCall(
          () => supabase.auth.signInWithPassword({ email, password }),
          "invalid_credentials",
        );
        if (error) return { error };
        if (data?.error) return { error: friendlyAuthError(data.error, "invalid_credentials") };
        return { error: null };
      },
      signUp: async (email, password, returnTo) => {
        const origin = originOrUndefined();
        const emailRedirectTo = origin
          ? new URL(normalizeAuthReturnTo(returnTo), origin).toString()
          : undefined;
        const { data, error } = await safeCall(
          () =>
            supabase.auth.signUp({
              email,
              password,
              options: { emailRedirectTo },
            }),
          "unknown",
        );
        if (error) return { error, session: null, needsConfirmation: false };
        if (data?.error) {
          return { error: friendlyAuthError(data.error, "email_taken"), session: null, needsConfirmation: false };
        }
        const s = data?.data.session ?? null;
        return { error: null, session: s, needsConfirmation: !s };
      },
      resendSignupConfirmation: async (email) => {
        const origin = originOrUndefined();
        const emailRedirectTo = origin ? `${origin}/app` : undefined;
        const { data, error } = await safeCall(
          () =>
            supabase.auth.resend({
              type: "signup",
              email,
              options: emailRedirectTo ? { emailRedirectTo } : undefined,
            }),
          "rate_limited",
        );
        if (error) return { error };
        if (data?.error) return { error: friendlyAuthError(data.error, "rate_limited") };
        return { error: null };
      },
      signOut: async () => {
        try {
          await supabase.auth.signOut();
        } catch {
          // best-effort; local session is cleared regardless
        }
      },
      resetPasswordForEmail: async (email, returnTo) => {
        const redirectTo = buildResetRedirect(returnTo);
        const { data, error } = await safeCall(
          () => supabase.auth.resetPasswordForEmail(email, { redirectTo }),
          "rate_limited",
        );
        if (error) return { error };
        if (data?.error) return { error: friendlyAuthError(data.error, "rate_limited") };
        return { error: null };
      },
      updatePassword: async (password) => {
        const { data, error } = await safeCall(
          () => supabase.auth.updateUser({ password }),
          "weak_password",
        );
        if (error) return { error };
        if (data?.error) return { error: friendlyAuthError(data.error, "weak_password") };
        return { error: null };
      },
    }),
    [session, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
