import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const require = createRequire(import.meta.url);
const expoCli = require.resolve("expo/bin/cli");
const {
  ANDROID_RELEASE_PERMISSION_ALLOWLIST,
  ANDROID_RELEASE_PERMISSION_DENYLIST,
  DEVELOPMENT_SCHEME_PREFIX,
  GOOGLE_MAPS_METADATA_NAME,
  HELDAT_ANDROID_APPLICATION_ID,
  HELDAT_NATIVE_SCHEME,
  NETWORK_INSPECTOR_GRADLE_PROPERTY
} = require("../plugins/with-production-android-release");
const configCheckGoogleMapsApiKey =
  process.env.GOOGLE_MAPS_ANDROID_API_KEY ??
  `AIza${"A".repeat(35)}`;
const result = spawnSync(
  process.execPath,
  [expoCli, "config", "--type", "introspect", "--json"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "production",
      EAS_BUILD_PROFILE: "production",
      EAS_BUILD_PLATFORM: "android",
      GOOGLE_MAPS_ANDROID_API_KEY:
        configCheckGoogleMapsApiKey
    },
    maxBuffer: 16 * 1024 * 1024
  }
);

if (result.error || result.status !== 0) {
  process.stderr.write(
    result.error?.message ??
      result.stderr ??
      result.stdout ??
      "Expo production config introspection failed."
  );
  process.exit(result.status ?? 1);
}

const config = JSON.parse(result.stdout);
const ios = config?._internal?.modResults?.ios;
const android = config?._internal?.modResults?.android;
const infoPlist = ios?.infoPlist ?? {};
const entitlements = ios?.entitlements ?? {};
const podfileProperties = ios?.podfileProperties ?? {};
const privacy = config?.ios?.privacyManifests ?? {};
const autolinkedModules =
  config?._internal?.autolinkedModules ?? [];
const webBrowserPlugin = (config?.plugins ?? []).find(
  (entry) =>
    Array.isArray(entry) && entry[0] === "expo-web-browser"
);
const urlSchemes = (infoPlist.CFBundleURLTypes ?? []).flatMap(
  (entry) => entry?.CFBundleURLSchemes ?? []
);
const backgroundModes = [...(infoPlist.UIBackgroundModes ?? [])].sort();
const backgroundTaskIdentifiers = [
  ...(infoPlist.BGTaskSchedulerPermittedIdentifiers ?? [])
].sort();
const transportSecurity = infoPlist.NSAppTransportSecurity ?? {};
const androidManifest = android?.manifest?.manifest;
const androidApplication = androidManifest?.application?.[0];
const androidPermissions =
  androidManifest?.["uses-permission"] ?? [];
const activeAndroidPermissions = androidPermissions
  .filter(
    (permission) =>
      permission?.$?.["tools:node"] !== "remove"
  )
  .map((permission) => permission?.$?.["android:name"])
  .filter((name) => typeof name === "string");
const removedAndroidPermissions = new Set(
  androidPermissions
    .filter(
      (permission) =>
        permission?.$?.["tools:node"] === "remove"
    )
    .map((permission) => permission?.$?.["android:name"])
    .filter((name) => typeof name === "string")
);
const androidSchemes = (
  androidApplication?.activity ?? []
).flatMap((activity) =>
  (activity?.["intent-filter"] ?? []).flatMap((intentFilter) =>
    (intentFilter?.data ?? [])
      .map((entry) => entry?.$?.["android:scheme"])
      .filter((scheme) => typeof scheme === "string")
  )
);
const androidAppLinks = (
  androidApplication?.activity ?? []
).flatMap((activity) =>
  (activity?.["intent-filter"] ?? []).flatMap((intentFilter) =>
    (intentFilter?.data ?? [])
      .filter(
        (entry) =>
          entry?.$?.["android:scheme"] === "https" &&
          entry?.$?.["android:host"] === "heldat.app"
      )
      .map((entry) => ({
        pathPrefix: entry?.$?.["android:pathPrefix"],
        autoVerify: intentFilter?.$?.["android:autoVerify"]
      }))
  )
);
const googleMapsMetadata = (
  androidApplication?.["meta-data"] ?? []
).find(
  (entry) =>
    entry?.$?.["android:name"] ===
    GOOGLE_MAPS_METADATA_NAME
);
const networkInspectorProperties = (
  android?.gradleProperties ?? []
).filter(
  (entry) =>
    entry?.type === "property" &&
    entry?.key === NETWORK_INSPECTOR_GRADLE_PROPERTY
);
const expectedCollectedDataTypes = [
  "NSPrivacyCollectedDataTypeEmailAddress",
  "NSPrivacyCollectedDataTypeUserID",
  "NSPrivacyCollectedDataTypeDeviceID",
  "NSPrivacyCollectedDataTypePhysicalAddress",
  "NSPrivacyCollectedDataTypePreciseLocation",
  "NSPrivacyCollectedDataTypeCoarseLocation",
  "NSPrivacyCollectedDataTypeOtherFinancialInfo",
  "NSPrivacyCollectedDataTypePhotosorVideos",
  "NSPrivacyCollectedDataTypeOtherUserContent",
  "NSPrivacyCollectedDataTypeOtherDiagnosticData",
  "NSPrivacyCollectedDataTypeProductInteraction"
];
const expectedRequiredReasonApis = {
  NSPrivacyAccessedAPICategoryFileTimestamp: ["C617.1", "3B52.1"],
  NSPrivacyAccessedAPICategoryDiskSpace: ["E174.1", "85F4.1"],
  NSPrivacyAccessedAPICategorySystemBootTime: ["35F9.1"],
  NSPrivacyAccessedAPICategoryUserDefaults: ["CA92.1"]
};

