import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { normalizeAuthReturnTo } from "@/lib/auth-redirect";
import { isRecoveryRedirect } from "@/lib/auth-recovery";

export type SignUpResult = {
  error: string | null;
  /** Non-null only when confirmation is disabled and Supabase returned a session. */
  session: Session | null;
  /** True when Supabase created the user but no session — i.e. must confirm email. */
  needsConfirmation: boolean;
};

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** True only after a recovery redirect marker or PASSWORD_RECOVERY event. */
  recoveryReady: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, returnTo?: string) => Promise<SignUpResult>;
  /**
   * Resend the signup confirmation email. Never re-invokes signUp and never
   * requires the password. Uses Supabase's dedicated resend API.
   */
  resendSignupConfirmation: (email: string, returnTo?: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPasswordForEmail: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
};

const Ctx = createContext<AuthCtx | null>(null);

function originOrUndefined(): string | undefined {
  return typeof window !== "undefined" ? window.location.origin : undefined;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryReady, setRecoveryReady] = useState(
    () =>
      typeof window !== "undefined" &&
      isRecoveryRedirect(window.location.search, window.location.hash),
  );

  useEffect(() => {
    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!active) return;
      setSession(s);
      setLoading(false);
      if (event === "PASSWORD_RECOVERY") setRecoveryReady(true);
      if (event === "SIGNED_OUT") setRecoveryReady(false);
    });
    const timeout = window.setTimeout(() => {
      if (active) setLoading(false);
    }, 8_000);
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session);
      })
      .catch(() => {
        // Let signed-out/demo surfaces recover instead of hanging forever.
      })
      .finally(() => {
        if (!active) return;
        window.clearTimeout(timeout);
        setLoading(false);
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      recoveryReady,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },
      signUp: async (email, password, returnTo) => {
        const origin = originOrUndefined();
        const emailRedirectTo = origin
          ? new URL(normalizeAuthReturnTo(returnTo), origin).toString()
          : undefined;
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo },
        });
        if (error) {
          return { error: error.message, session: null, needsConfirmation: false };
        }
        // When email confirmation is disabled, Supabase returns a session and
        // the caller can navigate to /app immediately. When confirmation is
        // required, session is null and the caller must show a confirm state.
        const s = data.session ?? null;
        return { error: null, session: s, needsConfirmation: !s };
      },
      resendSignupConfirmation: async (email, returnTo) => {
        const origin = originOrUndefined();
        const emailRedirectTo = origin
          ? new URL(normalizeAuthReturnTo(returnTo), origin).toString()
          : undefined;
        const { error } = await supabase.auth.resend({
          type: "signup",
          email,
          options: emailRedirectTo ? { emailRedirectTo } : undefined,
        });
        return { error: error?.message ?? null };
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
      resetPasswordForEmail: async (email) => {
        const origin = originOrUndefined();
        const redirectTo = origin ? `${origin}/reset-password` : undefined;
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo,
        });
        return { error: error?.message ?? null };
      },
      updatePassword: async (password) => {
        const { error } = await supabase.auth.updateUser({ password });
        return { error: error?.message ?? null };
      },
    }),
    [session, loading, recoveryReady],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
