const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");
const config = getDefaultConfig(projectRoot);
const sharedPackageRoots = [
  "analytics",
  "contracts",
  "design-tokens",
  "domain",
  "fixtures"
].map((name) => path.resolve(workspaceRoot, "packages", name));
const canonicalNativeRoot = path.resolve(
  workspaceRoot,
  "asset-continuity-native"
);

// ALYR deliberately keeps SDK 54 only in this preview shell while the signed
// application stays on SDK 57. Watch only canonical product sources: watching
// the whole repository also subscribes Metro to temporary browser/build
// directories whose removal can terminate the iPhone session.
config.watchFolders = [
  ...new Set([
    ...(config.watchFolders ?? []).filter(
      (folder) => path.resolve(folder) !== workspaceRoot
    ),
    canonicalNativeRoot,
    ...sharedPackageRoots
  ])
];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules")
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
