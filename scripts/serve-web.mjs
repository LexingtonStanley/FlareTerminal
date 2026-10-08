#!/usr/bin/env node
// Serves the exported web build (dist/) with a single-page-app fallback, so deep
// links like /settings load index.html. `expo serve` 404s on those for
// `web.output: "single"`. Used by the Playwright smoke tests.
//
// Usage: node scripts/serve-web.mjs [--port 8090] [--dir dist]
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: process.env.PORT ?? '8090' },
    dir: { type: 'string', default: 'dist' },
  },
});

const root = resolve(values.dir);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

function fileFor(urlPath) {
  try {
    const candidate = normalize(join(root, decodeURIComponent(urlPath)));
    if (!candidate.startsWith(root + sep)) return null;
    return statSync(candidate).isFile() ? candidate : null;
  } catch {
    // Malformed URI or missing file.
    return null;
  }
}

try {
  statSync(join(root, 'index.html'));
} catch {
  console.error(`serve-web: ${root}/index.html not found. Run \`npm run web:build\` first.`);
  process.exit(1);
}

createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  // Missing files with an extension are real 404s; anything else is a client route.
  const file = fileFor(pathname) ?? (extname(pathname) ? null : join(root, 'index.html'));
  if (!file) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(Number(values.port), () => {
  console.log(`Serving ${root} at http://localhost:${values.port}`);
});
