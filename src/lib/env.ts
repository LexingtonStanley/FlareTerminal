/**
 * Public runtime configuration.
 *
 * Expo inlines EXPO_PUBLIC_* variables at build time, and only when they are
 * referenced exactly as `process.env.EXPO_PUBLIC_NAME` (no destructuring, no
 * bracket access). The values ship inside the app binary, so never put secrets here.
 * Set them in .env.local for local work (see .env.example) and with `eas env:set`
 * for cloud builds.
 */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};
