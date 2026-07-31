const {
  withAndroidManifest,
  withGradleProperties
} = require("expo/config-plugins");

const GOOGLE_MAPS_METADATA_NAME =
  "com.google.android.geo.API_KEY";
const HELDAT_ANDROID_APPLICATION_ID = "app.heldat.mobile";
const HELDAT_NATIVE_SCHEME = "heldat";
const DEVELOPMENT_SCHEME_PREFIX = "exp+";
const NETWORK_INSPECTOR_GRADLE_PROPERTY =
  "EX_DEV_CLIENT_NETWORK_INSPECTOR";
/**
 * expo-notifications compiles Firebase Messaging on Android even when Heldat
 * uses only on-device schedules. Production removes its remote delivery and
 * auto-initialization entry points while retaining NotificationsService and
 * NotificationForwarderActivity, which serve local notification behavior.
 * The compile-time Firebase dependency remains an SDK-review item until Expo
 * offers a local-only Android artifact or Heldat adopts a smaller native port.
 */
const ANDROID_REMOTE_NOTIFICATION_SERVICE_DENYLIST = Object.freeze([
  "com.google.android.datatransport.runtime.backends.TransportBackendDiscovery",
  "com.google.android.datatransport.runtime.scheduling.jobscheduling.JobInfoSchedulerService",
  "com.google.firebase.components.ComponentDiscoveryService",
  "com.google.firebase.messaging.FirebaseMessagingService",
  "expo.modules.notifications.service.ExpoFirebaseMessagingService"
]);
const ANDROID_REMOTE_NOTIFICATION_RECEIVER_DENYLIST = Object.freeze([
  "com.google.android.datatransport.runtime.scheduling.jobscheduling.AlarmManagerSchedulerBroadcastReceiver",
  "com.google.firebase.iid.FirebaseInstanceIdReceiver"
]);
const ANDROID_REMOTE_NOTIFICATION_PROVIDER_DENYLIST = Object.freeze([
  "com.google.firebase.provider.FirebaseInitProvider"
]);

/**
 * Permissions reviewed for Heldat's focused Android release. This list covers
 * the application manifest plus the local notification/background-task
 * permissions expected from linked libraries. Any new direct permission added
 * by an Expo config plugin makes production introspection fail until reviewed.
 */
const ANDROID_RELEASE_PERMISSION_ALLOWLIST = Object.freeze([
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_NETWORK_STATE",
  "android.permission.CAMERA",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
  "android.permission.INTERNET",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.RECEIVE_BOOT_COMPLETED",
  "android.permission.USE_BIOMETRIC",
  "android.permission.USE_FINGERPRINT",
  "android.permission.VIBRATE",
  "android.permission.WAKE_LOCK"
]);

/**
 * Release-denied permissions are emitted as manifest-merger removal markers.
 * That prevents autolinked library manifests from silently reintroducing
 * remote push, install attribution, advertising identifiers, vendor badge
 * access, broad file access, or Expo development overlay capabilities.
 */
const ANDROID_RELEASE_PERMISSION_DENYLIST = Object.freeze([
  "android.permission.ACCESS_ADSERVICES_AD_ID",
  "android.permission.ACCESS_ADSERVICES_ATTRIBUTION",
  "android.permission.ACCESS_ADSERVICES_CUSTOM_AUDIENCE",
  "android.permission.ACCESS_ADSERVICES_TOPICS",
  "android.permission.ACCESS_BACKGROUND_LOCATION",
  "android.permission.FOREGROUND_SERVICE_REMOTE_MESSAGING",
  "android.permission.INSTALL_PACKAGES",
  "android.permission.MANAGE_EXTERNAL_STORAGE",
  "android.permission.PACKAGE_USAGE_STATS",
  "android.permission.QUERY_ALL_PACKAGES",
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
  "android.permission.RECORD_AUDIO",
  "android.permission.REQUEST_INSTALL_PACKAGES",
  "android.permission.SCHEDULE_EXACT_ALARM",
  "android.permission.SYSTEM_ALERT_WINDOW",
  "android.permission.USE_EXACT_ALARM",
  "android.permission.WRITE_EXTERNAL_STORAGE",
  "android.permission.READ_APP_BADGE",
  "com.anddoes.launcher.permission.UPDATE_COUNT",
  "com.android.vending.INSTALL_REFERRER",
  "com.google.android.c2dm.permission.RECEIVE",
  "com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE",
  "com.google.android.gms.permission.AD_ID",
  "com.htc.launcher.permission.READ_SETTINGS",
  "com.htc.launcher.permission.UPDATE_SHORTCUT",
  "com.huawei.android.launcher.permission.CHANGE_BADGE",
  "com.huawei.android.launcher.permission.READ_SETTINGS",
  "com.huawei.android.launcher.permission.WRITE_SETTINGS",
  "com.majeur.launcher.permission.UPDATE_BADGE",
  "com.oppo.launcher.permission.READ_SETTINGS",
  "com.oppo.launcher.permission.WRITE_SETTINGS",
  "com.sec.android.provider.badge.permission.READ",
  "com.sec.android.provider.badge.permission.WRITE",
  "com.sonyericsson.home.permission.BROADCAST_BADGE",
  "com.sonymobile.home.permission.PROVIDER_INSERT_BADGE",
  "me.everything.badger.permission.BADGE_COUNT_READ",
  "me.everything.badger.permission.BADGE_COUNT_WRITE"
]);

