import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const repositoryRoot = path.resolve(appRoot, "..");
const sharedPackages = [
  "analytics",
  "contracts",
  "design-tokens",
  "domain",
  "fixtures"
];

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

const nativePackage = await readJson(
  path.join(appRoot, "package.json")
);
assert.equal(
  nativePackage.scripts?.postinstall,
  "npm run build:shared",
  "The native workspace must rebuild shared packages after a clean install."
);
assert.equal(
  nativePackage.scripts?.["build:shared"],
  "npm --prefix .. run build:shared",
  "The native clean-install hook must delegate to the monorepo build."
);
assert.equal(
  nativePackage.dependencies?.["@noble/hashes"],
  "^2.2.0",
  "The signed Recovery Kit must pin its reviewed Argon2id dependency range."
);
assert.match(
  nativePackage.dependencies?.["expo-auth-session"] ?? "",
  /^~57\./u,
  "The Google OAuth PKCE bridge must use the SDK 57 AuthSession line."
);
assert.match(
  nativePackage.dependencies?.["expo-web-browser"] ?? "",
  /^~57\./u,
  "The Google OAuth PKCE bridge must use the SDK 57 WebBrowser line."
);

for (const directoryName of sharedPackages) {
  const packageRoot = path.join(
    repositoryRoot,
    "packages",
    directoryName
  );
  const manifest = await readJson(path.join(packageRoot, "package.json"));
  assert.equal(
    manifest.main,
    "./dist/index.js",
    `${manifest.name} must keep one canonical compiled entry point.`
  );
  assert.equal(
    manifest.exports?.["."]?.import,
    "./dist/index.js",
    `${manifest.name} must export its compiled JavaScript entry point.`
  );
  assert.equal(
    manifest.exports?.["."]?.types,
    "./dist/index.d.ts",
    `${manifest.name} must export its compiled declaration entry point.`
  );

  const javascriptEntry = path.join(packageRoot, "dist", "index.js");
  const declarationEntry = path.join(packageRoot, "dist", "index.d.ts");
  await Promise.all([
    access(javascriptEntry),
    access(declarationEntry)
  ]);

  await import(
    `${pathToFileURL(javascriptEntry).href}?eas-package-check=${Date.now()}`
  );
}

const { argon2idAsync } = await import("@noble/hashes/argon2.js");
assert.equal(
  typeof argon2idAsync,
  "function",
  "The clean EAS install must resolve the Recovery Kit Argon2id entry point."
);

console.log(
  `Verified ${sharedPackages.length} compiled ALYR workspace packages and the signed Recovery Kit Argon2id entry point for clean EAS packaging.`
);
