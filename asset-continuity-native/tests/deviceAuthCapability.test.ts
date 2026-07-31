jest.mock("expo-local-authentication", () => ({
  AuthenticationType: {
    FINGERPRINT: 1,
    FACIAL_RECOGNITION: 2,
    IRIS: 3
  },
  SecurityLevel: {
    NONE: 0,
    SECRET: 1,
    BIOMETRIC_WEAK: 2,
    BIOMETRIC_STRONG: 3
  },
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
  getEnrolledLevelAsync: jest.fn(),
  authenticateAsync: jest.fn(),
  cancelAuthenticate: jest.fn(async () => undefined)
}));

import * as LocalAuthentication from "expo-local-authentication";

import {
  deviceAuthCopy,
  onboardingDevicePreflightCopy
} from "@/deviceAuth/copy";
import {
  assessExpoDeviceAuth,
  expoDeviceAuthPort
} from "@/deviceAuth/expoDeviceAuth";

const hasHardware = jest.mocked(
  LocalAuthentication.hasHardwareAsync
);
const isEnrolled = jest.mocked(
  LocalAuthentication.isEnrolledAsync
);
const authenticationTypes = jest.mocked(
  LocalAuthentication.supportedAuthenticationTypesAsync
);
const enrolledLevel = jest.mocked(
  LocalAuthentication.getEnrolledLevelAsync
);
const authenticate = jest.mocked(
  LocalAuthentication.authenticateAsync
);

describe("Expo device-auth capability adapter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    hasHardware.mockResolvedValue(true);
    isEnrolled.mockResolvedValue(true);
    authenticationTypes.mockResolvedValue([
      LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
    ]);
    enrolledLevel.mockResolvedValue(
      LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG
    );
  });

  it("names Face ID only when compatible hardware and enrollment are confirmed", async () => {
    const capability = await assessExpoDeviceAuth();
    expect(capability).toEqual({
      kind: "available",
      method: "face",
      biometricEnrolled: true
    });
    expect(deviceAuthCopy("en", capability).unlockBody).toContain(
      "Face ID"
    );
  });

  it("uses honest passcode language when biometrics are absent", async () => {
    hasHardware.mockResolvedValue(false);
    isEnrolled.mockResolvedValue(false);
    authenticationTypes.mockResolvedValue([]);
    enrolledLevel.mockResolvedValue(
      LocalAuthentication.SecurityLevel.SECRET
    );

    const capability = await assessExpoDeviceAuth();
    expect(capability).toEqual({
      kind: "available",
      method: "device-passcode",
      biometricEnrolled: false
    });
    expect(deviceAuthCopy("en", capability).unlockBody).toBe(
      "Use your device passcode to continue. Heldat never sees the code."
    );
    expect(deviceAuthCopy("ar", capability).unlockBody).not.toContain(
      "Face ID"
    );
    expect(
      onboardingDevicePreflightCopy("en", capability).readyTitle
    ).toBe("Device passcode is ready");
    expect(
      onboardingDevicePreflightCopy("ar", capability).readyTitle
    ).toBe("رمز دخول الجهاز جاهز");
  });

  it("fails closed when no device credential exists or capability checks fail", async () => {
    enrolledLevel.mockResolvedValue(
      LocalAuthentication.SecurityLevel.NONE
    );
    await expect(assessExpoDeviceAuth()).resolves.toEqual({
      kind: "unavailable",
      reason: "passcode-not-set"
    });

    enrolledLevel.mockRejectedValue(new Error("native check failed"));
    await expect(assessExpoDeviceAuth()).resolves.toEqual({
      kind: "unavailable",
      reason: "check-failed"
    });
  });

  it("keeps system device-passcode fallback enabled", async () => {
    authenticate.mockResolvedValue({ success: true });
    await expect(
      expoDeviceAuthPort.authenticate({
        title: "Unlock Heldat",
        subtitle: "Private household record",
        description: "Verify on this device",
        cancelLabel: "Keep locked",
        fallbackLabel: "Use device passcode"
      })
    ).resolves.toEqual({ success: true });

    expect(authenticate).toHaveBeenCalledWith(
      expect.objectContaining({
        disableDeviceFallback: false,
        fallbackLabel: "Use device passcode",
        biometricsSecurityLevel: "strong"
      })
    );
  });

  it("discloses preview limits and preserves native Arabic copy", () => {
    const english = onboardingDevicePreflightCopy("en", null);
    const arabic = onboardingDevicePreflightCopy("ar", null);

    expect(english.bypassedBody).toContain("Expo Go");
    expect(english.readyBody).toContain(
      "exact item or Place you selected"
    );
    expect(arabic.bypassedBody).toContain("Expo Go");
    expect(arabic.verifyPlaceAction).toBe(
      "تحقق وأضف أول مكان"
    );
    expect(arabic.unavailableBody).toContain("الإعدادات");
  });
});