const allowedPermissions = new Set(
  ANDROID_RELEASE_PERMISSION_ALLOWLIST
);
const deniedPermissions = new Set(
  ANDROID_RELEASE_PERMISSION_DENYLIST
);

function permissionName(permission) {
  return permission?.$?.["android:name"];
}

function isRemovalMarker(permission) {
  return permission?.$?.["tools:node"] === "remove";
}

function removeDevelopmentSchemes(manifest) {
  for (const application of manifest.application ?? []) {
    for (const activity of application.activity ?? []) {
      for (const intentFilter of activity["intent-filter"] ?? []) {
        if (!Array.isArray(intentFilter.data)) {
          continue;
        }
        intentFilter.data = intentFilter.data.filter((entry) => {
          const scheme = entry?.$?.["android:scheme"];
          return (
            typeof scheme !== "string" ||
            !scheme.startsWith(DEVELOPMENT_SCHEME_PREFIX)
          );
        });
      }
    }
  }
}

function enforcePublicIdentity(manifest) {
  const schemes = (manifest.application ?? []).flatMap((application) =>
    (application.activity ?? []).flatMap((activity) =>
      (activity["intent-filter"] ?? []).flatMap((intentFilter) =>
        (intentFilter.data ?? [])
          .map((entry) => entry?.$?.["android:scheme"])
          .filter((scheme) => typeof scheme === "string")
      )
    )
  );
  if (!schemes.includes(HELDAT_NATIVE_SCHEME)) {
    throw new Error(
      `[Heldat Android release] Expected native scheme ${HELDAT_NATIVE_SCHEME} is missing.`
    );
  }
}

function enforcePermissionPolicy(manifest) {
  const existingPermissions = manifest["uses-permission"] ?? [];
  const retainedPermissions = existingPermissions.filter((permission) => {
    const name = permissionName(permission);
    return (
      typeof name !== "string" || !deniedPermissions.has(name)
    );
  });

  const unexpectedPermissions = retainedPermissions
    .filter((permission) => !isRemovalMarker(permission))
    .map(permissionName)
    .filter(
      (name) =>
        typeof name === "string" && !allowedPermissions.has(name)
    );

  if (unexpectedPermissions.length > 0) {
    throw new Error(
      `[Heldat Android release] Unreviewed manifest permissions: ${[
        ...new Set(unexpectedPermissions)
      ].join(", ")}. Add only deliberately approved capabilities to the release allow-list.`
    );
  }

  const removalMarkers =
    ANDROID_RELEASE_PERMISSION_DENYLIST.map((name) => ({
      $: {
        "android:name": name,
        "tools:node": "remove"
      }
    }));

  manifest["uses-permission"] = [
    ...retainedPermissions,
    ...removalMarkers
  ];
}

function enforceLocalNotificationsOnly(manifest) {
  const application = manifest.application?.[0];
  if (!application) {
    throw new Error(
      "[Heldat Android release] Android application manifest entry is missing."
    );
  }

  const componentDenylists = [
    ["service", ANDROID_REMOTE_NOTIFICATION_SERVICE_DENYLIST],
    ["receiver", ANDROID_REMOTE_NOTIFICATION_RECEIVER_DENYLIST],
    ["provider", ANDROID_REMOTE_NOTIFICATION_PROVIDER_DENYLIST]
  ];

  for (const [componentType, names] of componentDenylists) {
    const denied = new Set(names);
    const retained = (application[componentType] ?? []).filter(
      (entry) => !denied.has(entry?.$?.["android:name"])
    );
    application[componentType] = [
      ...retained,
      ...names.map((name) => ({
        $: {
          "android:name": name,
          "tools:node": "remove"
        }
      }))
    ];
  }
}

