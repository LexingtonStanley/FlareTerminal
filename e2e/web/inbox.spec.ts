import { expect, test } from '@playwright/test';

import { FAKE_TTYD_ADDRESS, fakeTtyd } from './fake-ttyd';

test('lists a session by what it needs, with its last screen line', async ({ page }) => {
  const ttyd = await fakeTtyd(page);
  await page.goto('/connections/new');
  await page.getByRole('radio', { name: 'ttyd' }).click();
  await page.getByLabel('Name').fill('Devbox');
  await page.getByLabel('Address').fill(FAKE_TTYD_ADDRESS);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Open Devbox' }).click();
  const session = await ttyd.session(0);
  await expect(page.getByLabel('Status: Connected')).toBeVisible();

  await page.goBack();
  session.output('\x1b[2J\x1b[H⏺ Refactored the parser; all 41 tests pass.\r\n');
  await page.getByRole('tab', { name: 'Inbox' }).click();

  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
  await expect(page.getByText('Refactored the parser; all 41 tests pass.')).toBeVisible();

  session.output('\x1b]9;Claude needs your permission\x07');
  await expect(page.getByText('Needs you · 1')).toBeVisible();
  // Home stays mounted behind the tab, with the same message on its row.
  const row = page.getByRole('button', { name: /^Open Devbox/ });
  await expect(row.getByText('Claude needs your permission')).toBeVisible();
  await expect(page.getByRole('tab', { name: /Inbox, 1 need you/ })).toBeVisible();

  await row.click();
  await expect(page.getByLabel('Status: Connected')).toBeVisible();
});
