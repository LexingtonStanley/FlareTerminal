import { expect, test, type Page } from '@playwright/test';

import { mockSupabaseAuth, WRONG_PASSWORD } from './fake-supabase';

test.beforeEach(async ({ page }) => {
  await mockSupabaseAuth(page);
});

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('signed-out deep links land on sign-in', async ({ page }) => {
  await page.goto('/settings');

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('validates the form before calling the backend', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(page.getByText('Enter your email')).toBeVisible();
  await expect(page.getByText('Enter your password')).toBeVisible();
});

test('shows backend errors', async ({ page }) => {
  await page.goto('/');
  await signIn(page, 'ada@example.com', WRONG_PASSWORD);

  await expect(page.getByText('Invalid login credentials')).toBeVisible();
});

test('signs in, keeps the session across reloads, and signs out', async ({ page }) => {
  await page.goto('/');
  await signIn(page, 'ada@example.com', 'correct-horse');
  await expect(page.getByText('Signed in as ada@example.com')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Signed in as ada@example.com')).toBeVisible();

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('unknown routes show not found', async ({ page }) => {
  await page.goto('/does-not-exist');

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});
