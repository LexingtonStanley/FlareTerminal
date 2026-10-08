import type { Page, Route } from '@playwright/test';

/**
 * The e2e web build points at this URL (see playwright.config.ts). Nothing listens
 * there: mockSupabaseAuth answers the auth requests inside the browser, so the real
 * supabase-js client, session storage and navigation are exercised without a backend.
 */
export const E2E_SUPABASE_URL = 'https://e2e.supabase.test';
export const E2E_SUPABASE_KEY = 'sb_publishable_e2e';

/** Any password signs in except this one, which gets Supabase's invalid-credentials error. */
export const WRONG_PASSWORD = 'wrong-password';

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

function base64url(value: object) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sessionFor(email: string) {
  const now = Math.floor(Date.now() / 1000);
  const user = {
    id: '00000000-0000-4000-8000-000000000001',
    aud: 'authenticated',
    role: 'authenticated',
    email,
    app_metadata: { provider: 'email' },
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  // Unsigned but well-formed: supabase-js decodes the payload, it doesn't verify it.
  const accessToken = [
    base64url({ alg: 'HS256', typ: 'JWT' }),
    base64url({
      sub: user.id,
      email,
      role: 'authenticated',
      aud: 'authenticated',
      exp: now + 3600,
    }),
    'signature',
  ].join('.');

  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: 'e2e-refresh-token',
    user,
  };
}

async function handle(route: Route) {
  const request = route.request();
  const url = new URL(request.url());
  const reply = (status: number, json?: object) =>
    route.fulfill({ status, headers: CORS_HEADERS, json });

  if (request.method() === 'OPTIONS') return reply(204);

  if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
    const { email, password } = request.postDataJSON();
    if (password === WRONG_PASSWORD) {
      return reply(400, {
        code: 400,
        error_code: 'invalid_credentials',
        msg: 'Invalid login credentials',
      });
    }
    return reply(200, sessionFor(email));
  }

  if (url.pathname === '/auth/v1/logout') return reply(204);

  return reply(501, { msg: `fake-supabase: no handler for ${request.method()} ${url.pathname}` });
}

export async function mockSupabaseAuth(page: Page) {
  await page.route(`${E2E_SUPABASE_URL}/**`, handle);
}
