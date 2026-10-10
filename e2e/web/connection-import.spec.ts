import { expect, test } from '@playwright/test';

const CONFIG = [
  'Host lexbox',
  '  HostName 100.101.102.103',
  '  User lexde',
  '',
  'Host pi',
  '  Port 2222',
  '',
  'Host prod',
  '  ProxyJump bastion',
  '',
  'Host *',
  '  ServerAliveInterval 30',
].join('\n');

test('adds the hosts in a pasted SSH config, in the group it was started from', async ({
  page,
}) => {
  await page.goto('/');
  // Groups come once there's a connection.
  await page.getByRole('button', { name: 'New connection' }).click();
  await page.getByRole('radio', { name: 'ttyd' }).click();
  await page.getByLabel('Address').fill('laptop:7681');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'New group' }).click();
  await page.getByLabel('Name').fill('Home lab');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('tab', { name: 'Home lab' }).click();

  await page.getByRole('button', { name: 'New connection' }).click();
  await page.getByRole('button', { name: 'Import from SSH config' }).click();
  await page.getByLabel('Paste it').fill(CONFIG);

  await expect(page.getByText('Hosts · 3')).toBeVisible();
  await expect(page.getByRole('switch', { name: 'prod' })).not.toBeChecked();
  // The connection form is still underneath, with its own Username.
  await page.getByPlaceholder('Your username on those computers').fill('pi');
  await page.getByRole('button', { name: 'Add 2 connections' }).click();

  await expect(page.getByRole('button', { name: 'Open lexbox' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open pi' })).toBeVisible();
  await expect(page.getByText('pi@pi:2222')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Home lab' })).toHaveAttribute(
    'aria-selected',
    'true'
  );
});

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme });

    test('renders the import screen', async ({ page }, testInfo) => {
      await page.goto('/connections/new');
      await expect(page.getByRole('button', { name: 'Import from SSH config' })).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`connection-form-import-${colorScheme}.png`),
      });
      await page.getByRole('button', { name: 'Import from SSH config' }).click();
      await page.getByLabel('Paste it').fill(`${CONFIG}\nHost orb\n  HostName 127.0.0.1`);
      await expect(page.getByText('Hosts · 4')).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`connection-import-${colorScheme}.png`),
        fullPage: true,
      });
    });
  });
}
