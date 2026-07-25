module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["<rootDir>/tests/**/*.test.{ts,tsx}"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@alyr/contracts$": "<rootDir>/../packages/contracts/dist/index.js",
    "^@alyr/domain$": "<rootDir>/../packages/domain/dist/index.js",
    "^@alyr/design-tokens$":
      "<rootDir>/../packages/design-tokens/dist/index.js",
    "^@alyr/analytics$": "<rootDir>/../packages/analytics/dist/index.js",
    "^@alyr/fixtures$": "<rootDir>/../packages/fixtures/dist/index.js"
  },
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/data/createRepository.*"
  ]
};
