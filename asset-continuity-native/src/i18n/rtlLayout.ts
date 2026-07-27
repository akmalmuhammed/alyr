import { Platform, type ViewStyle } from "react-native";

/**
 * Browser layout already inherits `dir="rtl"` from LocaleProvider. Reversing
 * an RTL flex row again would put leading controls back on the left. Native
 * does not change the process-wide I18nManager at runtime, so it mirrors the
 * same row explicitly.
 */
export function rtlRowStyle(
  platform: typeof Platform.OS = Platform.OS
): ViewStyle {
  return platform === "web"
    ? {}
    : { flexDirection: "row-reverse" };
}
