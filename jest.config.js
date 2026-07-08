// jest.config.js - Root configuration for monorepo
module.exports = {
  projects: [
    '<rootDir>/apps/api/jest.config.js',
    '<rootDir>/apps/web/jest.config.js',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
};
