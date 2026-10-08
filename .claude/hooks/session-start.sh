#!/bin/bash
# Claude Code cloud sessions start from a fresh clone. Install dependencies so
# `npm run check` (typecheck, lint, format, Jest, Playwright web tests) works at once.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# `npm install` rather than `npm ci`: it reuses the cached node_modules between sessions.
npm install --no-audit --no-fund

# playwright.config.ts uses the container's preinstalled Chromium when it exists.
# Download Playwright's own build only when the container doesn't ship one.
if [ ! -e /opt/pw-browsers/chromium ]; then
  npx playwright install chromium
fi
