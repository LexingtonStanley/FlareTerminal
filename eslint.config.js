// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  globalIgnores([
    'dist/*',
    '.expo/*',
    'expo-env.d.ts',
    'coverage/*',
    'playwright-report/*',
    'test-results/*',
    'ios/*',
    'android/*',
    // Git worktrees that coding agents create inside the repo.
    '.claude/worktrees/*',
  ]),
  expoConfig,
  eslintPluginPrettierRecommended,
]);
