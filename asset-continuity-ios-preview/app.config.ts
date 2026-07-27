import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "ALYR iPhone Preview",
  slug: "alyr-iphone-preview",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  icon:
    "../asset-continuity-native/assets/alyr/app-and-favicon/01_App_Icon/PNG/app-icon-1024.png",
  splash: {
    image:
      "../asset-continuity-native/assets/alyr/app-and-favicon/01_App_Icon/PNG/app-icon-512.png",
    resizeMode: "contain",
    backgroundColor: "#F6F7F3"
  },
  ios: {
    supportsTablet: true
  },
  android: {
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: true
  },
  plugins: ["expo-router"],
  experiments: {
    autolinkingModuleResolution: true
  },
  extra: {
    alyrRuntime: "expo-go-preview",
    dataPolicy: "session-only"
  }
});
