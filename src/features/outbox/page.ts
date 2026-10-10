import { Marked } from 'marked';

import type { AppColors } from '@/constants/app-themes';

/**
 * The pages the file viewer shows. A file is the host's content, untrusted like terminal
 * output: a Markdown page is made here with its raw HTML escaped, and loads nothing (its
 * Content-Security-Policy allows only its own styles and images inside it). An HTML page is
 * the agent's own; without scripts it gets the same policy, so it can't load anything either.
 */

/** What a page may load while it can't run scripts: only what's inside it. */
export const STATIC_POLICY =
  "default-src 'none'; style-src 'unsafe-inline' data:; img-src data:; font-src data:; " +
  "form-action 'none'; base-uri 'none'";

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

// GitHub's Markdown (tables, task lists, strikethrough), with any HTML in it shown as text: a
// file can't add a tag (a meta refresh, a form) to the page.
const markdown = new Marked({
  gfm: true,
  renderer: {
    // A block of it is a paragraph of text.
    html: ({ text, block }) => (block ? `<p>${escapeHtml(text.trim())}</p>\n` : escapeHtml(text)),
  },
});

export type PageColors = Pick<
  AppColors,
  'background' | 'backgroundElement' | 'border' | 'text' | 'textSecondary' | 'primaryText'
>;

const policyMeta = (policy: string) =>
  `<meta http-equiv="Content-Security-Policy" content="${policy}">`;

const VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1">';

function styles(colors: PageColors, mode: 'light' | 'dark'): string {
  return `
:root { color-scheme: ${mode}; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; padding: 16px 16px 48px;
  background: ${colors.background}; color: ${colors.text};
  font: 16px/1.6 -apple-system, system-ui, Roboto, "Segoe UI", sans-serif;
  overflow-wrap: anywhere;
}
h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.4em 0 0.5em; }
h1 { font-size: 1.6em; } h2 { font-size: 1.3em; } h3 { font-size: 1.1em; }
body > :first-child { margin-top: 0; }
h1, h2 { padding-bottom: 0.25em; border-bottom: 1px solid ${colors.border}; }
p, ul, ol, pre, table, blockquote { margin: 0 0 1em; }
ul, ol { padding-left: 1.4em; }
li > ul, li > ol { margin: 0; }
li:has(> input[type="checkbox"]) { list-style: none; margin-left: -1.4em; }
a { color: ${colors.primaryText}; }
code, pre {
  font-family: ui-monospace, Menlo, "Roboto Mono", monospace; font-size: 0.875em;
  background: ${colors.backgroundElement}; border-radius: 4px;
}
code { padding: 0.1em 0.3em; }
pre { padding: 12px; overflow-x: auto; line-height: 1.45; }
pre code { padding: 0; background: none; font-size: 1em; }
blockquote {
  margin-left: 0; padding-left: 12px;
  border-left: 3px solid ${colors.border}; color: ${colors.textSecondary};
}
table { border-collapse: collapse; display: block; overflow-x: auto; }
th, td { border: 1px solid ${colors.border}; padding: 6px 10px; text-align: left; }
th { background: ${colors.backgroundElement}; }
img { max-width: 100%; }
hr { border: 0; border-top: 1px solid ${colors.border}; margin: 1.5em 0; }
`;
}

/** A Markdown file as a page in the app's colours. */
export function markdownPage(text: string, colors: PageColors, mode: 'light' | 'dark'): string {
  const body = markdown.parse(text, { async: false });
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    policyMeta(STATIC_POLICY),
    VIEWPORT,
    `<style>${styles(colors, mode)}</style>`,
    `</head><body>${body}</body></html>`,
  ].join('');
}

/**
 * An HTML file as the agent made it. Without scripts, the policy goes in first thing, before
 * anything the page could load: after its doctype, where the parser opens the head for it.
 */
export function htmlPage(text: string, scripts: boolean): string {
  const head = [
    scripts ? '' : policyMeta(STATIC_POLICY),
    /<meta[^>]+name\s*=\s*["']?viewport/i.test(text) ? '' : VIEWPORT,
  ].join('');
  const doctype = /^\s*<!doctype[^>]*>/i.exec(text);
  if (!doctype) return `${head}${text}`;
  return `${doctype[0]}${head}${text.slice(doctype[0].length)}`;
}
