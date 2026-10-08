const expoPreset = require('jest-expo/jest-preset');

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Playwright specs live in e2e/ and run with `npm run test:e2e`, not Jest.
  testPathIgnorePatterns: ['/node_modules/', '/e2e/', '/dist/', '/.expo/', '/.claude/worktrees/'],
  // Agent worktrees hold a second copy of the app; keep Jest's module map to this one.
  modulePathIgnorePatterns: ['<rootDir>/.claude/worktrees/'],
  // The noble crypto packages ship ES modules only; let Babel transform them too.
  transformIgnorePatterns: expoPreset.transformIgnorePatterns.map((pattern) =>
    pattern.replace('/node_modules/(?!(', '/node_modules/(?!(@noble|')
  ),
  moduleNameMapper: {
    '\\.css$': '<rootDir>/jest/style-stub.js',
  },
};
