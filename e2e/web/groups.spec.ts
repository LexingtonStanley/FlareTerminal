import { expect, test, type Page } from '@playwright/test';

/** Saves a ttyd connection, in the group whose tab is selected on Home. */
async function addConnection(page: Page, name: string, address: string) {
  await page.getByRole('button', { name: 'New connection' }).click();
  await page.getByRole('radio', { name: 'ttyd' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Address').fill(address);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: `Open ${name}` })).toBeVisible();
}

test('groups narrow Home to their connections', async ({ page }) => {
  await page.goto('/');
  await addConnection(page, 'Laptop', 'laptop:7681');
  await page.getByRole('button', { name: 'New group' }).click();
  await page.getByLabel('Name').fill('Work');
  await page.getByRole('button', { name: 'Save' }).click();

  await page.getByRole('tab', { name: 'Work' }).click();
  await expect(page.getByText('No connections in Work yet.', { exact: false })).toBeVisible();
  await addConnection(page, 'Build box', 'build:7681');
  await expect(page.getByRole('button', { name: 'Open Laptop' })).toBeHidden();

  await page.getByRole('tab', { name: 'All' }).click();
  await expect(page.getByRole('button', { name: 'Open Laptop' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Build box' })).toBeVisible();
});

test('the app lock explains it needs the phone apps', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'App lock' }).click();
  await expect(
    page.getByText('The app lock and the encrypted vault are in the Android')
  ).toBeVisible();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme });

    test('renders group tabs and the connection form', async ({ page }, testInfo) => {
      const shot = (name: string) =>
        page.screenshot({
          path: testInfo.outputPath(`${name}-${colorScheme}.png`),
          fullPage: true,
        });
      await page.goto('/');
      await addConnection(page, 'Laptop', 'laptop:7681');
      await page.getByRole('button', { name: 'New group' }).click();
      await page.getByLabel('Name').fill('Production');
      await shot('group-form');
      await page.getByRole('button', { name: 'Save' }).click();
      await page.getByRole('button', { name: 'New group' }).click();
      await page.getByLabel('Name').fill('Home lab');
      await page.getByRole('button', { name: 'Save' }).click();
      await page.getByRole('tab', { name: 'Production' }).click();
      await page.getByRole('button', { name: 'New connection' }).click();
      await page.getByRole('radio', { name: 'ttyd' }).click();
      await page.getByLabel('Name').fill('Prod web');
      await page.getByLabel('Address').fill('prod:7681');
      await shot('connection-form');
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByRole('button', { name: 'Open Prod web' })).toBeVisible();
      await shot('home-groups');
      await page.goto('/settings');
      await shot('settings');
    });
  });
}
