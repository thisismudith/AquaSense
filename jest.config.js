/** Two projects: pure-logic/DB tests run in Node; UI tests run with the jest-expo RN preset. */
const alias = { '^@/(.*)$': '<rootDir>/src/$1' };
module.exports = {
  projects: [
    {
      displayName: 'node',
      preset: 'jest-expo',
      testEnvironment: 'node',
      moduleNameMapper: alias,
      testMatch: ['unit', 'database', 'bluetooth', 'integration'].map((d) => `<rootDir>/tests/${d}/**/*.test.ts`),
    },
    {
      displayName: 'ui',
      preset: 'jest-expo',
      moduleNameMapper: alias,
      testMatch: ['<rootDir>/tests/ui/**/*.test.tsx'],
    },
  ],
};
