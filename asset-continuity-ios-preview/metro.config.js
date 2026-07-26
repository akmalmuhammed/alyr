const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");
const config = getDefaultConfig(projectRoot);

// ALYR deliberately keeps SDK 54 only in this preview shell while the signed
// application stays on SDK 57. Resolve Expo and React from this shell first.
config.watchFolders = [
  ...new Set([...(config.watchFolders ?? []), workspaceRoot])
];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules")
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
