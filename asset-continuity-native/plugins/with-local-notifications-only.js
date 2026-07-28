const {
  createRunOncePlugin
} = require("expo/config-plugins");
const {
  version
} = require("expo-notifications/package.json");

/**
 * Expo prebuild applies the expo-notifications config plugin automatically
 * whenever the native module is autolinked. That plugin adds the APNs
 * entitlement even when ALYR uses only device-local notifications.
 *
 * Recording the package plugin as already handled keeps native module
 * autolinking and JavaScript local-notification APIs while deliberately
 * skipping push entitlements, custom push assets, and remote background mode.
 */
const withLocalNotificationsOnly = (config) => config;

module.exports = createRunOncePlugin(
  withLocalNotificationsOnly,
  "expo-notifications",
  version
);
