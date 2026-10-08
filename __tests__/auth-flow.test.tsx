import { userEvent } from '@testing-library/react-native';
import { screen } from 'expo-router/testing-library';

import { getSupabase } from '@/lib/supabase';
import { createFakeSupabase, fakeSession } from '@/test-utils/fake-auth';
import { renderApp } from '@/test-utils/render-app';

jest.mock('@/lib/supabase', () => ({ getSupabase: jest.fn() }));

async function signIn(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.press(screen.getByRole('button', { name: 'Sign in' }));
}

describe('auth flow', () => {
  it('sends signed-out users to sign-in, even from a deep link', async () => {
    jest.mocked(getSupabase).mockReturnValue(createFakeSupabase());
    const app = await renderApp('/settings');

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeOnTheScreen();
    expect(app).toHavePathname('/sign-in');
  });

  it('validates before calling the backend', async () => {
    const supabase = createFakeSupabase();
    jest.mocked(getSupabase).mockReturnValue(supabase);
    await renderApp('/');

    await userEvent.setup().press(await screen.findByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter your email')).toBeOnTheScreen();
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('shows backend errors', async () => {
    jest.mocked(getSupabase).mockReturnValue(createFakeSupabase());
    const app = await renderApp('/');

    await signIn('ada@example.com', 'wrong-password');

    expect(await screen.findByText('Invalid login credentials')).toBeOnTheScreen();
    expect(app).toHavePathname('/sign-in');
  });

  it('signs in and opens the app', async () => {
    jest.mocked(getSupabase).mockReturnValue(createFakeSupabase());
    const app = await renderApp('/');

    await signIn('ada@example.com', 'correct-horse');

    expect(await screen.findByText('Signed in as ada@example.com')).toBeOnTheScreen();
    expect(app).toHavePathname('/');
  });

  it('restores a stored session, then signs out', async () => {
    const supabase = createFakeSupabase({ session: fakeSession('ada@example.com') });
    jest.mocked(getSupabase).mockReturnValue(supabase);
    await renderApp('/settings');

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeOnTheScreen();
    await userEvent.setup().press(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeOnTheScreen();
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('explains when the backend is not configured', async () => {
    jest.mocked(getSupabase).mockReturnValue(null);
    await renderApp('/');

    expect(await screen.findByText('Backend not configured')).toBeOnTheScreen();
  });
});
