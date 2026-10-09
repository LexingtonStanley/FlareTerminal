import { expect, test, type Page } from '@playwright/test';

import { FAKE_TITLE, FAKE_TTYD_ADDRESS, fakeTtyd } from './fake-ttyd';

/** A flick up on the hide key: the phone's keyboard, in a text field. */
async function openPhoneKeyboard(page: Page) {
  const box = (await page.getByRole('button', { name: 'Hide keyboard' }).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 30, { steps: 5 });
  await page.mouse.up();
}

/** Saves a ttyd connection: the kind a browser can open. */
async function addConnection(page: Page, name: string, address: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New connection' }).click();
  await page.getByRole('radio', { name: 'ttyd' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Address').fill(address);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: `Open ${name}` })).toBeVisible();
}

/** Saves a connection to the fake ttyd and opens its terminal. */
async function openTerminal(page: Page, { saved = false } = {}) {
  const ttyd = await fakeTtyd(page);
  if (!saved) await addConnection(page, 'Devbox', FAKE_TTYD_ADDRESS);
  await page.getByRole('button', { name: 'Open Devbox' }).click();
  const session = await ttyd.session(0);
  await expect(page.getByLabel('Status: Connected')).toBeVisible();
  // The rows hold the text; the screen element above them takes taps.
  return {
    ttyd,
    session,
    screen: page.locator('.xterm-rows'),
    tapTarget: page.locator('.xterm-screen'),
  };
}

test('explains how to connect when there are no connections', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Connections' })).toBeVisible();
  await expect(page.getByText('ssh lexde@lexbox')).toBeVisible();
});

test('saves an SSH connection, which explains it needs the app in a browser', async ({ page }) => {
  await page.goto('/connections/new');
  await expect(page.getByRole('radio', { name: 'SSH' })).toBeChecked();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Enter your username on that computer')).toBeVisible();

  await page.getByLabel('Host').fill('lexde@lexbox');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Open lexde@lexbox' }).click();

  await expect(page.getByRole('alert')).toContainText('SSH needs the Android or iOS app');
});

test('validates a new ttyd connection, then saves from a deep link', async ({ page }) => {
  await page.goto('/connections/new');
  await page.getByRole('radio', { name: 'ttyd' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Enter the address ttyd is listening on')).toBeVisible();

  await page.getByLabel('Address').fill('ftp://devbox');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Use an http(s):// or ws(s):// address')).toBeVisible();

  await page.getByLabel('Address').fill('http://203.0.113.9:7681');
  await expect(page.getByText(/This address is not encrypted/)).toBeVisible();
  await page.getByLabel('Address').fill('http://100.101.102.103:7681');
  await expect(page.getByText(/This address is not encrypted/)).toBeHidden();

  // With no screen to go back to, saving lands on the list.
  await page.getByLabel('Name').fill('Tailnet box');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: 'Open Tailnet box' })).toBeVisible();
});

test('connects, sizes the remote terminal and runs a command', async ({ page }) => {
  const { session, screen } = await openTerminal(page);

  expect(session.handshake.AuthToken).toBe('');
  expect(session.handshake.columns).toBeGreaterThan(20);
  expect(session.handshake.rows).toBeGreaterThan(5);
  // The home screen underneath lists the title too; check the session header's.
  await expect(page.getByText(FAKE_TITLE).filter({ visible: true })).toBeVisible();
  await expect(screen).toContainText('$');

  await openPhoneKeyboard(page);
  await expect(page.getByLabel('Command')).toBeFocused();
  await page.getByLabel('Command').fill('echo hello from flare');
  await page.getByLabel('Command').press('Enter');

  await expect(screen).toContainText('hello from flare');
  // The shell enabled bracketed paste, so the composer's text arrives as one paste.
  expect(session.inputs).toEqual(['\x1b[200~echo hello from flare\x1b[201~', '\r']);
  await expect(page.getByLabel('Command')).toHaveValue('');
});

