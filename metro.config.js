// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);

// @xterm/headless 6.0.0's package.json "module" field names a file the package doesn't
// ship (lib/xterm.mjs), and web builds read "module" first. Point at its real entry.
const XTERM_HEADLESS = path.join(
  path.dirname(require.resolve('@xterm/headless/package.json')),
  'lib-headless/xterm-headless.js'
);
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@xterm/headless') return { type: 'sourceFile', filePath: XTERM_HEADLESS };
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

// Git worktrees that coding agents create inside the repo hold a second copy of the app.
config.resolver.blockList = [
  ...[config.resolver.blockList].flat().filter(Boolean),
  /[/\\]\.claude[/\\]worktrees[/\\].*/,
];

module.exports = config;
