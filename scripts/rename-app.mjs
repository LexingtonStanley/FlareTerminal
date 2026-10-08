#!/usr/bin/env node
// Gives a project created from this template its own identity: display name, slug,
// URL scheme, iOS bundle identifier / Android package, npm package name and the
// Maestro appId. Clears EAS links copied from the template so `eas init` starts fresh.
//
// Usage: npm run rename -- --name "Acme Notes" --id com.acme.notes [--slug acme-notes] [--scheme acmenotes]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    id: { type: 'string' },
    slug: { type: 'string' },
    scheme: { type: 'string' },
  },
});

function fail(message) {
  console.error(`rename-app: ${message}`);
  console.error(
    'Usage: npm run rename -- --name "Acme Notes" --id com.acme.notes [--slug acme-notes] [--scheme acmenotes]'
  );
  process.exit(1);
}

const name = values.name?.trim();
const id = values.id?.trim();
if (!name) fail('--name is required');
if (!id) fail('--id is required');

// Android's package rules are the stricter of the two stores, so validate against them.
if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(id)) {
  fail(
    `--id "${id}" must look like com.company.app: dot-separated, each part starting with a letter, only letters, digits and _`
  );
}

const slug =
  values.slug ??
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
  fail(`--slug "${slug}" must be lowercase letters and digits separated by single hyphens`);
}

const scheme = values.scheme ?? slug.replace(/-/g, '');
if (!/^[a-z][a-z0-9+.-]*$/.test(scheme)) {
  fail(`--scheme "${scheme}" must start with a letter and use only a-z, 0-9, +, . or -`);
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, data) => writeFileSync(file, JSON.stringify(data, null, 2) + '\n');

const app = readJson('app.json');
const expo = app.expo;
expo.name = name;
expo.slug = slug;
expo.scheme = scheme;
expo.ios = { ...expo.ios, bundleIdentifier: id };
expo.android = { ...expo.android, package: id };
// These belong to the template's EAS project, not this app.
delete expo.owner;
delete expo.updates?.url;
if (expo.updates && Object.keys(expo.updates).length === 0) delete expo.updates;
delete expo.extra?.eas;
if (expo.extra && Object.keys(expo.extra).length === 0) delete expo.extra;
writeJson('app.json', app);

const pkg = readJson('package.json');
pkg.name = slug;
writeJson('package.json', pkg);

const lock = readJson('package-lock.json');
lock.name = slug;
if (lock.packages?.['']) lock.packages[''].name = slug;
writeJson('package-lock.json', lock);

const maestroFiles = readdirSync('.maestro').filter((file) => /\.ya?ml$/.test(file));
for (const file of maestroFiles) {
  const path = join('.maestro', file);
  const source = readFileSync(path, 'utf8');
  writeFileSync(path, source.replace(/^appId: .*$/m, `appId: ${id}`));
}

console.log(`Renamed to "${name}"
  slug:      ${slug}
  scheme:    ${scheme}
  bundle ID: ${id} (dev and preview builds add .dev / .preview)
  updated:   app.json, package.json, package-lock.json, ${maestroFiles.map((f) => `.maestro/${f}`).join(', ')}

Next: run \`npm run check\`, then \`npx eas-cli@latest init\` to create this app's EAS project.`);
