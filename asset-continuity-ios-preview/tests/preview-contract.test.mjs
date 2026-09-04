import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8")
);
const configSource = await readFile(
  new URL("../app.config.ts", import.meta.url),
  "utf8"
);
const startHelperSource = await readFile(
  new URL("../START_IPHONE_PREVIEW.ps1", import.meta.url),
  "utf8"
);
const windowsLauncherSource = await readFile(
  new URL("../START_IPHONE_PREVIEW.cmd", import.meta.url),
  "utf8"
);
const metroConfigSource = await readFile(
  new URL("../metro.config.js", import.meta.url),
  "utf8"
);
const previewAttachmentStoreSource = await readFile(
  new URL("../src/data/attachmentStore.ts", import.meta.url),
  "utf8"
);
const tsconfig = JSON.parse(
  await readFile(new URL("../tsconfig.json", import.meta.url), "utf8")
);
const previewAppRoot = fileURLToPath(new URL("../app/", import.meta.url));
const nativeAppRoot = fileURLToPath(
  new URL("../../asset-continuity-native/app/", import.meta.url)
);
const nativeSourceRoot = fileURLToPath(
  new URL("../../asset-continuity-native/src/", import.meta.url)
);

async function collectRouteFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const routes = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      routes.push(...(await collectRouteFiles(root, fullPath)));
    } else if (entry.isFile() && /\.(?:ts|tsx)$/u.test(entry.name)) {
      routes.push(path.relative(root, fullPath).replaceAll(path.sep, "/"));
    }
  }
  return routes.sort();
}

test("the iPhone companion remains on the App Store Expo Go SDK", () => {
  assert.match(configSource, /name: "Heldat iPhone Preview"/u);
  assert.match(packageJson.description, /\bHeldat\b/u);
  assert.match(packageJson.dependencies.expo, /^~54\./u);
  assert.match(packageJson.devDependencies["babel-preset-expo"], /^~54\./u);
  assert.equal(
    packageJson.dependencies["react-dom"],
    packageJson.dependencies.react,
    "the visual-validation web renderer must match Expo SDK 54 React exactly"
  );
  assert.equal(packageJson.scripts["start:lan"], "expo start --go --lan");
  assert.equal(packageJson.scripts["start:iphone"], "expo start --go --lan");
});

test("the personal iPhone helper builds shared packages before Expo starts", () => {
  const buildIndex = startHelperSource.indexOf("run build:shared");
  const startIndex = startHelperSource.indexOf("run start:lan");
  assert.ok(buildIndex >= 0, "the helper must build shared packages");
  assert.ok(startIndex >= 0, "the helper must start the LAN preview");
  assert.ok(buildIndex < startIndex, "the shared build must finish before Expo");
  assert.match(
    windowsLauncherSource,
    /-ExecutionPolicy Bypass -File "%~dp0START_IPHONE_PREVIEW\.ps1"/u
  );
});