invariant(ios, "Production iOS mod results were not generated.");
invariant(
  android && androidManifest,
  "Production Android mod results were not generated."
);
invariant(
  config?.ios?.bundleIdentifier === HELDAT_ANDROID_APPLICATION_ID,
  "Production iOS config resolved an unexpected bundle identifier."
);
invariant(
  config?.runtimeVersion?.policy === "appVersion",
  "Production runtime version is not scoped to the app version."
);
invariant(
  config?.updates?.enabled === false &&
    config?.updates?.checkAutomatically === "NEVER" &&
    !("url" in (config?.updates ?? {})),
  "Production remote updates must stay disabled and omit the update URL."
);
invariant(
  autolinkedModules.includes("expo-web-browser") &&
    webBrowserPlugin?.[1]?.experimentalLauncherActivity === false,
  "Production Google OAuth is missing the reviewed Expo WebBrowser bridge."
);
invariant(
  !("NSBonjourServices" in infoPlist),
  "Production iOS config still advertises Expo Bonjour discovery."
);
invariant(
  !("NSLocalNetworkUsageDescription" in infoPlist),
  "Production iOS config still requests development local-network access."
);
invariant(
  urlSchemes.includes(HELDAT_NATIVE_SCHEME),
  "Production iOS config is missing the Heldat deep-link scheme."
);
invariant(
  urlSchemes.includes(HELDAT_ANDROID_APPLICATION_ID),
  "Production iOS config is missing its bundle URL scheme."
);
invariant(
  JSON.stringify(entitlements["com.apple.developer.associated-domains"]) ===
    JSON.stringify(["applinks:heldat.app"]),
  "Production iOS config is missing the reviewed heldat.app associated domain."
);
invariant(
  !urlSchemes.some((scheme) => scheme.startsWith("exp+")),
  "Production iOS config still exposes an Expo development URL scheme."
);
invariant(
  transportSecurity.NSAllowsArbitraryLoads === false &&
    transportSecurity.NSAllowsLocalNetworking === false,
  "Production iOS transport security must reject arbitrary and local-network loads."
);
invariant(
  JSON.stringify(backgroundModes) ===
    JSON.stringify(["fetch", "processing"]),
  `Unexpected production background modes: ${backgroundModes.join(", ")}`
);
invariant(
  JSON.stringify(backgroundTaskIdentifiers) ===
    JSON.stringify(["com.expo.modules.backgroundtask.processing"]),
  `Unexpected production background task identifiers: ${backgroundTaskIdentifiers.join(", ")}`
);
invariant(
  !("aps-environment" in entitlements),
  "Local-notifications-only release unexpectedly contains an APNs entitlement."
);
invariant(
  infoPlist.ITSAppUsesNonExemptEncryption === false,
  "Production iOS export-compliance declaration is missing or unexpected."
);
invariant(
  podfileProperties["expo.sqlite.useSQLCipher"] === "true",
  "Production iOS config does not enable SQLCipher."
);
invariant(
  config?.android?.package === HELDAT_ANDROID_APPLICATION_ID,
  "Production Android config resolved an unexpected package identifier."
);
invariant(
  config?.android?.config?.googleMaps?.apiKey ===
    configCheckGoogleMapsApiKey &&
    googleMapsMetadata?.$?.["android:value"] ===
      configCheckGoogleMapsApiKey,
  "Production Android Google Maps key was not propagated to manifest metadata."
);
invariant(
  androidSchemes.includes(HELDAT_NATIVE_SCHEME),
  "Production Android config is missing the Heldat deep-link scheme."
);
invariant(
  JSON.stringify(androidAppLinks) ===
    JSON.stringify([
      { pathPrefix: "/join", autoVerify: "true" },
      { pathPrefix: "/callback", autoVerify: "true" },
      {
        pathPrefix: "/reset-password",
        autoVerify: "true"
      }
    ]),
  "Production Android config is missing the verified heldat.app link paths."
);
invariant(
  !androidSchemes.some((scheme) =>
    scheme.startsWith(DEVELOPMENT_SCHEME_PREFIX)
  ),
  "Production Android config still exposes an Expo development URL scheme."
);
invariant(
  networkInspectorProperties.length === 1 &&
    networkInspectorProperties[0].value === "false",
  "Production Android config must disable the Expo dev-client network inspector."
);
const releasePermissionAllowlist = new Set(
  ANDROID_RELEASE_PERMISSION_ALLOWLIST
);
invariant(
  activeAndroidPermissions.every((permission) =>
    releasePermissionAllowlist.has(permission)
  ),
  `Production Android config contains unreviewed active permissions: ${activeAndroidPermissions
    .filter(
      (permission) =>
        !releasePermissionAllowlist.has(permission)
    )
    .join(", ")}`
);
invariant(
  ANDROID_RELEASE_PERMISSION_DENYLIST.every((permission) =>
    removedAndroidPermissions.has(permission)
  ),
  "Production Android config is missing a manifest-merger removal marker for a denied permission."
);
invariant(
  !activeAndroidPermissions.includes(
    "android.permission.SYSTEM_ALERT_WINDOW"
  ),
  "Production Android config still requests the Expo development overlay permission."
);
invariant(
  !activeAndroidPermissions.includes(
    "com.google.android.c2dm.permission.RECEIVE"
  ),
  "Local-notifications-only Android config still requests remote push delivery."
);
invariant(
  !activeAndroidPermissions.includes(
    "com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE"
  ),
  "Production Android config still requests install attribution access."
);
invariant(
  infoPlist.NSCameraUsageDescription?.includes("Heldat"),
  "Production iOS camera purpose string is missing."
);
invariant(
  infoPlist.NSFaceIDUsageDescription?.includes("Heldat"),
  "Production iOS Face ID purpose string is missing."
);
invariant(
  infoPlist.NSLocationWhenInUseUsageDescription?.includes("Heldat"),
  "Production iOS location purpose string is missing."
);
invariant(
  !("NSMicrophoneUsageDescription" in infoPlist),
  "Production iOS config unexpectedly requests microphone access."
);
invariant(
  !("NSLocationAlwaysUsageDescription" in infoPlist) &&
    !("NSLocationAlwaysAndWhenInUseUsageDescription" in infoPlist),
  "Production iOS config unexpectedly requests background location access."
);
invariant(
  privacy.NSPrivacyTracking === false,
  "Production privacy manifest must declare tracking disabled."
);
invariant(
  Array.isArray(privacy.NSPrivacyTrackingDomains) &&
    privacy.NSPrivacyTrackingDomains.length === 0,
  "Production privacy manifest must not declare tracking domains."
);
const collectedDataTypes = privacy.NSPrivacyCollectedDataTypes ?? [];
invariant(
  JSON.stringify(
    collectedDataTypes.map((entry) => entry.NSPrivacyCollectedDataType)
  ) === JSON.stringify(expectedCollectedDataTypes),
  "Production privacy manifest collected-data categories changed without release review."
);
invariant(
  collectedDataTypes.every((entry) => {
    const productInteraction =
      entry.NSPrivacyCollectedDataType ===
      "NSPrivacyCollectedDataTypeProductInteraction";
    return (
      entry.NSPrivacyCollectedDataTypeLinked === true &&
      entry.NSPrivacyCollectedDataTypeTracking === false &&
      JSON.stringify(entry.NSPrivacyCollectedDataTypePurposes) ===
        JSON.stringify([
          productInteraction
            ? "NSPrivacyCollectedDataTypePurposeAnalytics"
            : "NSPrivacyCollectedDataTypePurposeAppFunctionality"
        ])
    );
  }),
  "Production privacy manifest linkage, tracking, or purpose declarations changed."
);
const requiredReasonApis = Object.fromEntries(
  (privacy.NSPrivacyAccessedAPITypes ?? []).map((entry) => [
    entry.NSPrivacyAccessedAPIType,
    entry.NSPrivacyAccessedAPITypeReasons
  ])
);
invariant(
  JSON.stringify(requiredReasonApis) ===
    JSON.stringify(expectedRequiredReasonApis),
  "Production privacy manifest required-reason API declarations changed without release review."
);

console.log(
  "Production native config passed: iOS privacy/security and Android Maps, permission, deep-link, network-inspector, and local-notifications-only release policies verified."
);
