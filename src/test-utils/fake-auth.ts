import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

import type { AppSupabaseClient } from '@/lib/supabase';

type Listener = (event: AuthChangeEvent, session: Session | null) => void;

export function fakeSession(email: string): Session {
  return {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: 'user-1',
      email,
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-01-01T00:00:00Z',
    },
  };
}

/**
 * In-memory stand-in for `supabase.auth`. Sign-in succeeds for any password
 * except "wrong-password". Use with:
 *
 *   jest.mock('@/lib/supabase', () => ({ getSupabase: jest.fn() }));
 *   jest.mocked(getSupabase).mockReturnValue(createFakeSupabase());
 */
export function createFakeSupabase({ session = null }: { session?: Session | null } = {}) {
  let current = session;
  const listeners = new Set<Listener>();
  const emit = (event: AuthChangeEvent, next: Session | null) => {
    current = next;
    listeners.forEach((listener) => listener(event, next));
  };

  const auth = {
    getSession: jest.fn(async () => ({ data: { session: current }, error: null })),
    onAuthStateChange: jest.fn((listener: Listener) => {
      listeners.add(listener);
      return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
    }),
    signInWithPassword: jest.fn(
      async ({ email, password }: { email: string; password: string }) => {
        if (password === 'wrong-password') {
          return {
            data: { session: null, user: null },
            error: { message: 'Invalid login credentials' },
          };
        }
        const next = fakeSession(email);
        emit('SIGNED_IN', next);
        return { data: { session: next, user: next.user }, error: null };
      }
    ),
    signUp: jest.fn(async () => ({ data: { session: null, user: null }, error: null })),
    signOut: jest.fn(async () => {
      emit('SIGNED_OUT', null);
      return { error: null };
    }),
  };

  return { auth } as unknown as AppSupabaseClient & { auth: typeof auth };
}
