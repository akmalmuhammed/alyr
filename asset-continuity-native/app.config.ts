import type { ConfigContext, ExpoConfig } from "expo/config";

function allowsLocalDevelopmentNetworking(): boolean {
  const profile = process.env.EAS_BUILD_PROFILE;
  return (
    process.env.NODE_ENV === "development" ||
    profile === "development" ||
    profile === "development-simulator"
  );
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "ALYR",
  slug: "alyr-asset-continuity",
  owner: "alyr-app",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "alyr",
  userInterfaceStyle: "light",
  icon: "./assets/alyr/app-and-favicon/01_App_Icon/PNG/app-icon-1024.png",
  ios: {
    bundleIdentifier: "com.alyr.continuity",
    supportsTablet: false,
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
        "ALYR uses the camera only when you choose to photograph an asset or its supporting material.",
      NSFaceIDUsageDescription:
        "ALYR uses Face ID only to unlock your private household record on this device.",
      NSLocationWhenInUseUsageDescription:
        "ALYR uses your location only when you ask to place a property accurately."
    }
  },
  android: {
    package: "com.alyr.continuity",
    blockedPermissions: ["android.permission.RECORD_AUDIO"],
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
        configureAndroidBackup: true
      }
    ],
    [
      "expo-camera",
      {
        cameraPermission:
          "Allow ALYR to photograph an asset or supporting material.",
        microphonePermission: false,
        recordAudioAndroid: false,
        barcodeScannerEnabled: false
      }
    ],
    [
      "expo-image-picker",
      {
        photosPermission:
          "Allow ALYR to attach only the photos you choose.",
        cameraPermission:
          "Allow ALYR to photograph an asset or supporting material."
      }
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Allow ALYR to place a property when you request accurate location.",
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
          "Allow ALYR to use Face ID to unlock your private household record on this device."
      }
    ],
  ],
  experiments: {
    typedRoutes: true
  },
  updates: {
    url: "https://u.expo.dev/85cab1f2-111f-4e20-abd5-8dff0df2fabb"
  },
  runtimeVersion: {
    policy: "appVersion"
  },
  extra: {
    eas: {
      projectId: "85cab1f2-111f-4e20-abd5-8dff0df2fabb"
    }
  }
});
