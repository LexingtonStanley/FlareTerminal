import { expect, test, type Page } from '@playwright/test';

import { FAKE_TTYD_ADDRESS, fakeTtyd } from './fake-ttyd';

/** Saves a ttyd connection and a Claude Code shortcut on it, runs it, and opens the composer. */
async function writeToAgent(page: Page) {
  const ttyd = await fakeTtyd(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'New connection' }).click();
  await page.getByRole('radio', { name: 'ttyd' }).click();
  await page.getByLabel('Name').fill('Devbox');
  await page.getByLabel('Address').fill(FAKE_TTYD_ADDRESS);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'New shortcut' }).click();
  await page.getByLabel('Name').fill('Janus');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Run Janus' }).click();
  const session = await ttyd.session(0);
  await expect(page.getByLabel('Status: Connected')).toBeVisible();
  await expect.poll(() => session.inputs.length).toBe(1);
  session.inputs.splice(0);

  // A flick up on the hide key: the phone's keyboard, in a text field.
  const box = (await page.getByRole('button', { name: 'Hide keyboard' }).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 30, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByLabel('Command')).toBeFocused();
  return session;
}

test('a slash command chip fills the field, ready for arguments', async ({ page }) => {
  const session = await writeToAgent(page);
  const field = page.getByLabel('Command');

  await page.getByRole('button', { name: /^\/compact, / }).click();

  await expect(field).toHaveValue('/compact');
  // Focus stays in the field, so the phone's keyboard stays up.
  await expect(field).toBeFocused();
  await expect(page.getByText('Summarize to free up context')).toBeVisible();
  await page.keyboard.type(' keep the test plan');
  await field.press('Enter');

  await expect
    .poll(() => session.inputs)
    .toEqual(['\x1b[200~/compact keep the test plan\x1b[201~', '\r']);
});

test('saves a prompt, which comes back as a chip and in Settings', async ({ page }) => {
  await writeToAgent(page);
  const field = page.getByLabel('Command');

  await field.fill('Run the tests and fix what fails');
  await page.getByRole('button', { name: 'Save as prompt' }).click();
  await expect(page.getByText('Saved in your prompts')).toBeVisible();
  await field.fill('');
  await expect(
    page.getByRole('button', { name: 'Run the tests and fix what fails' })
  ).toBeVisible();

  await page.goto('/settings');
  await expect(page.getByText('Run the tests and fix what fails')).toBeVisible();
});

test('the strip keeps its height, so the terminal never resizes as the person writes', async ({
  page,
}) => {
  await writeToAgent(page);
  const field = page.getByLabel('Command');
  const keys = page.getByRole('toolbar', { name: 'Terminal keys' });
  const top = async () => (await keys.boundingBox())!.y;
  const withChips = await top();

  // A command written out: its description instead of chips.
  await field.fill('/compact');
  await expect(page.getByText('Summarize to free up context')).toBeVisible();
  expect(await top()).toBe(withChips);

  // Prose: the save chip.
  await field.fill('Deploy it');
  await expect(page.getByRole('button', { name: 'Save as prompt' })).toBeVisible();
  expect(await top()).toBe(withChips);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme });

    test('renders the strip', async ({ page }, testInfo) => {
      const session = await writeToAgent(page);
      session.output('\x1b[1m> \x1b[0mfix the failing test\r\n\r\n⏺ Done. All 12 tests pass.\r\n');
      await page.getByLabel('Command').fill('Run');
      await page.getByRole('button', { name: 'Save as prompt' }).click();
      await page.getByLabel('Command').fill('');
      await page.screenshot({ path: testInfo.outputPath(`prompts-${colorScheme}.png`) });
      await page.getByLabel('Command').fill('/c');
      await page.screenshot({ path: testInfo.outputPath(`prompts-slash-${colorScheme}.png`) });
    });
  });
}
