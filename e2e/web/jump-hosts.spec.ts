import { expect, test, type Page } from '@playwright/test';

async function saveSsh(page: Page, host: string, name?: string) {
  await page.getByRole('button', { name: 'New connection' }).click();
  await page.getByLabel('Host', { exact: true }).fill(host);
  if (name) await page.getByLabel('Name', { exact: true }).fill(name);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme });

    test('saves a connection that goes through a jump host', async ({ page }, testInfo) => {
      await page.goto('/');
      await saveSsh(page, 'ec2-user@bastion.example.com', 'Bastion');
      await page.getByRole('button', { name: 'Save' }).click();

      await saveSsh(page, 'deploy@10.0.1.5', 'Prod DB');
      await page.getByRole('radio', { name: 'Bastion' }).click();
      await expect(
        page.getByText('Connects to Bastion first, then from there to the host above, like ssh -J')
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`connection-form-jump-host-${colorScheme}.png`),
        fullPage: true,
      });
      await page.getByRole('button', { name: 'Save' }).click();

      await expect(page.getByText('deploy@10.0.1.5 · via Bastion')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`home-jump-host-${colorScheme}.png`) });
    });
  });
}
