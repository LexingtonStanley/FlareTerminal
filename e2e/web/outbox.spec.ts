import { expect, test, type Page } from '@playwright/test';

import { appTheme } from '../../src/constants/app-themes';

/** #rrggbb as the rgb() a browser computes. */
const rgb = (hex: string) =>
  `rgb(${[1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16)).join(', ')})`;

const PLAN = `# Release plan

Ship the **agent outbox** after the image paste.

| Step | Owner | Done |
| --- | --- | --- |
| Tests | Claude | yes |
| Device run | Lex | no |

- [x] Write it
- [ ] Try it on a phone

\`\`\`sh
npm run check
\`\`\`

> Files stay on the host too.

<script>document.title = 'ran'</script>

[Expo docs](https://docs.expo.dev/)
`;

const REPORT = `<!doctype html><html><head><title>Report</title></head><body>
<h1>Report</h1><p id="scripts">Scripts off</p>
<script>document.getElementById('scripts').textContent = 'Scripts ran'</script>
</body></html>`;

/** Two files an agent sent earlier, as the app stored them. */
async function withFiles(page: Page) {
  const file = (id: string, name: string, kind: string, text: string, receivedAt: number) => ({
    id,
    connectionId: 'devbox',
    host: 'Devbox',
    name,
    kind,
    size: text.length,
    modifiedAt: receivedAt,
    receivedAt,
    read: false,
  });
  await page.addInitScript(
    ({ files, texts }) => {
      localStorage.setItem('flare.outbox.v1', JSON.stringify(files));
      for (const [id, text] of Object.entries(texts)) {
        localStorage.setItem(`flare.outbox.file.${id}`, JSON.stringify(text));
      }
    },
    {
      files: [
        file('report', 'report.html', 'html', REPORT, Date.now() - 60_000),
        file('plan', 'plan.md', 'markdown', PLAN, Date.now() - 120_000),
      ],
      texts: { report: REPORT, plan: PLAN },
    }
  );
}

for (const mode of ['light', 'dark'] as const) {
  test(`shows a Markdown file from an agent as a page, in ${mode} mode`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme: mode });
    await withFiles(page);
    await page.goto('/inbox');

    await expect(page.getByText('Files from agents · 2')).toBeVisible();
    await expect(page.getByText('2 new files')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`inbox-${mode}.png`) });
    await page.getByRole('button', { name: /^Read plan\.md, new, Devbox/ }).click();

    const frame = page.frameLocator('iframe[title="plan.md"]');
    await expect(frame.getByRole('heading', { name: 'Release plan' })).toBeVisible();
    await expect(frame.getByRole('cell', { name: 'Device run' })).toBeVisible();
    await expect(frame.getByRole('link', { name: 'Expo docs' })).toHaveAttribute(
      'href',
      'https://docs.expo.dev/'
    );
    // The file's HTML is text, never markup.
    await expect(frame.getByText("<script>document.title = 'ran'</script>")).toBeVisible();
    const colors = appTheme('flare', mode).colors;
    await expect
      .poll(() => frame.locator('body').evaluate((body) => getComputedStyle(body).backgroundColor))
      .toBe(rgb(colors.background));
    await page.screenshot({ path: testInfo.outputPath(`markdown-${mode}.png`) });

    // Opened is read.
    await page.goBack();
    await expect(page.getByText('1 new file')).toBeVisible();
  });
}

test('runs an HTML file’s scripts only once they’re allowed', async ({ page }, testInfo) => {
  await withFiles(page);
  await page.goto('/inbox');
  await page.getByRole('button', { name: /^Read report\.html/ }).click();

  const frame = page.frameLocator('iframe[title="report.html"]');
  await expect(frame.getByRole('heading', { name: 'Report' })).toBeVisible();
  await expect(frame.getByText('Scripts off')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('html-static.png') });

  await page.getByRole('switch', { name: 'Run scripts' }).click();
  await expect(frame.getByText('Scripts ran')).toBeVisible();
});

test('deletes the phone’s copy of a file', async ({ page }) => {
  await withFiles(page);
  await page.goto('/inbox');
  await page.getByRole('button', { name: /^Read plan\.md/ }).click();

  await page.getByRole('button', { name: 'Delete from this phone' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();

  await expect(page.getByText('Files from agents · 1')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Read plan\.md/ })).toHaveCount(0);
});
