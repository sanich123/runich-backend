const baseConfig = require('./jest.config.cjs');

module.exports = {
  ...baseConfig,
  testRegex: 'src/tests/integration/.*\\.e2e-spec\\.ts$',
  setupFiles: ['<rootDir>/src/tests/integration/setup.ts'],
  collectCoverage: false,
};
