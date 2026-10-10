import { expect, test } from '@playwright/test';

import { openTerminal, swipe } from './touch';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

/** Claude Code at work, as it draws on the normal screen: a prompt, a reply, a tool call. */
const AGENT = [
  ...Array.from({ length: 60 }, (_, i) => `earlier output ${i}`),
  '',
  '\x1b[48;5;237m> fix the failing test\x1b[0m',
  '',
  "\x1b[38;2;215;119;87m⏺\x1b[0m I'll run the tests first, then look at the one that fails.",
  '',
  '\x1b[32m⏺\x1b[0m \x1b[1mBash\x1b[22m(npm test)',
  '  ⎿  \x1b[32mPASS\x1b[0m src/a.test.ts',
  '     \x1b[32mPASS\x1b[0m src/b.test.ts',
  '     \x1b[31mFAIL\x1b[0m src/c.test.ts',
  '     Tests: 1 failed, 2 passed',
  '',
  '⏺ The test in c.test.ts expects the old name.',
].join('\r\n');

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme });

    test('a swipe back offers reading mode: the history as text to read and copy', async ({
      page,
    }, testInfo) => {
      const session = await openTerminal(page);
      session.output(AGENT);
      await expect(page.locator('.xterm-rows')).toContainText('expects the old name');

      await swipe(page, 200);
      await page.getByRole('button', { name: 'Open reading mode' }).click();

      await expect(page.getByText(/lines from this screen and its scrollback/)).toBeVisible();
      await expect(page.getByText('> fix the failing test')).toBeVisible();
      await expect(page.getByText(/expects the old name/)).toBeVisible();
      // The tool's output, folded to its first lines.
      await expect(page.getByText(/PASS src\/b\.test\.ts/)).toBeVisible();
      await expect(page.getByText(/Tests: 1 failed/)).toBeHidden();
      await page.screenshot({ path: testInfo.outputPath(`reading-${colorScheme}.png`) });

      await page.getByRole('button', { name: 'Show 2 more lines' }).click();
      await expect(page.getByText(/Tests: 1 failed/)).toBeVisible();

      await page.getByRole('button', { name: 'Copy all as Markdown' }).click();
      await expect(page.getByRole('button', { name: 'Copied as Markdown' })).toBeVisible();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(copied).toContain('**Bash(npm test)**\n\n```\nPASS src/a.test.ts\n');
      expect(copied).toContain("I'll run the tests first");
      expect(copied).not.toContain('⏺');

      // Scrolling isn't typing, and reading sends nothing either.
      expect(session.inputs).toEqual([]);
    });
  });
}

test('the pill goes once the swipe is long done', async ({ page }) => {
  const session = await openTerminal(page);
  session.output(Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\r\n'));
  await expect(page.locator('.xterm-rows')).toContainText('line 99');

  await swipe(page, 200);
  const pill = page.getByRole('button', { name: 'Open reading mode' });
  await expect(pill).toBeVisible();
  await expect(pill).toBeHidden({ timeout: 10_000 });
});
