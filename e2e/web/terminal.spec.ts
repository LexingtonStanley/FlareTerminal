import { expect, test, type Page } from '@playwright/test';

import { FAKE_TITLE, FAKE_TTYD_ADDRESS, fakeTtyd } from './fake-ttyd';

async function addConnection(page: Page, name: string, address: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New connection' }).click();
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

test('explains how to set up a host when there are no connections', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Connections' })).toBeVisible();
  await expect(page.getByText('ttyd -W -c you:a-long-password tmux new -A -s main')).toBeVisible();
});

test('validates a new connection, then saves from a deep link', async ({ page }) => {
  await page.goto('/connections/new');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Enter a name')).toBeVisible();

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
  await expect(page.getByText(FAKE_TITLE)).toBeVisible();
  await expect(screen).toContainText('$');

  await page.getByLabel('Command').fill('echo hello from flare');
  await page.getByLabel('Command').press('Enter');

  await expect(screen).toContainText('hello from flare');
  // The shell enabled bracketed paste, so the composer's text arrives as one paste.
  expect(session.inputs).toEqual(['\x1b[200~echo hello from flare\x1b[201~', '\r']);
  await expect(page.getByLabel('Command')).toHaveValue('');
});

test('types straight into the terminal and uses the key bar', async ({ page }) => {
  const { session, screen, tapTarget } = await openTerminal(page);

  await tapTarget.click();
  await page.keyboard.type('ls');
  await expect(screen).toContainText('$ ls');

  // Key-bar buttons must not take focus away from the terminal (that closes a
  // phone's keyboard).
  await page.getByRole('button', { name: 'Up arrow' }).click();
  await page.getByRole('button', { name: 'Escape' }).click();
  await expect(page.locator('.xterm-helper-textarea')).toBeFocused();

  // Sticky Ctrl, then a key typed in the composer: Ctrl+C.
  await page.getByRole('switch', { name: 'Control' }).click();
  await expect(page.getByRole('switch', { name: 'Control' })).toBeChecked();
  await page.getByLabel('Command').pressSequentially('c');
  await expect(page.getByRole('switch', { name: 'Control' })).not.toBeChecked();
  await expect(screen).toContainText('^C');
  await expect(page.getByLabel('Command')).toHaveValue('');

  await page.getByRole('button', { name: 'Pipe' }).click();

  expect(session.inputs).toEqual(['l', 's', '\x1b[A', '\x1b', '\x03', '|']);
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
  await expect(page.getByText('Connect to a computer running ttyd')).toBeVisible();
});

test('unknown routes show not found', async ({ page }) => {
  await page.goto('/does-not-exist');

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme });

    test('renders the connections list and terminal', async ({ page }, testInfo) => {
      await addConnection(page, 'Devbox', FAKE_TTYD_ADDRESS);
      await page.screenshot({ path: testInfo.outputPath(`connections-${colorScheme}.png`) });

      const { session, screen } = await openTerminal(page, { saved: true });
      session.output(
        '\x1b[1;32m~/flare\x1b[0m on \x1b[35mmain\x1b[0m \x1b[2m(3 files changed)\x1b[0m\r\n$ '
      );
      await expect(screen).toContainText('3 files changed');
      await page.screenshot({ path: testInfo.outputPath(`terminal-${colorScheme}.png`) });
    });
  });
}
