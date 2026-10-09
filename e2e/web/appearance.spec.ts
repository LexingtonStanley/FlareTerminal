import { expect, test, type Locator } from '@playwright/test';

import { APP_THEMES, appTheme } from '../../src/constants/app-themes';

const style = (locator: Locator, property: 'color' | 'fontFamily' | 'textTransform') =>
  locator.evaluate((element, name) => getComputedStyle(element)[name], property);

/** #rrggbb as the rgb() a browser computes. */
const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)).join(', ')})`;

test.use({ colorScheme: 'light' });

test('a theme restyles the app, and light or dark can be set apart from the phone', async ({
  page,
}) => {
  await page.goto('/settings');
  const heading = page.getByRole('heading', { name: 'Settings' });
  await expect(page.getByRole('radio', { name: 'Flare' })).toBeChecked();
  expect(await style(heading, 'color')).toBe(rgb(appTheme('flare', 'light').colors.text));

  await page.getByRole('radio', { name: 'Concrete' }).click();
  await expect(page.getByRole('radio', { name: 'Concrete' })).toBeChecked();
  expect(await style(heading, 'fontFamily')).toContain('IBMPlexMono-Bold');
  expect(await style(heading, 'textTransform')).toBe('uppercase');

  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect
    .poll(() => style(heading, 'color'))
    .toBe(rgb(appTheme('concrete', 'dark').colors.text));

  // Both are remembered.
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Concrete' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
  expect(await style(heading, 'color')).toBe(rgb(appTheme('concrete', 'dark').colors.text));
});

for (const theme of APP_THEMES) {
  test(`renders ${theme.name} in light and dark: settings, home and the keyboard`, async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New connection' }).click();
    await page.getByRole('radio', { name: 'ttyd' }).click();
    await page.getByLabel('Name').fill('Devbox');
    await page.getByLabel('Address').fill('devbox:7681');
    await page.getByRole('button', { name: 'Save' }).click();

    for (const mode of ['Light', 'Dark'] as const) {
      const shot = (name: string) =>
        page.screenshot({ path: testInfo.outputPath(`${name}-${theme.id}-${mode}.png`) });
      await page.goto('/settings');
      await page.getByRole('radio', { name: theme.name }).click();
      await page.getByRole('radio', { name: mode }).click();
      await shot('settings');
      await page.getByRole('tab', { name: 'Home' }).click();
      await expect(page.getByRole('button', { name: 'Open Devbox' })).toBeVisible();
      await shot('home');
      await page.goto('/keyboard-preview');
      await expect(page.locator('.xterm-rows')).toContainText('~/flare $');
      await page.getByRole('button', { name: 'Coding keyboard', exact: true }).click();
      await page.getByRole('switch', { name: 'Control' }).click();
      await shot('keyboard');
    }
  });
}
