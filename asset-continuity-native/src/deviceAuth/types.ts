export type DeviceAuthMethod =
  | "face"
  | "fingerprint"
  | "iris"
  | "biometric"
  | "device-passcode";

export type DeviceAuthUnavailableReason =
  | "passcode-not-set"
  | "not-available"
  | "check-failed";

export type DeviceAuthCapability =
  | {
      readonly kind: "available";
      readonly method: DeviceAuthMethod;
      readonly biometricEnrolled: boolean;
    }
  | {
      readonly kind: "unavailable";
      readonly reason: DeviceAuthUnavailableReason;
    };

export type DeviceAuthError =
  | "not_enrolled"
  | "user_cancel"
  | "app_cancel"
  | "not_available"
  | "lockout"
  | "no_space"
  | "timeout"
  | "unable_to_process"
  | "unknown"
  | "system_cancel"
  | "user_fallback"
  | "invalid_context"
  | "passcode_not_set"
  | "authentication_failed";

export type DeviceAuthAttempt =
  | { readonly success: true }
  | {
      readonly success: false;
      readonly error: DeviceAuthError;
    };

export interface DeviceAuthPrompt {
  readonly title: string;
  readonly subtitle: string;
  readonly description: string;
  readonly cancelLabel: string;
  readonly fallbackLabel: string;
}

export interface DeviceAuthPort {
  readonly assess: () => Promise<DeviceAuthCapability>;
  readonly authenticate: (
    prompt: DeviceAuthPrompt
  ) => Promise<DeviceAuthAttempt>;
  readonly cancel: () => Promise<void>;
}

export type OnboardingFirstRecordIntent = "item" | "place";

export type OnboardingDevicePreflightNotice =
  | "cancelled"
  | "failed"
  | "locked-out";

export interface OnboardingDevicePreflightState {
  readonly phase:
    | "idle"
    | "checking"
    | "ready"
    | "authorizing"
    | "authorized"
    | "unavailable"
    | "bypassed";
  readonly capability: DeviceAuthCapability | null;
  readonly intent: OnboardingFirstRecordIntent | null;
  readonly notice: OnboardingDevicePreflightNotice | null;
}

export interface OnboardingDeviceAuthorization {
  readonly kind: "authorized" | "bypassed";
  readonly intent: OnboardingFirstRecordIntent;
}
