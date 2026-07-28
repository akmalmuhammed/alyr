const { withInfoPlist } = require("expo/config-plugins");

/**
 * expo-dev-client is installed for local development builds. Its automatic
 * config plugin adds Bonjour discovery and an exp+ URL scheme even when Expo
 * resolves a production archive. ALYR removes those development-only entries
 * unless the selected build profile explicitly allows local networking.
 */
module.exports = function withProductionNetworkPrivacy(
  config,
  { allowLocalNetworking = false } = {}
) {
  return withInfoPlist(config, (resolved) => {
    if (allowLocalNetworking) {
      return resolved;
    }

    delete resolved.modResults.NSBonjourServices;
    delete resolved.modResults.NSLocalNetworkUsageDescription;

    const urlTypes = resolved.modResults.CFBundleURLTypes;
    if (Array.isArray(urlTypes)) {
      resolved.modResults.CFBundleURLTypes = urlTypes
        .map((entry) => {
          if (!entry || !Array.isArray(entry.CFBundleURLSchemes)) {
            return entry;
          }
          return {
            ...entry,
            CFBundleURLSchemes: entry.CFBundleURLSchemes.filter(
              (scheme) =>
                typeof scheme !== "string" || !scheme.startsWith("exp+")
            )
          };
        })
        .filter(
          (entry) =>
            !entry ||
            !Array.isArray(entry.CFBundleURLSchemes) ||
            entry.CFBundleURLSchemes.length > 0
        );
    }

    return resolved;
  });
};
