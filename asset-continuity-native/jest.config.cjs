module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["<rootDir>/tests/**/*.test.{ts,tsx}"],
  moduleNameMapper: {
    // Root dependency alignment hoists the SDK 57 app's React 19.2.3 instance.
    // Keep every renderer test on that single copy.
    "^react$": "<rootDir>/../node_modules/react",
    "^react/(.*)$": "<rootDir>/../node_modules/react/$1",
    "^react-test-renderer$":
      "<rootDir>/node_modules/react-test-renderer",
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@alyr/contracts$": "<rootDir>/../packages/contracts/dist/index.js",
    "^@alyr/domain$": "<rootDir>/../packages/domain/dist/index.js",
    "^@alyr/design-tokens$":
      "<rootDir>/../packages/design-tokens/dist/index.js",
    "^@alyr/analytics$": "<rootDir>/../packages/analytics/dist/index.js",
    "^@alyr/fixtures$": "<rootDir>/../packages/fixtures/dist/index.js"
  },
  // Noble Hashes v2 is ESM-only. Metro compiles it for the installed app; make
  // Jest Expo exercise the same audited Argon2id source rather than replacing
  // the KDF with a test-only stub.
  transformIgnorePatterns: [
    "\\\\node_modules\\\\(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry\\\\react-native|native-base|standard-navigation|@noble))",
    "\\\\node_modules\\\\react-native-reanimated\\\\plugin\\\\",
    "\\\\node_modules\\\\@react-native\\\\babel-preset\\\\"
  ],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/data/createRepository.*"
  ]
};
