module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts', 'tsx'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/infrastructure/database/**',
    '!src/**/*.module.ts',
    '!src/app/**',
    '!src/main.ts',
    '!src/**/*.d.ts',
    '!src/tests/integration/**',
    '!src/**/*.spec.ts',
  ],
  coverageDirectory: '../coverage',
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  testEnvironment: 'node',
};
