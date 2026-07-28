import type {
  DeviceAuthCapability,
  DeviceAuthError
} from "./types";

export const DEFAULT_VAULT_RELOCK_TIMEOUT_MS = 2 * 60 * 1_000;

export type VaultLockNotice =
  | "cancelled"
  | "failed"
  | "locked-out"
  | "timed-out"
  | "manually-locked";

export interface VaultLockState {
  readonly phase:
    | "bypassed"
    | "checking"
    | "locked"
    | "unlocking"
    | "unlocked"
    | "unavailable";
  readonly capability: DeviceAuthCapability | null;
  readonly backgroundedAt: number | null;
  readonly notice: VaultLockNotice | null;
}

export type VaultLockEvent =
  | { readonly type: "BYPASS" }
  | { readonly type: "PROTECT" }
  | {
      readonly type: "PROTECT_AUTHORIZED";
      readonly capability: Extract<
        DeviceAuthCapability,
        { readonly kind: "available" }
      >;
    }
  | {
      readonly type: "CAPABILITY_RESOLVED";
      readonly capability: DeviceAuthCapability;
    }
  | { readonly type: "UNLOCK_REQUESTED" }
  | { readonly type: "AUTH_SUCCEEDED" }
  | {
      readonly type: "AUTH_FAILED";
      readonly error: DeviceAuthError;
    }
  | { readonly type: "APP_BACKGROUNDED"; readonly at: number }
  | {
      readonly type: "APP_BECAME_ACTIVE";
      readonly at: number;
      readonly timeoutMs: number;
    }
  | {
      readonly type: "BACKGROUND_TIMEOUT_REACHED";
      readonly at: number;
      readonly timeoutMs: number;
    }
  | { readonly type: "LOCK_NOW" };

export const initialVaultLockState: VaultLockState = {
  phase: "bypassed",
  capability: null,
  backgroundedAt: null,
  notice: null
};

function unavailableCapability(
  error: DeviceAuthError
): DeviceAuthCapability | null {
  if (error === "passcode_not_set" || error === "not_enrolled") {
    return { kind: "unavailable", reason: "passcode-not-set" };
  }
  if (error === "not_available") {
    return { kind: "unavailable", reason: "not-available" };
  }
  return null;
}

function authenticationNotice(error: DeviceAuthError): VaultLockNotice {
  if (
    error === "user_cancel" ||
    error === "app_cancel" ||
    error === "system_cancel" ||
    error === "user_fallback"
  ) {
    return "cancelled";
  }
  if (error === "lockout") {
    return "locked-out";
  }
  return "failed";
}

function relockAfterElapsedBackground(
  state: VaultLockState,
  at: number,
  timeoutMs: number
): VaultLockState {
  if (
    state.phase !== "unlocked" ||
    state.backgroundedAt === null ||
    at - state.backgroundedAt < timeoutMs
  ) {
    return {
      ...state,
      backgroundedAt: null
    };
  }
  return {
    ...state,
    phase: "locked",
    backgroundedAt: null,
    notice: "timed-out"
  };
}

export function reduceVaultLockState(
  state: VaultLockState,
  event: VaultLockEvent
): VaultLockState {
  switch (event.type) {
    case "BYPASS":
      return initialVaultLockState;
    case "PROTECT":
      return {
        phase: "checking",
        capability: null,
        backgroundedAt: null,
        notice: null
      };
    case "PROTECT_AUTHORIZED":
      return {
        phase: "unlocked",
        capability: event.capability,
        backgroundedAt: null,
        notice: null
      };
    case "CAPABILITY_RESOLVED":
      return {
        phase:
          event.capability.kind === "available"
            ? "locked"
            : "unavailable",
        capability: event.capability,
        backgroundedAt: state.backgroundedAt,
        notice: null
      };
    case "UNLOCK_REQUESTED":
      if (
        state.phase !== "locked" ||
        state.capability?.kind !== "available"
      ) {
        return state;
      }
      return { ...state, phase: "unlocking", notice: null };
    case "AUTH_SUCCEEDED":
      if (state.phase !== "unlocking") return state;
      return { ...state, phase: "unlocked", notice: null };
    case "AUTH_FAILED": {
      if (state.phase !== "unlocking") return state;
      const unavailable = unavailableCapability(event.error);
      if (unavailable) {
        return {
          ...state,
          phase: "unavailable",
          capability: unavailable,
          notice: null
        };
      }
      return {
        ...state,
        phase: "locked",
        notice: authenticationNotice(event.error)
      };
    }
    case "APP_BACKGROUNDED":
      return {
        ...state,
        backgroundedAt: state.backgroundedAt ?? event.at
      };
    case "APP_BECAME_ACTIVE":
      return relockAfterElapsedBackground(
        state,
        event.at,
        event.timeoutMs
      );
    case "BACKGROUND_TIMEOUT_REACHED":
      if (state.backgroundedAt === null) return state;
      if (
        state.phase === "unlocked" &&
        event.at - state.backgroundedAt >= event.timeoutMs
      ) {
        return {
          ...state,
          phase: "locked",
          notice: "timed-out"
        };
      }
      return state;
    case "LOCK_NOW":
      if (
        state.capability?.kind !== "available" ||
        state.phase === "checking" ||
        state.phase === "unavailable"
      ) {
        return state;
      }
      return {
        ...state,
        phase: "locked",
        backgroundedAt: null,
        notice: "manually-locked"
      };
  }
}
