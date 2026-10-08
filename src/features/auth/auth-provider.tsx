import type { Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react';

import type { Credentials } from '@/features/auth/validation';
import { getSupabase } from '@/lib/supabase';

export type AuthResult = {
  error: string | null;
  /** True after sign-up when the project requires email confirmation before a session exists. */
  needsConfirmation?: boolean;
};

type AuthContextValue = {
  session: Session | null;
  /** True until the stored session has been read; keep the splash screen up meanwhile. */
  isLoading: boolean;
  /** False when the Supabase environment variables are missing. */
  isConfigured: boolean;
  signIn: (credentials: Credentials) => Promise<AuthResult>;
  signUp: (credentials: Credentials) => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
};

export const NOT_CONFIGURED_MESSAGE =
  'Backend not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example).';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [auth] = useState(() => getSupabase()?.auth ?? null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(auth !== null);

  useEffect(() => {
    if (!auth) return;
    let active = true;

    auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    const { data } = auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [auth]);

  const value: AuthContextValue = {
    session,
    isLoading,
    isConfigured: auth !== null,
    async signIn({ email, password }) {
      if (!auth) return { error: NOT_CONFIGURED_MESSAGE };
      const { error } = await auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },
    async signUp({ email, password }) {
      if (!auth) return { error: NOT_CONFIGURED_MESSAGE };
      const { data, error } = await auth.signUp({ email, password });
      if (error) return { error: error.message };
      return { error: null, needsConfirmation: !data.session };
    },
    async signOut() {
      if (!auth) return { error: NOT_CONFIGURED_MESSAGE };
      const { error } = await auth.signOut();
      return { error: error?.message ?? null };
    },
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
