const baseConfig = require('./jest.config.cjs');

module.exports = {
  ...baseConfig,
  testRegex: 'integration/.*\\.e2e-spec\\.ts$',
  setupFiles: ['<rootDir>/integration/setup.ts'],
  collectCoverage: false,
};
