#!/usr/bin/env node
// Generates Expo's TypeScript files: expo-env.d.ts and .expo/types/router.d.ts
// (typed routes, so `router.push('/typo')` fails typecheck). Only `expo start`
// writes them, so this starts the dev server briefly and stops once they're fresh.
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';

const FILES = ['expo-env.d.ts', '.expo/types/router.d.ts'];
const TIMEOUT_MS = 90_000;

const require = createRequire(import.meta.url);
const expoCli = require.resolve('expo/bin/cli');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function isFresh(file, since) {
  try {
    // Filesystem mtime can be coarser than Date.now(), so allow a second of slack.
    return statSync(file).mtimeMs >= since - 1000;
  } catch {
    return false;
  }
}

const startedAt = Date.now();
const port = await freePort();
const child = spawn(process.execPath, [expoCli, 'start', '--offline', '--port', String(port)], {
  env: { ...process.env, CI: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: process.platform !== 'win32',
});

let output = '';
child.stdout.on('data', (chunk) => (output += chunk));
child.stderr.on('data', (chunk) => (output += chunk));

function stop() {
  try {
    if (process.platform === 'win32') child.kill();
    else process.kill(-child.pid, 'SIGTERM');
  } catch {
    // Already exited.
  }
}

const exitCode = await new Promise((resolve) => {
  const poll = setInterval(() => {
    if (FILES.every((file) => isFresh(file, startedAt))) finish(0);
    else if (Date.now() - startedAt > TIMEOUT_MS) {
      console.error(
        `gen-types: timed out after ${TIMEOUT_MS / 1000}s waiting for ${FILES.join(', ')}`
      );
      finish(1);
    }
  }, 200);
  child.on('exit', (code) => {
    if (!FILES.every((file) => isFresh(file, startedAt))) {
      console.error(`gen-types: expo start exited (code ${code}) before generating types`);
      finish(1);
    }
  });
  function finish(code) {
    clearInterval(poll);
    stop();
    if (code !== 0) console.error(output);
    resolve(code);
  }
});

process.exit(exitCode);