function findGoogleMapsApiKey(manifest) {
  const application = manifest.application?.[0];
  const metadata = application?.["meta-data"] ?? [];
  return metadata.find(
    (entry) =>
      entry?.$?.["android:name"] === GOOGLE_MAPS_METADATA_NAME
  )?.$?.["android:value"];
}

function enforceManifest(
  androidManifest,
  { requireGoogleMapsApiKey }
) {
  const manifest = androidManifest.manifest;
  if (!manifest) {
    throw new Error(
      "[Heldat Android release] AndroidManifest mod result is missing."
    );
  }

  manifest.$ = {
    ...(manifest.$ ?? {}),
    "xmlns:tools": "http://schemas.android.com/tools"
  };

  removeDevelopmentSchemes(manifest);
  enforcePermissionPolicy(manifest);
  enforceLocalNotificationsOnly(manifest);
  enforcePublicIdentity(manifest);

  if (
    requireGoogleMapsApiKey &&
    typeof findGoogleMapsApiKey(manifest) !== "string"
  ) {
    throw new Error(
      "[Heldat Android release] Google Maps Android API key metadata was not generated."
    );
  }

  return androidManifest;
}

function disableNetworkInspector(gradleProperties) {
  const properties = gradleProperties.filter(
    (entry) =>
      entry.type !== "property" ||
      entry.key !== NETWORK_INSPECTOR_GRADLE_PROPERTY
  );
  properties.push({
    type: "property",
    key: NETWORK_INSPECTOR_GRADLE_PROPERTY,
    value: "false"
  });
  return properties;
}

function withProductionAndroidRelease(
  config,
  {
    enabled = false,
    requireGoogleMapsApiKey = false
  } = {}
) {
  if (!enabled) {
    return config;
  }
  if (
    config.android?.package !== HELDAT_ANDROID_APPLICATION_ID
  ) {
    throw new Error(
      `[Heldat Android release] Expected application ID ${HELDAT_ANDROID_APPLICATION_ID}, received ${config.android?.package ?? "none"}.`
    );
  }

  config = withAndroidManifest(config, (resolved) => {
    resolved.modResults = enforceManifest(resolved.modResults, {
      requireGoogleMapsApiKey
    });
    return resolved;
  });

  return withGradleProperties(config, (resolved) => {
    resolved.modResults = disableNetworkInspector(
      resolved.modResults
    );
    return resolved;
  });
}

module.exports = withProductionAndroidRelease;
module.exports.ANDROID_RELEASE_PERMISSION_ALLOWLIST =
  ANDROID_RELEASE_PERMISSION_ALLOWLIST;
module.exports.ANDROID_RELEASE_PERMISSION_DENYLIST =
  ANDROID_RELEASE_PERMISSION_DENYLIST;
module.exports.ANDROID_REMOTE_NOTIFICATION_PROVIDER_DENYLIST =
  ANDROID_REMOTE_NOTIFICATION_PROVIDER_DENYLIST;
module.exports.ANDROID_REMOTE_NOTIFICATION_RECEIVER_DENYLIST =
  ANDROID_REMOTE_NOTIFICATION_RECEIVER_DENYLIST;
module.exports.ANDROID_REMOTE_NOTIFICATION_SERVICE_DENYLIST =
  ANDROID_REMOTE_NOTIFICATION_SERVICE_DENYLIST;
module.exports.DEVELOPMENT_SCHEME_PREFIX =
  DEVELOPMENT_SCHEME_PREFIX;
module.exports.GOOGLE_MAPS_METADATA_NAME =
  GOOGLE_MAPS_METADATA_NAME;
module.exports.HELDAT_ANDROID_APPLICATION_ID =
  HELDAT_ANDROID_APPLICATION_ID;
module.exports.HELDAT_NATIVE_SCHEME =
  HELDAT_NATIVE_SCHEME;
module.exports.NETWORK_INSPECTOR_GRADLE_PROPERTY =
  NETWORK_INSPECTOR_GRADLE_PROPERTY;
module.exports.disableNetworkInspector =
  disableNetworkInspector;
module.exports.enforceManifest = enforceManifest;
