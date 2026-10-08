/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Playwright specs live in e2e/ and run with `npm run test:e2e`, not Jest.
  testPathIgnorePatterns: ['/node_modules/', '/e2e/', '/dist/', '/.expo/'],
  moduleNameMapper: {
    '\\.css$': '<rootDir>/jest/style-stub.js',
  },
};