test("Metro watches product sources without volatile workspace collateral", () => {
  assert.match(metroConfigSource, /asset-continuity-native/u);
  for (const packageName of [
    "analytics",
    "contracts",
    "design-tokens",
    "domain",
    "fixtures"
  ]) {
    assert.match(metroConfigSource, new RegExp(`"${packageName}"`, "u"));
  }
  assert.match(
    metroConfigSource,
    /\.filter\(\s*\(folder\) => path\.resolve\(folder\) !== workspaceRoot/u
  );
  assert.doesNotMatch(
    metroConfigSource,
    /watchFolders\s*=\s*\[[\s\S]{0,160}workspaceRoot\s*\]/u,
    "the repository root would make transient browser/build directories fatal to Metro"
  );
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
  assert.equal(
    tsconfig.compilerOptions.paths["@/recovery"][0],
    "./src/recovery/index.ts"
  );
  assert.equal(
    tsconfig.compilerOptions.paths["@/runtime/signedSupabaseRuntime"][0],
    "./src/runtime/signedSupabaseRuntime.ts"
  );
  assert.match(
    previewAttachmentStoreSource,
    /readonly encryptedAtRest = false/u
  );
  assert.match(
    previewAttachmentStoreSource,
    /export function isVerifiedAttachmentSink/u
  );
  assert.match(
    previewAttachmentStoreSource,
    /Protected attachments open only in a Heldat signed build\./u
  );
  assert.doesNotMatch(
    previewAttachmentStoreSource,
    /async ingestVerifiedBytes/u,
    "Expo Go must not acquire a plaintext cloud-restore sink"
  );
});

test("every native module reached by the shared screens is pinned in the shell", () => {
  const required = [
    "@expo-google-fonts/ibm-plex-sans-arabic",
    "@expo-google-fonts/instrument-sans",
    "@expo/metro-runtime",
    "expo-constants",
    "expo-crypto",
    "expo-background-task",
    "expo-document-picker",
    "expo-file-system",
    "expo-font",
    "expo-image-picker",
    "expo-linking",
    "expo-local-authentication",
    "expo-location",
    "expo-notifications",
    "expo-router",
    "expo-secure-store",
    "expo-sharing",
    "expo-splash-screen",
    "expo-status-bar",
    "expo-task-manager",
    "phosphor-react-native",
    "react-native-gesture-handler",
    "react-native-reanimated",
    "react-native-safe-area-context",
    "react-native-screens",
    "react-native-svg",
    "react-native-url-polyfill",
    "react-native-worklets"
  ];
  for (const dependency of required) {
    assert.ok(
      packageJson.dependencies[dependency],
      `${dependency} must be a direct preview dependency`
    );
  }
});

test("every evaluated Expo native module resolves to the SDK 54 preview copy", async () => {
  const previewRoot = fileURLToPath(new URL("../", import.meta.url));
  const bundledVersions = JSON.parse(
    await readFile(
      new URL(
        "../node_modules/expo/bundledNativeModules.json",
        import.meta.url
      ),
      "utf8"
    )
  );
  const evaluatedModules = [
    "expo-background-task",
    "expo-task-manager",
    "expo-notifications"
  ];

  for (const moduleName of evaluatedModules) {
    const modulePackageUrl = new URL(
      `../node_modules/${moduleName}/package.json`,
      import.meta.url
    );
    const modulePackagePath = fileURLToPath(modulePackageUrl);
    assert.ok(
      modulePackagePath.startsWith(
        path.join(previewRoot, "node_modules", moduleName)
      ),
      `${moduleName} must resolve inside the SDK 54 companion`
    );
    const modulePackage = JSON.parse(
      await readFile(modulePackageUrl, "utf8")
    );
    const expected = bundledVersions[moduleName];
    assert.ok(expected, `${moduleName} must be part of Expo SDK 54`);
    assert.equal(
      `~${modulePackage.version}`,
      expected,
      `${moduleName} must match Expo SDK 54's bundled native version`
    );
  }
});

test("Expo Go bypasses device-auth prompts while signed native keeps the vault sealed", async () => {
  const runtimeSource = await readFile(
    path.join(nativeSourceRoot, "runtime/environment.ts"),
    "utf8"
  );
  const providerSource = await readFile(
    path.join(nativeSourceRoot, "deviceAuth/DeviceAuthProvider.tsx"),
    "utf8"
  );
  const vaultBoundarySource = await readFile(
    path.join(nativeSourceRoot, "state/SessionBoundWorkspaceProvider.tsx"),
    "utf8"
  );
  const layoutSource = await readFile(
    path.join(nativeAppRoot, "_layout.tsx"),
    "utf8"
  );

  assert.equal(
    packageJson.dependencies["expo-local-authentication"],
    "17.0.8"
  );
  assert.match(configSource, /alyrRuntime: "expo-go-preview"/u);
  assert.match(
    runtimeSource,
    /if \(expoGo\) \{\s*return "expo-go-preview";\s*\}/u
  );
  assert.match(
    providerSource,
    /profile === "native-secure"/u,
    "only a signed native profile may require device authentication"
  );
  assert.match(
    providerSource,
    /profile === "expo-go-preview" \|\| profile === "web-preview"/u
  );
  assert.match(
    providerSource,
    /if \(!requiresUnlock \|\| state\.phase !== "checking"\) return;/u,
    "preview must never assess biometric capability"
  );
  assert.match(
    providerSource,
    /!requiresUnlock \|\|\s*state\.phase !== "locked"/u,
    "preview must never open a biometric or passcode prompt"
  );
  assert.match(
    vaultBoundarySource,
    /access\?\.kind === "authenticated" && !deviceAuthReleased/u
  );
  assert.match(
    layoutSource,
    /deviceAuth\.requiresUnlock && !deviceAuth\.vaultReleased/u
  );
});

test("the SDK 54 recovery boundary excludes signed-build crypto and file adapters", async () => {
  const recoverySource = await readFile(
    new URL("../src/recovery/index.ts", import.meta.url),
    "utf8"
  );
  assert.match(recoverySource, /recovery\/journey/u);
  assert.match(recoverySource, /recovery\/uiMessages/u);
  assert.match(
    recoverySource,
    /export function createSignedRecoveryJourneyRuntime/u,
    "the preview must mirror the factory consumed by WorkspaceProvider"
  );
  assert.match(
    recoverySource,
    /export async function resolveInterruptedRecoveryRestore/u,
    "the preview must mirror the canonical startup recovery hook"
  );
  assert.match(
    recoverySource,
    /return "none";/u,
    "the memory-only preview has no durable restore journal to reconcile"
  );
  assert.match(
    recoverySource,
    /return createUnavailableRecoveryRuntime\(dependencies\.profile\)/u,
    "the mirrored factory must stay visibly fail-closed"
  );
  assert.doesNotMatch(
    recoverySource,
    /signedRuntime|expoCrypto|nativeFiles|atomicRestore|workspaceExport/u
  );
});

test("the preview follows the Quiet Precision visual contract", () => {
  assert.equal(packageJson.dependencies["@expo-google-fonts/dm-sans"], undefined);
  assert.equal(packageJson.dependencies["@expo-google-fonts/manrope"], undefined);
  assert.equal(packageJson.dependencies["expo-linear-gradient"], undefined);
  assert.match(configSource, /userInterfaceStyle: "light"/u);
  assert.match(configSource, /backgroundColor: "#F6F7F3"/u);
  assert.match(configSource, /supportsTablet: false/u);
});

test("the preview mirrors the four-tab IA and keeps Search off the tab bar", async () => {
  const tabLayoutSource = await readFile(
    new URL("../app/(tabs)/_layout.tsx", import.meta.url),
    "utf8"
  );
  const searchTabSource = await readFile(
    new URL("../app/(tabs)/search.tsx", import.meta.url),
    "utf8"
  );
  const familyTabSource = await readFile(
    new URL("../app/(tabs)/family.tsx", import.meta.url),
    "utf8"
  );
  const nativeTabLayoutSource = await readFile(
    path.join(nativeAppRoot, "(tabs)", "_layout.tsx"),
    "utf8"
  );
  assert.match(searchTabSource, /native\/app\/\(tabs\)\/search/u);
  assert.match(familyTabSource, /native\/app\/\(tabs\)\/family/u);
  assert.match(tabLayoutSource, /native\/app\/\(tabs\)\/_layout/u);
  for (const route of ["index", "assets", "family", "vault"]) {
    assert.match(nativeTabLayoutSource, new RegExp(`name="${route}"`, "u"));
  }
  assert.match(
    nativeTabLayoutSource,
    /name="search"[\s\S]*?href:\s*null/u
  );
  await assert.rejects(access(new URL("../app/search.tsx", import.meta.url)));
  await assert.rejects(access(new URL("../app/family.tsx", import.meta.url)));
});

test("the free iPhone shell mirrors every canonical native route", async () => {
  const nativeRoutes = await collectRouteFiles(nativeAppRoot);
  const previewRoutes = await collectRouteFiles(previewAppRoot);
  assert.deepEqual(previewRoutes, nativeRoutes);
  assert.ok(previewRoutes.includes("recovery-create.tsx"));
  assert.ok(previewRoutes.includes("recovery-import.tsx"));

  for (const route of nativeRoutes) {
    const previewFile = path.join(previewAppRoot, route);
    const nativeFile = path.join(nativeAppRoot, route);
    let canonicalImport = path
      .relative(path.dirname(previewFile), nativeFile)
      .replaceAll(path.sep, "/")
      .replace(/\.(?:ts|tsx)$/u, "");
    if (!canonicalImport.startsWith(".")) canonicalImport = `./${canonicalImport}`;
    const source = (await readFile(previewFile, "utf8")).trim();
    assert.equal(
      source,
      `export { default } from "${canonicalImport}";`,
      `${route} must re-export its matching canonical native route`
    );
  }
});