test('opens on the coding keyboard, which keeps the terminal focused', async ({ page }) => {
  const { session, screen } = await openTerminal(page);
  const textarea = page.locator('.xterm-helper-textarea');

  // The terminal never asks for the phone's keyboard; it keeps focus for the cursor and
  // for hardware keyboards.
  await expect(page.getByLabel('Coding keyboard')).toBeVisible();
  await expect(textarea).toHaveAttribute('inputmode', 'none');
  await expect(textarea).toBeFocused();
  await expect(page.getByLabel('Command')).toBeHidden();

  for (const name of ['l', 's']) await page.getByRole('button', { name, exact: true }).click();
  await expect(screen).toContainText('$ ls');

  // The arrows key sends the side that is tapped; keys never take focus.
  const arrows = (await page.getByRole('button', { name: 'Arrow keys' }).boundingBox())!;
  await page.mouse.click(arrows.x + arrows.width / 2, arrows.y + 6);
  await page.getByRole('button', { name: 'Escape' }).click();
  await expect(textarea).toBeFocused();

  // Sticky Ctrl, then a key: Ctrl+C.
  const ctrl = page.getByRole('switch', { name: 'Control' });
  await ctrl.click();
  await expect(ctrl).toBeChecked();
  await page.getByRole('button', { name: 'c', exact: true }).click();
  await expect(ctrl).not.toBeChecked();
  await expect(screen).toContainText('^C');

  await page.getByRole('button', { name: 'Pipe' }).click();
  await page.keyboard.type('x');

  expect(session.inputs).toEqual(['l', 's', '\x1b[A', '\x1b', '\x03', '|', 'x']);
});

test('hides the keyboard without opening the phone’s; a tap brings it back', async ({ page }) => {
  const { tapTarget } = await openTerminal(page);
  const keyboard = page.getByLabel('Coding keyboard');

  await page.getByRole('button', { name: 'Hide keyboard' }).click();
  await expect(keyboard).toBeHidden();
  await expect(page.getByLabel('Command')).toBeHidden();
  await page.getByRole('button', { name: 'Show keyboard' }).click();
  await expect(keyboard).toBeVisible();

  await page.getByRole('button', { name: 'Hide keyboard' }).click();
  await expect(keyboard).toBeHidden();
  await tapTarget.tap();
  await expect(keyboard).toBeVisible();
  await expect(page.locator('.xterm-helper-textarea')).toHaveAttribute('inputmode', 'none');
});

test('writes with the phone’s keyboard in a text field, then goes back', async ({ page }) => {
  const { session } = await openTerminal(page);

  await openPhoneKeyboard(page);
  const field = page.getByLabel('Command');
  await expect(field).toBeFocused();
  await expect(page.getByRole('toolbar', { name: 'Terminal keys' })).toBeVisible();
  await field.fill('Fix the flaky test');
  await page.getByRole('button', { name: 'Send' }).click();
  expect(session.inputs).toEqual(['\x1b[200~Fix the flaky test\x1b[201~', '\r']);

  await page.getByRole('button', { name: 'Coding keyboard' }).click();
  await expect(page.getByLabel('Coding keyboard')).toBeVisible();
  await expect(field).toBeHidden();
  await expect(page.locator('.xterm-helper-textarea')).toBeFocused();
});

test('a tap on the line being edited moves the cursor there', async ({ page }) => {
  const { session, screen, tapTarget } = await openTerminal(page);
  await tapTarget.click();
  await page.keyboard.type('echo hello');
  await expect(screen).toContainText('$ echo hello');
  session.inputs.length = 0;

  const box = (await tapTarget.boundingBox())!;
  const { columns, rows } = session.resizes.at(-1) ?? session.handshake;
  const cell = (col: number, row: number) => ({
    x: box.x + ((col + 0.5) * box.width) / columns,
    y: box.y + ((row + 0.5) * box.height) / rows,
  });

  // "$ echo hello": the cursor is at column 12; the "e" of echo is column 2.
  const echo = cell(2, 0);
  await page.touchscreen.tap(echo.x, echo.y);
  await expect.poll(() => session.inputs).toEqual(['\x1b[D'.repeat(10)]);
  // Typing now goes in where the tap put the cursor.
  await page.keyboard.type('>');
  await expect(screen).toContainText('$ >echo hello');

  // Past the end of the text: back to the end. Another line: nothing.
  const past = cell(columns - 2, 0);
  await page.touchscreen.tap(past.x, past.y);
  const below = cell(2, 3);
  await page.touchscreen.tap(below.x, below.y);
  await expect.poll(() => session.inputs).toEqual(['\x1b[D'.repeat(10), '>', '\x1b[C'.repeat(10)]);
});

test('reports a finished session and reconnects', async ({ page }) => {
  const { ttyd, session } = await openTerminal(page);

  session.exit(1000);
  await expect(page.getByRole('alert')).toHaveText('Session ended');
  await expect(page.getByLabel('Status: Disconnected')).toBeVisible();

  await page.getByRole('button', { name: 'Reconnect' }).click();
  await ttyd.session(1);
  await expect(page.getByLabel('Status: Connected')).toBeVisible();
  await expect(page.getByRole('alert')).toBeHidden();
});

