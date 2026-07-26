import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";

export type RuntimeProfile =
  | "native-secure"
  | "expo-go-preview"
  | "web-preview"
  | "test";

interface RuntimeSignals {
  readonly expoGo: boolean;
  readonly platform: string;
  readonly test: boolean;
}

export function classifyRuntime({
  expoGo,
  platform,
  test
}: RuntimeSignals): RuntimeProfile {
  if (test) {
    return "test";
  }
  if (platform === "web") {
    return "web-preview";
  }
  if (expoGo) {
    return "expo-go-preview";
  }
  return "native-secure";
}

export const runtimeProfile = classifyRuntime({
  expoGo: isRunningInExpoGo(),
  platform: Platform.OS,
  test: process.env.NODE_ENV === "test"
});

export const isExpoGoPreview = runtimeProfile === "expo-go-preview";
export const isSessionPreview =
  runtimeProfile === "expo-go-preview" ||
  runtimeProfile === "web-preview" ||
  runtimeProfile === "test";
