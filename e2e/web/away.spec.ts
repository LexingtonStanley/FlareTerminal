import { expect, test } from '@playwright/test';

import { openTerminal } from './touch';

const lines = (label: string, count: number) =>
  Array.from({ length: count }, (_, i) => `${label} ${i}\r\n`).join('');

test('says what arrived while the person was away, and jumps back to it', async ({ page }) => {
  // Fixed, so the minute away can pass at once; timers still run.
  await page.clock.setFixedTime(new Date('2026-10-09T10:00:00Z'));
  const session = await openTerminal(page);
  const screen = page.locator('.xterm-rows');
  session.output(lines('before', 30));
  await expect(screen).toContainText('before 29');

  await page.getByRole('link', { name: 'Home, back' }).click();
  const resume = page.getByRole('button', { name: 'Resume Devbox' });
  await expect(resume).toBeVisible();
  await expect(page.locator('.xterm-screen')).toHaveCount(0);
  // Ends by setting the title, which Home shows once the app has read everything before it.
  session.output(lines('while away', 200) + '\x1b]0;Still working\x07');
  await expect(resume).toContainText('Still working');
  // Each step waits for the last, so the person surely left before the minute passed, and
  // the lines surely arrived before they came back.
  await page.clock.setFixedTime(new Date('2026-10-09T10:01:00Z'));
  await resume.click();

  const chip = page.getByRole('button', { name: 'Jump to 200 new lines since you left' });
  await expect(chip).toBeVisible();
  await expect(screen).toContainText('while away 199');

  await chip.click();

  // The screen starts just before the first new line, where the person left off.
  await expect(screen).toContainText('while away 0');
  await expect(screen).toContainText('before 29');
  await expect(screen).not.toContainText('while away 199');
  await expect(chip).toBeHidden();
  // Jumping isn't typing.
  expect(session.inputs).toEqual([]);
});
