import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

import { E2E_SUPABASE_KEY, E2E_SUPABASE_URL } from './e2e/web/fake-supabase';

const PORT = Number(process.env.E2E_PORT ?? 8090);

// Cloud agent containers (e.g. Claude Code on the web) ship a Chromium build at
// this path that may come from an older Playwright release than the one installed
// here. Use it when present so tests run without `npx playwright install`.
// PLAYWRIGHT_CHROMIUM_PATH overrides; elsewhere (CI, laptops) Playwright's own
// browser is used.
const PREINSTALLED_CHROMIUM = '/opt/pw-browsers/chromium';
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  (existsSync(PREINSTALLED_CHROMIUM) ? PREINSTALLED_CHROMIUM : undefined);

export default defineConfig({
  testDir: './e2e/web',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'], launchOptions: { executablePath } },
    },
  ],
  webServer: {
    // Builds the production web bundle, then serves it with a SPA fallback.
    command: `npm run web:build && node scripts/serve-web.mjs --port ${PORT}`,
    env: {
      // Build against the fake backend in e2e/web/fake-supabase.ts, and keep a
      // developer's .env.local out of the test build.
      EXPO_NO_DOTENV: '1',
      EXPO_PUBLIC_SUPABASE_URL: E2E_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: E2E_SUPABASE_KEY,
    },
    url: `http://localhost:${PORT}`,
    // Never reuse a running server: it could be serving a stale build.
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
