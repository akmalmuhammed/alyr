import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "ALYR",
  slug: "alyr-asset-continuity",
  owner: process.env.EXPO_PUBLIC_EAS_OWNER || undefined,
  version: "0.1.0",
  orientation: "portrait",
  scheme: "alyr",
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  icon: "./assets/alyr/app-and-favicon/01_App_Icon/PNG/app-icon-1024.png",
  splash: {
    image: "./assets/alyr/app-and-favicon/01_App_Icon/PNG/app-icon-512.png",
    resizeMode: "contain",
    backgroundColor: "#0E1012"
  },
  ios: {
    bundleIdentifier: "com.alyr.continuity",
    supportsTablet: true,
    infoPlist: {
      NSCameraUsageDescription:
        "ALYR uses the camera only when you choose to photograph an asset or its supporting material.",
      NSFaceIDUsageDescription:
        "Use Face ID to unlock the private ALYR vault on this device.",
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
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: true,
    permissions: [
      "CAMERA",
      "ACCESS_COARSE_LOCATION",
      "ACCESS_FINE_LOCATION",
      "USE_BIOMETRIC"
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
      "expo-sqlite",
      {
        enableFTS: true,
        useSQLCipher: true
      }
    ],
    [
      "expo-secure-store",
      {
        configureAndroidBackup: true,
        faceIDPermission:
          "Allow ALYR to use Face ID to unlock your private vault."
      }
    ],
    [
      "expo-camera",
      {
        cameraPermission:
          "Allow ALYR to photograph an asset or supporting material."
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
          "Allow ALYR to place a property when you request accurate location."
      }
    ],
    [
      "expo-local-authentication",
      {
        faceIDPermission:
          "Allow ALYR to use Face ID to unlock your private vault."
      }
    ],
    [
      "expo-notifications",
      {
        color: "#8B5CF6",
        defaultChannel: "reviews"
      }
    ]
  ],
  experiments: {
    typedRoutes: true
  },
  runtimeVersion: {
    policy: "appVersion"
  },
  extra: {
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || undefined
    },
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || "",
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ""
  }
});
