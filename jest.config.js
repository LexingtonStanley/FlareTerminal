const expoPreset = require('jest-expo/jest-preset');

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // A suite's first router test transforms the whole app; from a cold cache (as on CI) that
  // alone can pass the default 5 seconds.
  testTimeout: 15000,
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
    // No native side in Jest; the library ships a mock (plain View and ScrollView).
    '^react-native-keyboard-controller$':
      '<rootDir>/node_modules/react-native-keyboard-controller/jest',
    // No native WebView in Jest: a plain View that keeps its props.
    '^react-native-webview$': '<rootDir>/jest/webview-stub.js',
  },
};
