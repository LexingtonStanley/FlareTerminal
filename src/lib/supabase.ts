// Persists the auth session in SQLite on Android/iOS. A no-op on web, which has localStorage.
import 'expo-sqlite/localStorage/install';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { Database } from './database.types';
import { env } from './env';

export type AppSupabaseClient = SupabaseClient<Database>;

let client: AppSupabaseClient | undefined;

/**
 * Returns the shared Supabase client, or null when EXPO_PUBLIC_SUPABASE_URL or
 * EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is unset. Created on first use so tests
 * and unconfigured builds never open storage or start timers.
 *
 * Row level security is what protects your data: the publishable key is public.
 */
export function getSupabase(): AppSupabaseClient | null {
  if (!env.supabaseUrl || !env.supabasePublishableKey) return null;
  if (client) return client;

  const created = createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    auth: {
      storage: localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });

  if (Platform.OS !== 'web') {
    // Supabase recommends refreshing tokens only while the app is in the foreground.
    AppState.addEventListener('change', (state) => {
      if (state === 'active') created.auth.startAutoRefresh();
      else created.auth.stopAutoRefresh();
    });
  }

  client = created;
  return client;
}
