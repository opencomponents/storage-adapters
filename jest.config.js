/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'packages',
  coverageDirectory: './coverage/',
  collectCoverage: true
};
