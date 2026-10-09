import { expect, type Page } from '@playwright/test';

import { FAKE_TTYD_ADDRESS, fakeTtyd } from './fake-ttyd';

/** Saves a connection to the fake ttyd and opens its terminal. */
export async function openTerminal(page: Page) {
  const ttyd = await fakeTtyd(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'New connection' }).click();
  await page.getByRole('radio', { name: 'ttyd' }).click();
  await page.getByLabel('Name').fill('Devbox');
  await page.getByLabel('Address').fill(FAKE_TTYD_ADDRESS);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Open Devbox' }).click();
  const session = await ttyd.session(0);
  await expect(page.getByLabel('Status: Connected')).toBeVisible();
  return session;
}

/** A finger dragged down the terminal by `dy` pixels (up, if negative), slowly: no fling. */
export async function swipe(page: Page, dy: number) {
  const box = (await page.locator('.xterm-screen').boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2 - dy / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y + (dy * i) / 10 }],
    });
  }
  // Held still before lifting, so the swipe ends where the finger did.
  await page.waitForTimeout(150);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
