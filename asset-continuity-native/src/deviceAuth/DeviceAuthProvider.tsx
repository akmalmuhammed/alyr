import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef
} from "react";
import {
  AppState,
  type AppStateStatus
} from "react-native";

import { useLocale } from "@/i18n/LocaleProvider";
import {
  runtimeProfile,
  type RuntimeProfile
} from "@/runtime/environment";

import { deviceAuthCopy } from "./copy";
import { expoDeviceAuthPort } from "./expoDeviceAuth";
import {
  DEFAULT_VAULT_RELOCK_TIMEOUT_MS,
  initialVaultLockState,
  reduceVaultLockState,
  type VaultLockState
} from "./state";
import type { DeviceAuthPort } from "./types";

export interface DeviceAuthContextValue {
  readonly state: VaultLockState;
  readonly requiresUnlock: boolean;
  readonly vaultReleased: boolean;
  readonly previewBypass: boolean;
  readonly unlock: () => Promise<void>;
  readonly retryCapability: () => void;
  readonly lockNow: () => void;
}

const missingProviderValue: DeviceAuthContextValue = {
  state: initialVaultLockState,
  requiresUnlock: false,
  vaultReleased: false,
  previewBypass: false,
  unlock: async () => undefined,
  retryCapability: () => undefined,
  lockNow: () => undefined
};

const DeviceAuthContext =
  createContext<DeviceAuthContextValue>(missingProviderValue);

export function DeviceAuthProvider({
  children,
  protectionRequired,
  subjectId,
  port = expoDeviceAuthPort,
  profile = runtimeProfile,
  relockTimeoutMs = DEFAULT_VAULT_RELOCK_TIMEOUT_MS,
  now = Date.now
}: PropsWithChildren<{
  readonly protectionRequired: boolean;
  readonly subjectId: string | null;
  readonly port?: DeviceAuthPort;
  readonly profile?: RuntimeProfile;
  readonly relockTimeoutMs?: number;
  readonly now?: () => number;
}>) {
  const { language } = useLocale();
  const [state, dispatch] = useReducer(
    reduceVaultLockState,
    initialVaultLockState
  );
  const activeSubjectRef = useRef(subjectId);
  const unlockInFlightRef = useRef(false);
  const requiresUnlock =
    protectionRequired &&
    Boolean(subjectId) &&
    profile === "native-secure";
  const previewBypass =
    profile === "expo-go-preview" || profile === "web-preview";

  useEffect(() => {
    activeSubjectRef.current = subjectId;
    unlockInFlightRef.current = false;
    dispatch({ type: requiresUnlock ? "PROTECT" : "BYPASS" });
    if (!requiresUnlock) {
      void port.cancel();
    }
    return () => {
      if (requiresUnlock) void port.cancel();
    };
  }, [port, requiresUnlock, subjectId]);

  useEffect(() => {
    if (!requiresUnlock || state.phase !== "checking") return;
    let active = true;
    void port
      .assess()
      .then((capability) => {
        if (active) {
          dispatch({ type: "CAPABILITY_RESOLVED", capability });
        }
      })
      .catch(() => {
        if (active) {
          dispatch({
            type: "CAPABILITY_RESOLVED",
            capability: {
              kind: "unavailable",
              reason: "check-failed"
            }
          });
        }
      });
    return () => {
      active = false;
    };
  }, [port, requiresUnlock, state.phase, subjectId]);

  useEffect(() => {
    if (!requiresUnlock) return;
    const onAppStateChanged = (next: AppStateStatus) => {
      if (next === "background") {
        dispatch({ type: "APP_BACKGROUNDED", at: now() });
      } else if (next === "active") {
        dispatch({
          type: "APP_BECAME_ACTIVE",
          at: now(),
          timeoutMs: relockTimeoutMs
        });
      }
    };
    if (AppState.currentState === "background") {
      onAppStateChanged("background");
    }
    const subscription = AppState.addEventListener(
      "change",
      onAppStateChanged
    );
    return () => subscription.remove();
  }, [now, relockTimeoutMs, requiresUnlock]);

  useEffect(() => {
    if (
      !requiresUnlock ||
      state.phase !== "unlocked" ||
      state.backgroundedAt === null
    ) {
      return;
    }
    const remaining = Math.max(
      0,
      relockTimeoutMs - (now() - state.backgroundedAt)
    );
    const timeout = setTimeout(() => {
      dispatch({
        type: "BACKGROUND_TIMEOUT_REACHED",
        at: now(),
        timeoutMs: relockTimeoutMs
      });
    }, remaining);
    return () => clearTimeout(timeout);
  }, [
    now,
    relockTimeoutMs,
    requiresUnlock,
    state.backgroundedAt,
    state.phase
  ]);

  const unlock = useCallback(async () => {
    if (
      !requiresUnlock ||
      state.phase !== "locked" ||
      state.capability?.kind !== "available"
    ) {
      return;
    }
    if (unlockInFlightRef.current) return;
    unlockInFlightRef.current = true;
    const requestedSubject = subjectId;
    dispatch({ type: "UNLOCK_REQUESTED" });
    const copy = deviceAuthCopy(language, state.capability);
    const result = await port
      .authenticate({
        title: copy.unlockAction,
        subtitle: copy.promptSubtitle,
        description: copy.promptDescription,
        cancelLabel: copy.cancelLabel,
        fallbackLabel: copy.fallbackLabel
      })
      .catch(() => ({
        success: false as const,
        error: "unknown" as const
      }));
    if (
      activeSubjectRef.current !== requestedSubject ||
      !requestedSubject
    ) {
      return;
    }
    unlockInFlightRef.current = false;
    dispatch(
      result.success
        ? { type: "AUTH_SUCCEEDED" }
        : { type: "AUTH_FAILED", error: result.error }
    );
  }, [
    language,
    port,
    requiresUnlock,
    state.capability,
    state.phase,
    subjectId
  ]);

  const retryCapability = useCallback(() => {
    if (requiresUnlock) dispatch({ type: "PROTECT" });
  }, [requiresUnlock]);

  const lockNow = useCallback(() => {
    if (requiresUnlock) dispatch({ type: "LOCK_NOW" });
  }, [requiresUnlock]);

  const value = useMemo<DeviceAuthContextValue>(
    () => ({
      state,
      requiresUnlock,
      vaultReleased: !requiresUnlock || state.phase === "unlocked",
      previewBypass,
      unlock,
      retryCapability,
      lockNow
    }),
    [
      lockNow,
      previewBypass,
      requiresUnlock,
      retryCapability,
      state,
      unlock
    ]
  );

  return (
    <DeviceAuthContext.Provider value={value}>
      {children}
    </DeviceAuthContext.Provider>
  );
}

export function useDeviceAuth(): DeviceAuthContextValue {
  return useContext(DeviceAuthContext);
}
