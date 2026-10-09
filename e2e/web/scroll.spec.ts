import { expect, test, type Page } from '@playwright/test';

import { openTerminal, swipe } from './touch';

/** The number in the terminal's top visible row, `line N`. */
async function topLine(page: Page) {
  const text = await page.locator('.xterm-rows > div').first().innerText();
  return Number(/line (\d+)/.exec(text)?.[1] ?? NaN);
}

test('a swipe scrolls back through the output, and back down again', async ({ page }) => {
  const session = await openTerminal(page);
  session.output(Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\r\n'));
  await expect(page.locator('.xterm-rows')).toContainText('line 199');
  const bottom = await topLine(page);

  await swipe(page, 200);
  await expect.poll(() => topLine(page)).toBeLessThan(bottom - 5);

  await swipe(page, -400);
  await expect.poll(() => topLine(page)).toBe(bottom);
  // Scrolling isn't typing.
  expect(session.inputs).toEqual([]);
});

test('a swipe in tmux or zellij scrolls their history, as a mouse wheel', async ({ page }) => {
  const session = await openTerminal(page);
  // What tmux sends with mouse mode on (zellij too): the other screen, and mouse reports
  // in SGR form.
  session.output('\x1b[?1049h\x1b[?1000h\x1b[?1002h\x1b[?1006h');
  await page.waitForTimeout(100);

  await swipe(page, 200);
  await expect.poll(() => session.inputs.length).toBeGreaterThan(0);
  expect(session.inputs.every((input) => /^\x1b\[<64;\d+;\d+M$/.test(input))).toBe(true);

  const up = session.inputs.length;
  await swipe(page, -200);
  await expect.poll(() => session.inputs.length).toBeGreaterThan(up);
  expect(session.inputs.slice(up).every((input) => /^\x1b\[<65;\d+;\d+M$/.test(input))).toBe(true);
});

test('a full-screen program without the mouse gets nothing, and a hint says why', async ({
  page,
}) => {
  const session = await openTerminal(page);
  session.output('\x1b[?1049h\x1b[Hfull screen');
  await expect(page.locator('.xterm-rows')).toContainText('full screen');

  await swipe(page, 200);

  const hint = page.getByRole('alert', { name: 'Can’t scroll this program' });
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('tmux set -g mouse on');
  await expect(hint.getByRole('button', { name: 'Open reading mode' })).toBeVisible();
  // No arrow keys: an agent would take them as moves through its prompt history.
  expect(session.inputs).toEqual([]);
  await hint.getByRole('button', { name: 'Dismiss' }).click();
  await expect(hint).toBeHidden();
});
