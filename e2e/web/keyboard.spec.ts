import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * The in-app keyboards on the preview route (/keyboard-preview), driven with a mouse
 * the way a finger would: press, move, hold, release. The "Sent" log shows each input
 * the terminal would receive, readably (↑ for an arrow, ^C for Ctrl-C, ␠ for a space).
 */

async function openPreview(page: Page) {
  await page.goto('/keyboard-preview');
  await expect(page.getByRole('toolbar', { name: 'Terminal keys' })).toBeVisible();
  await expect(page.locator('.xterm-rows')).toContainText('~/flare $');
}

function key(page: Page, name: string) {
  return page.getByRole('button', { name, exact: true });
}

async function centerOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Key is not visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Press a key, slide by (dx, dy), optionally hold there, then lift. */
async function swipe(page: Page, target: Locator, dx: number, dy: number, holdMs = 0) {
  const { x, y } = await centerOf(target);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  if (holdMs) await page.waitForTimeout(holdMs);
  await page.mouse.up();
}

async function hold(page: Page, target: Locator, ms: number) {
  await swipe(page, target, 0, 0, ms);
}

function sent(page: Page) {
  return page.getByLabel('Sent').locator(':scope > *').allTextContents();
}

test('the bar sends the agent keys, symbol flicks and arrows', async ({ page }) => {
  await openPreview(page);

  await key(page, 'Escape').click();
  await swipe(page, key(page, 'Tab'), 0, -30);
  await swipe(page, page.getByRole('switch', { name: 'Control' }), 0, -30);
  await key(page, 'Pipe').click();
  await swipe(page, key(page, 'Pipe'), 0, -30);
  await swipe(page, key(page, 'Pipe'), 30, 0);
  await swipe(page, key(page, 'Slash'), 0, 30);

  // The arrows key: a tap on its left side, then a flick up.
  const arrows = key(page, 'Arrow keys');
  const box = (await arrows.boundingBox())!;
  await page.mouse.click(box.x + 10, box.y + box.height / 2);
  await swipe(page, arrows, 0, -20);

  await expect.poll(() => sent(page)).toEqual(['esc', '⇧tab', '^C', '|', '~', '>', '-', '←', '↑']);
});

test('the arrows joystick repeats while held, faster further out', async ({ page }) => {
  await openPreview(page);
  const arrows = key(page, 'Arrow keys');

  await swipe(page, arrows, 20, 0, 1000);
  const near = (await sent(page)).length;
  await page.getByRole('button', { name: 'Clear' }).click();
  await swipe(page, arrows, 90, 0, 1000);
  const far = (await sent(page)).length;

  expect(near).toBeGreaterThan(2);
  expect(far).toBeGreaterThan(near * 2);
  expect(new Set(await sent(page))).toEqual(new Set(['→']));
});

test('keys keep the terminal focused, and sticky Ctrl applies to the next key', async ({
  page,
}) => {
  await openPreview(page);
  await page.locator('.xterm-screen').click();
  const textarea = page.locator('.xterm-helper-textarea');
  await expect(textarea).toBeFocused();

  const ctrl = page.getByRole('switch', { name: 'Control' });
  await ctrl.click();
  await expect(ctrl).toBeChecked();
  await expect(ctrl).toHaveAttribute('aria-valuetext', 'once');
  await expect(textarea).toBeFocused();

  // Typed on the terminal's own keyboard: Ctrl applies once, then releases.
  await page.keyboard.type('cc');
  await expect.poll(() => sent(page)).toEqual(['^C', 'c']);
  await expect(ctrl).not.toBeChecked();

  // A double tap locks it until the next tap.
  const alt = page.getByRole('switch', { name: 'Alt' });
  await alt.dblclick();
  await expect(alt).toHaveAttribute('aria-valuetext', 'locked');
  await page.keyboard.type('bf');
  await expect.poll(() => sent(page)).toEqual(['^C', 'c', 'M-b', 'M-f']);
  await alt.click();
  await expect(alt).not.toBeChecked();
});

