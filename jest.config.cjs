module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts', 'tsx'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
  moduleNameMapper: {
    '^@nestjs/throttler$': '<rootDir>/tests/mocks/nestjs-throttler.ts',
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/infrastructure/database/**',
    '!src/**/*.module.ts',
    '!src/app/**',
    // The stage-only worker is exercised against the disposable Railway database.
    '!src/load-test/load-test.service.ts',
    '!src/main.ts',
    '!src/**/*.d.ts',
    '!src/tests/integration/**',
    '!src/**/*.spec.ts',
  ],
  coverageDirectory: '../coverage',
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },
  testEnvironment: 'node',
};
