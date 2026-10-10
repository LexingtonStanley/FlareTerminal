import { escapeHtml, htmlPage, markdownPage, STATIC_POLICY, type PageColors } from './page';

const COLORS: PageColors = {
  background: '#101010',
  backgroundElement: '#202020',
  border: '#303030',
  text: '#f0f0f0',
  textSecondary: '#a0a0a0',
  primaryText: '#ff8800',
};

const POLICY = `<meta http-equiv="Content-Security-Policy" content="${STATIC_POLICY}">`;

describe('markdownPage', () => {
  it('draws GitHub Markdown in the app’s colours', () => {
    const page = markdownPage(
      '# Plan\n\n| Step | Done |\n| --- | --- |\n| Tests | yes |\n\n- [x] Write it\n\n`npm test`',
      COLORS,
      'dark'
    );

    expect(page).toContain('<h1>Plan</h1>');
    expect(page).toContain('<td>Tests</td>');
    expect(page).toContain('type="checkbox"');
    expect(page).toContain('<code>npm test</code>');
    expect(page).toContain('background: #101010; color: #f0f0f0;');
    expect(page).toContain('color-scheme: dark;');
  });

  it('loads nothing, and shows any HTML in the file as text', () => {
    const page = markdownPage(
      'Hi <meta http-equiv="refresh" content="0;url=https://evil.example">\n\n<script>alert(1)</script>\n\n![x](https://tracker.example/x.png)',
      COLORS,
      'light'
    );

    expect(page.indexOf(POLICY)).toBeGreaterThan(0);
    expect(page.indexOf(POLICY)).toBeLessThan(page.indexOf('<body>'));
    expect(page).not.toContain('<meta http-equiv="refresh"');
    expect(page).toContain('&lt;meta http-equiv=&quot;refresh&quot;');
    expect(page).not.toContain('<script>');
    expect(page).toContain('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    expect(STATIC_POLICY).toContain("default-src 'none'");
    expect(STATIC_POLICY).toContain('img-src data:;');
  });

  it('keeps links, for the viewer to open in the browser', () => {
    expect(markdownPage('[docs](https://expo.dev)', COLORS, 'light')).toContain(
      '<a href="https://expo.dev">docs</a>'
    );
  });
});

describe('htmlPage', () => {
  it('puts the policy first, after the doctype, while scripts are off', () => {
    const page = htmlPage('<!DOCTYPE html><html><head><title>R</title></head></html>', false);
    expect(page.startsWith(`<!DOCTYPE html>${POLICY}<meta name="viewport"`)).toBe(true);
    expect(page.endsWith('<title>R</title></head></html>')).toBe(true);
  });

  it('puts it at the start of a page with no doctype', () => {
    expect(htmlPage('<p>Hi</p>', false).startsWith(POLICY)).toBe(true);
  });

  it('leaves the page as it is when scripts run, but for a viewport it lacks', () => {
    const page = '<!doctype html><meta name="viewport" content="width=device-width"><p>Hi</p>';
    expect(htmlPage(page, true)).toBe(page);
    expect(htmlPage('<p>Hi</p>', true)).toBe(
      '<meta name="viewport" content="width=device-width, initial-scale=1"><p>Hi</p>'
    );
  });
});

describe('escapeHtml', () => {
  it('escapes what HTML reads as markup', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;'
    );
  });
});