test('the coding keyboard types a command and replaces the phone keyboard', async ({ page }) => {
  await openPreview(page);
  await page.locator('.xterm-screen').click();
  const textarea = page.locator('.xterm-helper-textarea');

  await key(page, 'Coding keyboard').click();
  const keyboard = page.getByRole('group', { name: 'Coding keyboard' });
  await expect(keyboard).toBeVisible();
  // The terminal stays focused but asks for no on-screen keyboard.
  await expect(textarea).toHaveAttribute('inputmode', 'none');
  await expect(textarea).toBeFocused();

  for (const name of ['l', 's', 'Space', 'Dash', 'l', 'a']) await key(page, name).click();
  await expect(page.locator('.xterm-rows')).toContainText('~/flare $ ls -la');
  await expect(textarea).toBeFocused();
  await key(page, 'Enter').click();

  // Shift for one capital; a flick up on a letter for its digit or symbol.
  await page.getByRole('switch', { name: 'Shift' }).click();
  await key(page, 'g').click();
  await key(page, 'g').click();
  await swipe(page, key(page, 'w'), 0, -30);
  await swipe(page, key(page, 'a'), 0, -30);

  await expect
    .poll(() => sent(page))
    .toEqual(['l', 's', '␠', '-', 'l', 'a', '⏎', 'G', 'g', '2', '@']);

  await key(page, 'Phone keyboard').click();
  await expect(page.getByRole('toolbar', { name: 'Terminal keys' })).toBeVisible();
  // The phone's keyboard belongs to a text field; the terminal never asks for it.
  await expect(textarea).toHaveAttribute('inputmode', 'none');
});

test('the coding keyboard reaches symbols, navigation keys and repeats', async ({ page }) => {
  await openPreview(page);
  await key(page, 'Coding keyboard').click();

  // A long press types the up secondary, like Gboard.
  await hold(page, key(page, 'q'), 700);
  // Backspace repeats while held.
  await hold(page, key(page, 'Backspace'), 900);
  const afterBackspace = await sent(page);
  expect(afterBackspace[0]).toBe('1');
  expect(afterBackspace.length).toBeGreaterThan(4);
  expect(new Set(afterBackspace.slice(1))).toEqual(new Set(['⌫']));
  await page.getByRole('button', { name: 'Clear' }).click();

  // Sliding along the space bar moves the cursor.
  await swipe(page, key(page, 'Space'), -50, 0);

  await key(page, 'Symbols').click();
  for (const name of ['Ampersand', 'Left brace', 'Right brace', 'Greater than']) {
    await key(page, name).click();
  }
  await key(page, 'Navigation keys').click();
  for (const name of ['Home', 'Page down', 'F5', 'Up arrow']) await key(page, name).click();
  await key(page, 'Letters').click();
  await expect(key(page, 'q')).toBeVisible();

  await expect
    .poll(() => sent(page))
    .toEqual(['←', '←', '←', '←', '&', '{', '}', '>', 'home', 'pgdn', 'F5', '↑']);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme });

    test('renders both keyboards', async ({ page }, testInfo) => {
      await openPreview(page);
      await page.getByRole('switch', { name: 'Control' }).click();
      await page.getByRole('switch', { name: 'Alt' }).dblclick();
      await page.screenshot({ path: testInfo.outputPath(`keyboard-bar-${colorScheme}.png`) });

      // Mid-flick on the pipe key: the bubble shows the options and the chosen one.
      const pipe = await centerOf(key(page, 'Pipe'));
      await page.mouse.move(pipe.x, pipe.y);
      await page.mouse.down();
      await page.mouse.move(pipe.x, pipe.y - 30, { steps: 4 });
      await page.screenshot({ path: testInfo.outputPath(`keyboard-flick-${colorScheme}.png`) });
      await page.mouse.up();

      await key(page, 'Coding keyboard').click();
      await page.getByRole('switch', { name: 'Shift' }).click();
      await page.screenshot({ path: testInfo.outputPath(`keyboard-letters-${colorScheme}.png`) });

      await key(page, 'Symbols').click();
      await page.screenshot({ path: testInfo.outputPath(`keyboard-symbols-${colorScheme}.png`) });

      await key(page, 'Navigation keys').click();
      await page.screenshot({ path: testInfo.outputPath(`keyboard-nav-${colorScheme}.png`) });
    });
  });
}
