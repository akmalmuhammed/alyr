import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * EAS environment contract:
 * - name: GOOGLE_MAPS_ANDROID_API_KEY
 * - environments: preview and production
 * - visibility: Sensitive
 * The value is embedded in the APK/AAB, so Google Cloud Android-app
 * restrictions for app.heldat.mobile and each signing certificate are the
 * security boundary; EAS visibility only prevents accidental log/UI exposure.
 */
const GOOGLE_MAPS_ANDROID_API_KEY_ENV =
  "GOOGLE_MAPS_ANDROID_API_KEY";
const HELDAT_PUBLIC_APPLICATION_ID = "app.heldat.mobile";
const HELDAT_PUBLIC_SCHEME = "heldat";
const DISTRIBUTABLE_ANDROID_PROFILES = new Set([
  "preview",
  "production"
]);
const GOOGLE_MAPS_ANDROID_API_KEY_PATTERN =
  /^AIza[0-9A-Za-z_-]{35}$/u;
const PUBLIC_APP_LINK_HOST = "heldat.app";
const PUBLIC_APP_LINK_PATHS = [
  "/join",
  "/callback",
  "/reset-password"
] as const;
const EAS_UPDATE_URL =
  "https://u.expo.dev/85cab1f2-111f-4e20-abd5-8dff0df2fabb";

function allowsLocalDevelopmentNetworking(): boolean {
  const profile = process.env.EAS_BUILD_PROFILE;
  if (profile !== undefined && profile.length > 0) {
    return (
      profile === "development" ||
      profile === "development-simulator"
    );
  }
  return process.env.NODE_ENV === "development";
}

function isDistributableAndroidBuild(): boolean {
  const platform = process.env.EAS_BUILD_PLATFORM;
  if (
    platform !== undefined &&
    platform.length > 0 &&
    platform !== "android"
  ) {
    return false;
  }

  const profile = process.env.EAS_BUILD_PROFILE;
  if (profile !== undefined && profile.length > 0) {
    return DISTRIBUTABLE_ANDROID_PROFILES.has(profile);
  }
  return process.env.NODE_ENV === "production";
}

function resolveGoogleMapsAndroidApiKey(): string | undefined {
  const apiKey =
    process.env[GOOGLE_MAPS_ANDROID_API_KEY_ENV]?.trim();

  if (!apiKey) {
    if (isDistributableAndroidBuild()) {
      throw new Error(
          `[Heldat config] ${GOOGLE_MAPS_ANDROID_API_KEY_ENV} is required for preview and production Android builds. ` +
          "Create it in the matching EAS environment and restrict the Google Maps key to Android package " +
          `${HELDAT_PUBLIC_APPLICATION_ID} plus the signing certificate fingerprint.`
      );
    }
    return undefined;
  }

  if (!GOOGLE_MAPS_ANDROID_API_KEY_PATTERN.test(apiKey)) {
    throw new Error(
      `[Heldat config] ${GOOGLE_MAPS_ANDROID_API_KEY_ENV} must be a complete Google Android API key ` +
        "(AIza followed by 35 URL-safe characters). Placeholder or malformed values are rejected."
    );
  }

  return apiKey;
}

function googleMapsAndroidConfig(): {
  config?: { googleMaps: { apiKey: string } };
} {
  const apiKey = resolveGoogleMapsAndroidApiKey();
  return apiKey
    ? { config: { googleMaps: { apiKey } } }
    : {};
}

function remoteUpdatesConfig(): NonNullable<
  ExpoConfig["updates"]
