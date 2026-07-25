import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  /**
   * Resend the signup confirmation email. Never re-invokes signUp and never
   * requires the password. Uses Supabase's dedicated resend API.
   */
  resendSignupConfirmation: (email: string) => Promise<{ error: string | null }>;
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
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },
      signUp: async (email, password) => {
        const origin = originOrUndefined();
        const emailRedirectTo = origin ? `${origin}/app` : undefined;
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
      resendSignupConfirmation: async (email) => {
        const origin = originOrUndefined();
        const emailRedirectTo = origin ? `${origin}/app` : undefined;
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
    [session, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
