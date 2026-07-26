import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8")
);
const configSource = await readFile(
  new URL("../app.config.ts", import.meta.url),
  "utf8"
);
const tsconfig = JSON.parse(
  await readFile(new URL("../tsconfig.json", import.meta.url), "utf8")
);

test("the iPhone companion remains on the App Store Expo Go SDK", () => {
  assert.match(packageJson.dependencies.expo, /^~54\./u);
  assert.match(packageJson.devDependencies["babel-preset-expo"], /^~54\./u);
  assert.equal(packageJson.scripts["start:lan"], "expo start --go --lan");
});

test("the preview is explicitly session-only and cannot select secure adapters", () => {
  assert.match(configSource, /dataPolicy: "session-only"/u);
  assert.equal(
    tsconfig.compilerOptions.paths["@/data/attachmentStore"][0],
    "./src/data/attachmentStore.ts"
  );
  assert.equal(
    tsconfig.compilerOptions.paths["@/data/createRepository"][0],
    "./src/data/createRepository.ts"
  );
});

test("every native module reached by the shared screens is pinned in the shell", () => {
  const required = [
    "@expo/metro-runtime",
    "expo-constants",
    "expo-crypto",
    "expo-document-picker",
    "expo-file-system",
    "expo-font",
    "expo-image-picker",
    "expo-linear-gradient",
    "expo-linking",
    "expo-local-authentication",
    "expo-location",
    "expo-router",
    "expo-sharing",
    "expo-splash-screen",
    "expo-status-bar",
    "phosphor-react-native",
    "react-native-gesture-handler",
    "react-native-reanimated",
    "react-native-safe-area-context",
    "react-native-screens",
    "react-native-svg",
    "react-native-worklets"
  ];
  for (const dependency of required) {
    assert.ok(
      packageJson.dependencies[dependency],
      `${dependency} must be a direct preview dependency`
    );
  }
});
