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
const result = spawnSync(
  process.execPath,
  [expoCli, "config", "--type", "introspect", "--json"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "production",
      EAS_BUILD_PROFILE: "production"
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
const infoPlist = ios?.infoPlist ?? {};
const entitlements = ios?.entitlements ?? {};
const podfileProperties = ios?.podfileProperties ?? {};
const privacy = config?.ios?.privacyManifests ?? {};
const urlSchemes = (infoPlist.CFBundleURLTypes ?? []).flatMap(
  (entry) => entry?.CFBundleURLSchemes ?? []
);
const backgroundModes = [...(infoPlist.UIBackgroundModes ?? [])].sort();
const backgroundTaskIdentifiers = [
  ...(infoPlist.BGTaskSchedulerPermittedIdentifiers ?? [])
].sort();
const transportSecurity = infoPlist.NSAppTransportSecurity ?? {};
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
  config?.ios?.bundleIdentifier === "com.alyr.continuity",
  "Production iOS config resolved an unexpected bundle identifier."
);
invariant(
  config?.runtimeVersion?.policy === "appVersion",
  "Production runtime version is not scoped to the app version."
);
invariant(
  config?.updates?.url ===
    "https://u.expo.dev/85cab1f2-111f-4e20-abd5-8dff0df2fabb",
  "Production EAS Update URL does not match the linked ALYR project."
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
  urlSchemes.includes("alyr"),
  "Production iOS config is missing the alyr deep-link scheme."
);
invariant(
  urlSchemes.includes("com.alyr.continuity"),
  "Production iOS config is missing its bundle URL scheme."
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
  infoPlist.NSCameraUsageDescription?.includes("ALYR"),
  "Production iOS camera purpose string is missing."
);
invariant(
  infoPlist.NSFaceIDUsageDescription?.includes("ALYR"),
  "Production iOS Face ID purpose string is missing."
);
invariant(
  infoPlist.NSLocationWhenInUseUsageDescription?.includes("ALYR"),
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
  "Production iOS config passed: identity/update linkage, ATS, background tasks, export compliance, SQLCipher, privacy, purpose strings, and local-notifications-only entitlements verified."
);
