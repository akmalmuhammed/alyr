import * as LocalAuthentication from "expo-local-authentication";

import type {
  DeviceAuthCapability,
  DeviceAuthMethod,
  DeviceAuthPort
} from "./types";

function methodFromAuthenticationTypes(
  types: readonly LocalAuthentication.AuthenticationType[]
): DeviceAuthMethod {
  if (types.length !== 1) {
    return "biometric";
  }
  if (
    types.includes(
      LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
    )
  ) {
    return "face";
  }
  if (
    types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
  ) {
    return "fingerprint";
  }
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return "iris";
  }
  return "biometric";
}

export async function assessExpoDeviceAuth(): Promise<DeviceAuthCapability> {
  try {
    const [hasHardware, biometricEnrolled, types, securityLevel] =
      await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
        LocalAuthentication.supportedAuthenticationTypesAsync(),
        LocalAuthentication.getEnrolledLevelAsync()
      ]);

    if (securityLevel === LocalAuthentication.SecurityLevel.NONE) {
      return { kind: "unavailable", reason: "passcode-not-set" };
    }

    const hasEnrolledBiometric =
      hasHardware &&
      biometricEnrolled &&
      securityLevel ===
        LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG;

    return {
      kind: "available",
      method: hasEnrolledBiometric
        ? methodFromAuthenticationTypes(types)
        : "device-passcode",
      biometricEnrolled: hasEnrolledBiometric
    };
  } catch {
    return { kind: "unavailable", reason: "check-failed" };
  }
}

export const expoDeviceAuthPort: DeviceAuthPort = {
  assess: assessExpoDeviceAuth,
  async authenticate(prompt) {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: prompt.title,
        promptSubtitle: prompt.subtitle,
        promptDescription: prompt.description,
        cancelLabel: prompt.cancelLabel,
        fallbackLabel: prompt.fallbackLabel,
        disableDeviceFallback: false,
        requireConfirmation: true,
        biometricsSecurityLevel: "strong"
      });
      return result.success
        ? { success: true }
        : { success: false, error: result.error };
    } catch {
      return { success: false, error: "unknown" };
    }
  },
  async cancel() {
    try {
      await LocalAuthentication.cancelAuthenticate();
    } catch {
      // iOS and already-settled prompts have nothing to cancel.
    }
  }
};