test('runs a shortcut: connects and types its command', async ({ page }) => {
  const ttyd = await fakeTtyd(page);
  await addConnection(page, 'Devbox', FAKE_TTYD_ADDRESS);
  await page.getByRole('button', { name: 'New shortcut' }).click();
  await page.getByRole('button', { name: 'Use Claude in zellij' }).click();
  await page.getByLabel('Folder').fill('~/code/flare');
  await expect(
    page.getByText("cd ~/'code/flare' && zellij attach -c claude -- claude")
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();

  await page.getByRole('button', { name: 'Run Claude' }).click();
  const session = await ttyd.session(0);

  await expect
    .poll(() => session.inputs)
    .toEqual(["cd ~/'code/flare' && zellij attach -c claude -- claude\r"]);
  await expect(page.locator('.xterm-rows')).toContainText('fake-shell: cd: command not found');
});

test('keeps sessions running in the background and flags them', async ({ page }) => {
  const { ttyd, session: first, screen } = await openTerminal(page);
  await openPhoneKeyboard(page);
  await page.getByLabel('Command').fill('echo first session');
  await page.getByLabel('Command').press('Enter');
  await expect(screen).toContainText('first session');

  // A second session to the same computer, opened from home.
  await page.getByRole('link', { name: 'Home, back' }).click();
  await page.getByRole('button', { name: 'Open Devbox' }).click();
  const second = await ttyd.session(1);
  await expect(page.getByRole('tablist', { name: 'Open sessions' })).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(2);

  // The first session asks for attention while the second is on screen.
  first.output('\x1b]9;Claude needs your permission\x07');
  const banner = page.getByRole('button', { name: 'Go to Devbox: Claude needs your permission' });
  await expect(banner).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Devbox, needs attention' })).toBeVisible();

  // Switching back replays its screen, output included.
  await banner.click();
  await expect(page.locator('.xterm-rows').filter({ visible: true })).toContainText(
    'first session'
  );
  await expect(banner).toBeHidden();
  expect(second.inputs).toEqual([]);
});

test('resizes the remote terminal when the screen changes size', async ({ page }) => {
  const { session } = await openTerminal(page);
  const { columns } = session.handshake;

  await page.setViewportSize({ width: 300, height: 600 });

  await expect.poll(() => session.resizes.at(-1)?.columns).toBeLessThan(columns);
});

test('edits and deletes a connection', async ({ page }) => {
  await addConnection(page, 'Devbox', FAKE_TTYD_ADDRESS);
  await page.getByRole('button', { name: 'Edit Devbox' }).click();
  await page.getByLabel('Name').fill('Build box');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: 'Open Build box' })).toBeVisible();

  // Survives a reload: connections are stored on the device.
  await page.reload();
  await page.getByRole('button', { name: 'Edit Build box' }).click();
  await page.getByRole('button', { name: 'Delete connection' }).click();
  await page.getByRole('button', { name: 'Tap again to delete' }).click();
  await expect(page.getByText('Connect to your computer over SSH')).toBeVisible();
});

test('unknown routes show not found', async ({ page }) => {
  await page.goto('/does-not-exist');

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme });

    test('renders home, a shortcut and the session switcher', async ({ page }, testInfo) => {
      const shot = (name: string) =>
        page.screenshot({ path: testInfo.outputPath(`${name}-${colorScheme}.png`) });
      const ttyd = await fakeTtyd(page);
      await addConnection(page, 'Devbox', FAKE_TTYD_ADDRESS);
      await page.getByRole('button', { name: 'New shortcut' }).click();
      await page.getByRole('button', { name: 'Use Claude in tmux' }).click();
      await shot('shortcut-form');
      await page.getByRole('button', { name: 'Save' }).click();

      await page.getByRole('button', { name: 'Run Claude' }).click();
      const agent = await ttyd.session(0);
      agent.output(
        '\x1b[1;32m~/flare\x1b[0m on \x1b[35mmain\x1b[0m \x1b[2m(3 files changed)\x1b[0m\r\n$ '
      );
      await page.getByRole('link', { name: 'Home, back' }).click();
      await page.getByRole('button', { name: 'Open Devbox' }).click();
      await ttyd.session(1);
      await page.getByRole('link', { name: 'Home, back' }).click();
      agent.output('\x1b]9;Claude needs your permission to run tests\x07');
      await expect(
        page.getByText('Claude needs your permission to run tests').first()
      ).toBeVisible();
      await shot('home');

      await page.getByRole('button', { name: 'Resume Claude' }).click();
      await expect(page.locator('.xterm-rows').filter({ visible: true })).toContainText(
        '3 files changed'
      );
      await shot('terminal');
    });
  });
}