> {
  if (allowsLocalDevelopmentNetworking()) {
    return {
      enabled: true,
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0,
      url: EAS_UPDATE_URL
    };
  }

  return {
    enabled: false,
    checkAutomatically: "NEVER",
    fallbackToCacheTimeout: 0
  };
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Heldat",
  slug: "alyr-asset-continuity",
  owner: "alyr-app",
  version: "0.1.0",
  orientation: "portrait",
  scheme: HELDAT_PUBLIC_SCHEME,
  userInterfaceStyle: "light",
  icon: "./assets/alyr/app-and-favicon/01_App_Icon/PNG/app-icon-1024.png",
  ios: {
    bundleIdentifier: HELDAT_PUBLIC_APPLICATION_ID,
    supportsTablet: false,
    associatedDomains: [`applinks:${PUBLIC_APP_LINK_HOST}`],
    icon: "./assets/alyr/app-and-favicon/01_App_Icon/PNG/app-icon-ios-1024.png",
    config: {
      usesNonExemptEncryption: false
    },
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [
        {
          NSPrivacyCollectedDataType:
            "NSPrivacyCollectedDataTypeEmailAddress",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality"
          ]
        },
        {
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeUserID",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality"
          ]
        },
        {
          NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeDeviceID",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality"
          ]
        },
        {
          NSPrivacyCollectedDataType:
            "NSPrivacyCollectedDataTypePhysicalAddress",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality"
          ]
        },
        {
          NSPrivacyCollectedDataType:
            "NSPrivacyCollectedDataTypePreciseLocation",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality"
          ]
        },
        {
          NSPrivacyCollectedDataType:
            "NSPrivacyCollectedDataTypeCoarseLocation",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality"
          ]
        },
        {
          NSPrivacyCollectedDataType:
            "NSPrivacyCollectedDataTypeOtherFinancialInfo",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality"
          ]
        },
        {
          NSPrivacyCollectedDataType:
            "NSPrivacyCollectedDataTypePhotosorVideos",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality"
          ]
        },
        {
          NSPrivacyCollectedDataType:
            "NSPrivacyCollectedDataTypeOtherUserContent",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality"
          ]
        },
        {
          NSPrivacyCollectedDataType:
            "NSPrivacyCollectedDataTypeOtherDiagnosticData",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality"
          ]
        },
        {
          NSPrivacyCollectedDataType:
            "NSPrivacyCollectedDataTypeProductInteraction",
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: [
            "NSPrivacyCollectedDataTypePurposeAnalytics"
          ]
        }
      ],
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType:
            "NSPrivacyAccessedAPICategoryFileTimestamp",
          NSPrivacyAccessedAPITypeReasons: ["C617.1", "3B52.1"]
        },
        {
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryDiskSpace",
          NSPrivacyAccessedAPITypeReasons: ["E174.1", "85F4.1"]
        },
        {
          NSPrivacyAccessedAPIType:
            "NSPrivacyAccessedAPICategorySystemBootTime",
          NSPrivacyAccessedAPITypeReasons: ["35F9.1"]
        },
        {
          NSPrivacyAccessedAPIType:
            "NSPrivacyAccessedAPICategoryUserDefaults",
          NSPrivacyAccessedAPITypeReasons: ["CA92.1"]
        }
      ]
    },
    infoPlist: {
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: false,
        NSAllowsLocalNetworking: allowsLocalDevelopmentNetworking()
      },
      NSCameraUsageDescription:
        "Heldat uses the camera only when you choose to photograph an asset or its supporting material.",
      NSFaceIDUsageDescription:
        "Heldat uses Face ID only to unlock your private household record on this device.",
      NSLocationWhenInUseUsageDescription:
        "Heldat uses your location only when you ask to place a property accurately."
    }
  },
  android: {
    // SQLCipher and attachment keys are intentionally device-bound. Android
    // Auto Backup can restore encrypted bytes onto a device that has no
    // matching SecureStore/Keystore key, so cloud sync and explicit Recovery
    // Kits—not OS backup—are the reviewed recovery paths.
    allowBackup: false,
    package: HELDAT_PUBLIC_APPLICATION_ID,
    blockedPermissions: ["android.permission.RECORD_AUDIO"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        category: ["BROWSABLE", "DEFAULT"],
        data: PUBLIC_APP_LINK_PATHS.map((pathPrefix) => ({
          scheme: "https",
          host: PUBLIC_APP_LINK_HOST,
          pathPrefix
        }))
      }
    ],
    ...googleMapsAndroidConfig(),
    adaptiveIcon: {
      foregroundImage:
        "./assets/alyr/app-and-favicon/01_App_Icon/PNG/app-icon-1024.png",
      backgroundColor: "#0E1012"
    },
    predictiveBackGestureEnabled: true,
    permissions: [
      "CAMERA",
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION"
    ]
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon:
      "./assets/alyr/app-and-favicon/02_Favicon/favicon-48x48.png"
  },
  plugins: [
    "expo-router",
    "expo-background-task",
    "expo-sharing",
    [
      "expo-web-browser",
      {
        experimentalLauncherActivity: false
      }
    ],
    "./plugins/with-local-notifications-only",
    [
      "expo-splash-screen",
      {
        image:
          "./assets/alyr/app-and-favicon/01_App_Icon/PNG/app-icon-512.png",
        imageWidth: 160,
        resizeMode: "contain",
        backgroundColor: "#F6F7F3"
      }
    ],
    [
      "expo-sqlite",
      {
        enableFTS: true,
        useSQLCipher: true
      }
    ],
    [
      "expo-secure-store",
      {
        // Keep Expo's restrictive backup XML installed even though the
        // manifest also disables backup. The rules include only ordinary
        // shared preferences and exclude SecureStore for both cloud restore
        // and device transfer; databases and attachment files stay outside
        // the OS backup set.
        configureAndroidBackup: true
      }
    ],
    [
      "expo-image-picker",
      {
        photosPermission:
          "Allow Heldat to attach only the photos you choose.",
        cameraPermission:
          "Allow Heldat to photograph an asset or supporting material.",
        microphonePermission: false
      }
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Allow Heldat to place a property when you request accurate location.",
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
        motionUsagePermission: false,
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: false,
        isAndroidMotionActivityEnabled: false
      }
    ],
    [
      "expo-local-authentication",
      {
        faceIDPermission:
          "Allow Heldat to use Face ID to unlock your private household record on this device."
      }
    ],
    [
      "./plugins/with-production-network-privacy",
      {
        allowLocalNetworking: allowsLocalDevelopmentNetworking()
      }
    ],
    [
      "./plugins/with-production-android-release",
      {
        enabled: !allowsLocalDevelopmentNetworking(),
        requireGoogleMapsApiKey: isDistributableAndroidBuild()
      }
    ]
  ],
  experiments: {
    typedRoutes: true
  },
  updates: remoteUpdatesConfig(),
  runtimeVersion: {
    policy: "appVersion"
  },
  extra: {
    eas: {
      projectId: "85cab1f2-111f-4e20-abd5-8dff0df2fabb"
    }
  }
});
