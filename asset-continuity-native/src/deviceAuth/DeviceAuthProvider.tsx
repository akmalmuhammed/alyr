import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
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

import {
  deviceAuthCopy,
  onboardingDevicePreflightCopy
} from "./copy";
import { expoDeviceAuthPort } from "./expoDeviceAuth";
import {
  expoOnboardingHandoffStore,
  type OnboardingHandoffStore
} from "./onboardingHandoffStore";
import {
  DEFAULT_VAULT_RELOCK_TIMEOUT_MS,
  initialVaultLockState,
  reduceVaultLockState,
  type VaultLockState
} from "./state";
import type {
  DeviceAuthCapability,
  DeviceAuthError,
  DeviceAuthPort,
  OnboardingDeviceAuthorization,
  OnboardingDevicePreflightNotice,
  OnboardingDevicePreflightState,
  OnboardingFirstRecordIntent
} from "./types";

const ONBOARDING_AUTHORIZATION_TTL_MS = 2 * 60 * 1_000;

export const initialOnboardingDevicePreflightState: OnboardingDevicePreflightState =
  {
    phase: "idle",
    capability: null,
    intent: null,
    notice: null
  };

interface OnboardingDeviceGrant {
  readonly subjectId: string;
  readonly intent: OnboardingFirstRecordIntent;
  readonly capability: Extract<
    DeviceAuthCapability,
    { readonly kind: "available" }
  >;
  readonly authorizedAt: number;
}

export interface DeviceAuthContextValue {
  readonly state: VaultLockState;
  readonly requiresUnlock: boolean;
  readonly vaultReleased: boolean;
  readonly previewBypass: boolean;
  readonly onboardingPreflight: OnboardingDevicePreflightState;
  readonly pendingFirstRecordIntent: OnboardingFirstRecordIntent | null;
  readonly onboardingHandoffRestoreState:
    | "loading"
    | "ready"
    | "error";
  readonly checkOnboardingProtection: () => Promise<DeviceAuthCapability | null>;
  readonly authorizeOnboarding: (
    intent: OnboardingFirstRecordIntent
  ) => Promise<OnboardingDeviceAuthorization | null>;
  readonly clearOnboardingAuthorization: () => void;
  readonly retryOnboardingHandoffRestore: () => void;
  readonly completeOnboardingHandoff: (
    intent: OnboardingFirstRecordIntent
  ) => Promise<void>;
  readonly unlock: () => Promise<void>;
  readonly retryCapability: () => void;
  readonly lockNow: () => void;
}

const missingProviderValue: DeviceAuthContextValue = {
  state: initialVaultLockState,
  requiresUnlock: false,
  vaultReleased: false,
  previewBypass: false,
  onboardingPreflight: initialOnboardingDevicePreflightState,
  pendingFirstRecordIntent: null,
  onboardingHandoffRestoreState: "ready",
  checkOnboardingProtection: async () => null,
  authorizeOnboarding: async () => null,
  clearOnboardingAuthorization: () => undefined,
  retryOnboardingHandoffRestore: () => undefined,
  completeOnboardingHandoff: async () => undefined,
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
  onboardingHandoffStore = expoOnboardingHandoffStore,
  relockTimeoutMs = DEFAULT_VAULT_RELOCK_TIMEOUT_MS,
  now = Date.now
}: PropsWithChildren<{
  readonly protectionRequired: boolean;
  readonly subjectId: string | null;
  readonly port?: DeviceAuthPort;
  readonly profile?: RuntimeProfile;
  readonly onboardingHandoffStore?: OnboardingHandoffStore;
  readonly relockTimeoutMs?: number;
  readonly now?: () => number;
}>) {
  const { language } = useLocale();
  const [state, dispatch] = useReducer(
    reduceVaultLockState,
    initialVaultLockState
  );
  const [onboardingPreflight, setOnboardingPreflight] =
    useState<OnboardingDevicePreflightState>(
      profile === "native-secure"
        ? initialOnboardingDevicePreflightState
        : {
            phase: "bypassed",
            capability: null,
            intent: null,
            notice: null
          }
    );
  const [durableFirstRecordIntent, setDurableFirstRecordIntent] =
    useState<OnboardingFirstRecordIntent | null>(null);
  const [
    onboardingHandoffRestoreState,
    setOnboardingHandoffRestoreState
  ] = useState<"loading" | "ready" | "error">(
    profile === "native-secure" && subjectId
      ? "loading"
      : "ready"
  );
  const [
    onboardingHandoffRestoreAttempt,
    setOnboardingHandoffRestoreAttempt
  ] = useState(0);
  const activeSubjectRef = useRef(subjectId);
  const releasedSubjectRef = useRef<string | null>(null);
  const unlockInFlightRef = useRef(false);
  const onboardingRequestVersionRef = useRef(0);
  const onboardingHandoffLoadVersionRef = useRef(0);
  const onboardingAuthorizeInFlightRef = useRef(false);
  const onboardingGrantRef = useRef<OnboardingDeviceGrant | null>(
    null
  );
  const requiresUnlock =
    protectionRequired &&
    Boolean(subjectId) &&
    profile === "native-secure";
  const nativeSubjectProtection =
    Boolean(subjectId) && profile === "native-secure";
  const previewBypass =
    profile === "expo-go-preview" || profile === "web-preview";
  const matchingOnboardingGrant =
    nativeSubjectProtection &&
    AppState.currentState !== "background" &&
    onboardingGrantRef.current?.subjectId === subjectId &&
    now() - onboardingGrantRef.current.authorizedAt <=
      ONBOARDING_AUTHORIZATION_TTL_MS
      ? onboardingGrantRef.current
      : null;

  useEffect(() => {
    const subjectChanged = activeSubjectRef.current !== subjectId;
    activeSubjectRef.current = subjectId;
    unlockInFlightRef.current = false;
    onboardingAuthorizeInFlightRef.current = false;
    if (subjectChanged) {
      onboardingRequestVersionRef.current += 1;
      onboardingHandoffLoadVersionRef.current += 1;
      onboardingGrantRef.current = null;
      releasedSubjectRef.current = null;
      setDurableFirstRecordIntent(null);
      setOnboardingHandoffRestoreState(
        profile === "native-secure" && subjectId
          ? "loading"
          : "ready"
      );
      setOnboardingPreflight(
        initialOnboardingDevicePreflightState
      );
    }
    const preauthorized =
      requiresUnlock &&
      !subjectChanged &&
      AppState.currentState !== "background" &&
      onboardingGrantRef.current?.subjectId === subjectId &&
      now() - onboardingGrantRef.current.authorizedAt <=
        ONBOARDING_AUTHORIZATION_TTL_MS
        ? onboardingGrantRef.current
        : null;
    if (preauthorized) {
      onboardingGrantRef.current = null;
      releasedSubjectRef.current = subjectId;
      dispatch({
        type: "PROTECT_AUTHORIZED",
        capability: preauthorized.capability
      });
    } else {
      if (requiresUnlock) releasedSubjectRef.current = null;
      dispatch({ type: requiresUnlock ? "PROTECT" : "BYPASS" });
    }
    if (!requiresUnlock) {
      void port.cancel();
    }
    return () => {
      void port.cancel();
    };
  }, [
    now,
    port,
    profile,
    requiresUnlock,
    subjectId
  ]);

  useEffect(() => {
    const requestedSubject = subjectId;
    if (
      profile !== "native-secure" ||
      !requestedSubject
    ) {
      setOnboardingHandoffRestoreState("ready");
      return;
    }
    setOnboardingHandoffRestoreState("loading");
    const loadVersion =
      onboardingHandoffLoadVersionRef.current + 1;
    onboardingHandoffLoadVersionRef.current = loadVersion;
    let active = true;
    void onboardingHandoffStore
      .load(requestedSubject)
      .then((intent) => {
        if (
          active &&
          activeSubjectRef.current === requestedSubject &&
          onboardingHandoffLoadVersionRef.current === loadVersion
        ) {
          setDurableFirstRecordIntent(intent);
          setOnboardingHandoffRestoreState("ready");
        }
      })
      .catch(() => {
        if (
          active &&
          activeSubjectRef.current === requestedSubject &&
          onboardingHandoffLoadVersionRef.current === loadVersion
        ) {
          /*
           * Keep the vault sealed until the subject-scoped handoff has been
           * read successfully. The lock surface exposes an explicit retry so
           * a transient SecureStore failure cannot silently drop the exact
           * Item/Place continuation.
           */
          setOnboardingHandoffRestoreState("error");
        }
      });
    return () => {
      active = false;
    };
  }, [
    onboardingHandoffRestoreAttempt,
    onboardingHandoffStore,
    profile,
    subjectId
  ]);

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
    const onboardingGrantActive =
      !requiresUnlock &&
      profile === "native-secure" &&
      onboardingPreflight.phase === "authorized" &&
      onboardingGrantRef.current?.subjectId === subjectId;
    if (!requiresUnlock && !onboardingGrantActive) return;
    const onAppStateChanged = (next: AppStateStatus) => {
      if (next === "background") {
        if (onboardingGrantActive) {
          onboardingRequestVersionRef.current += 1;
          onboardingGrantRef.current = null;
          setOnboardingPreflight((current) =>
            current.phase === "authorized"
              ? {
                  ...current,
                  phase: "ready",
                  notice: null
                }
              : current
          );
          void port.cancel();
        }
        if (requiresUnlock) {
          dispatch({ type: "APP_BACKGROUNDED", at: now() });
        }
      } else if (next === "active") {
        if (requiresUnlock) {
          dispatch({
            type: "APP_BECAME_ACTIVE",
            at: now(),
            timeoutMs: relockTimeoutMs
          });
        }
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
  }, [
    now,
    onboardingPreflight.phase,
    port,
    profile,
    relockTimeoutMs,
    requiresUnlock,
    subjectId
  ]);

  useEffect(() => {
    const grant = onboardingGrantRef.current;
    if (
      !grant ||
      grant.subjectId !== subjectId ||
      onboardingPreflight.phase !== "authorized" ||
      requiresUnlock
    ) {
      return;
    }
    const remaining = Math.max(
      0,
      ONBOARDING_AUTHORIZATION_TTL_MS -
        (now() - grant.authorizedAt)
    );
    const timeout = setTimeout(() => {
      if (onboardingGrantRef.current !== grant) return;
      onboardingRequestVersionRef.current += 1;
      onboardingGrantRef.current = null;
      setOnboardingPreflight((current) =>
        current.phase === "authorized"
          ? {
              ...current,
              phase: "ready",
              notice: null
            }
          : current
      );
    }, remaining);
    return () => clearTimeout(timeout);
  }, [
    now,
    onboardingPreflight.phase,
    requiresUnlock,
    subjectId
  ]);

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
    if (result.success) {
      releasedSubjectRef.current = requestedSubject;
    }
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

  const checkOnboardingProtection =
    useCallback(async (): Promise<DeviceAuthCapability | null> => {
      const requestVersion =
        onboardingRequestVersionRef.current + 1;
      onboardingRequestVersionRef.current = requestVersion;
      const requestedSubject = subjectId;

      if (profile !== "native-secure") {
        setOnboardingPreflight((current) => ({
          phase: "bypassed",
          capability: null,
          intent: current.intent,
          notice: null
        }));
        return null;
      }

      if (!requestedSubject) {
        const capability: DeviceAuthCapability = {
          kind: "unavailable",
          reason: "check-failed"
        };
        setOnboardingPreflight({
          phase: "unavailable",
          capability,
          intent: null,
          notice: null
        });
        return capability;
      }

      setOnboardingPreflight((current) => ({
        phase: "checking",
        capability: current.capability,
        intent: current.intent,
        notice: null
      }));
      const capability = await port.assess().catch(
        (): DeviceAuthCapability => ({
          kind: "unavailable",
          reason: "check-failed"
        })
      );
      if (
        activeSubjectRef.current !== requestedSubject ||
        onboardingRequestVersionRef.current !== requestVersion
      ) {
        return null;
      }
      setOnboardingPreflight((current) => ({
        phase:
          capability.kind === "available"
            ? "ready"
            : "unavailable",
        capability,
        intent: current.intent,
        notice: null
      }));
      return capability;
    }, [port, profile, subjectId]);

  const authorizeOnboarding = useCallback(
    async (
      intent: OnboardingFirstRecordIntent
    ): Promise<OnboardingDeviceAuthorization | null> => {
      if (onboardingAuthorizeInFlightRef.current) return null;
      const requestedSubject = subjectId;

      if (profile !== "native-secure") {
        setOnboardingHandoffRestoreState("ready");
        setDurableFirstRecordIntent(intent);
        setOnboardingPreflight({
          phase: "bypassed",
          capability: null,
          intent,
          notice: null
        });
        return { kind: "bypassed", intent };
      }
      if (onboardingHandoffRestoreState !== "ready") {
        return null;
      }
      if (!requestedSubject) {
        setOnboardingPreflight({
          phase: "unavailable",
          capability: {
            kind: "unavailable",
            reason: "check-failed"
          },
          intent,
          notice: null
        });
        return null;
      }

      const existingGrant = onboardingGrantRef.current;
      if (
        existingGrant?.subjectId === requestedSubject &&
        existingGrant.intent === intent &&
        now() - existingGrant.authorizedAt <=
          ONBOARDING_AUTHORIZATION_TTL_MS
      ) {
        setOnboardingHandoffRestoreState("ready");
        setDurableFirstRecordIntent(intent);
        setOnboardingPreflight({
          phase: "authorized",
          capability: existingGrant.capability,
          intent,
          notice: null
        });
        return { kind: "authorized", intent };
      }

      onboardingAuthorizeInFlightRef.current = true;
      let capability =
        onboardingPreflight.capability?.kind === "available"
          ? onboardingPreflight.capability
          : await checkOnboardingProtection();
      if (
        activeSubjectRef.current !== requestedSubject ||
        capability?.kind !== "available"
      ) {
        onboardingAuthorizeInFlightRef.current = false;
        return null;
      }

      const authorizationVersion =
        onboardingRequestVersionRef.current + 1;
      onboardingRequestVersionRef.current = authorizationVersion;
      setOnboardingPreflight({
        phase: "authorizing",
        capability,
        intent,
        notice: null
      });
      const copy = onboardingDevicePreflightCopy(
        language,
        capability
      );
      const result = await port
        .authenticate({
          title: copy.promptTitle,
          subtitle: copy.promptSubtitle,
          description: copy.promptDescription,
          cancelLabel: copy.cancelLabel,
          fallbackLabel: copy.fallbackLabel
        })
        .catch(
          (): {
            readonly success: false;
            readonly error: DeviceAuthError;
          } => ({
            success: false,
            error: "unknown"
          })
        );
      if (
        activeSubjectRef.current !== requestedSubject ||
        onboardingRequestVersionRef.current !==
          authorizationVersion
      ) {
        onboardingAuthorizeInFlightRef.current = false;
        return null;
      }
      if (result.success) {
        try {
          await onboardingHandoffStore.save(
            requestedSubject,
            intent,
            now()
          );
        } catch {
          onboardingAuthorizeInFlightRef.current = false;
          setOnboardingPreflight({
            phase: "ready",
            capability,
            intent,
            notice: "failed"
          });
          return null;
        }
        if (
          activeSubjectRef.current !== requestedSubject ||
          onboardingRequestVersionRef.current !==
            authorizationVersion
        ) {
          onboardingAuthorizeInFlightRef.current = false;
          await onboardingHandoffStore
            .clear(requestedSubject)
            .catch(() => undefined);
          return null;
        }
        onboardingGrantRef.current = {
          subjectId: requestedSubject,
          intent,
          capability,
          authorizedAt: now()
        };
        onboardingAuthorizeInFlightRef.current = false;
        setOnboardingHandoffRestoreState("ready");
        setDurableFirstRecordIntent(intent);
        setOnboardingPreflight({
          phase: "authorized",
          capability,
          intent,
          notice: null
        });
        return { kind: "authorized", intent };
      }

      onboardingAuthorizeInFlightRef.current = false;
      const unavailable =
        result.error === "passcode_not_set" ||
        result.error === "not_enrolled"
          ? ({
              kind: "unavailable",
              reason: "passcode-not-set"
            } as const)
          : result.error === "not_available"
            ? ({
                kind: "unavailable",
                reason: "not-available"
              } as const)
            : null;
      if (unavailable) {
        capability = unavailable;
        setOnboardingPreflight({
          phase: "unavailable",
          capability,
          intent,
          notice: null
        });
        return null;
      }
      const notice: OnboardingDevicePreflightNotice =
        result.error === "user_cancel" ||
        result.error === "app_cancel" ||
        result.error === "system_cancel" ||
        result.error === "user_fallback"
          ? "cancelled"
          : result.error === "lockout"
            ? "locked-out"
            : "failed";
      setOnboardingPreflight({
        phase: "ready",
        capability,
        intent,
        notice
      });
      return null;
    },
    [
      checkOnboardingProtection,
      language,
      now,
      onboardingPreflight.capability,
      onboardingHandoffRestoreState,
      onboardingHandoffStore,
      port,
      profile,
      subjectId
    ]
  );

  const clearOnboardingAuthorization = useCallback(() => {
    onboardingRequestVersionRef.current += 1;
    onboardingGrantRef.current = null;
    setDurableFirstRecordIntent(null);
    if (profile === "native-secure" && subjectId) {
      void onboardingHandoffStore
        .clear(subjectId)
        .catch(() => undefined);
    }
    setOnboardingPreflight((current) => ({
      phase:
        current.capability?.kind === "available"
          ? "ready"
          : current.capability?.kind === "unavailable"
            ? "unavailable"
            : profile === "native-secure"
              ? "idle"
              : "bypassed",
      capability: current.capability,
      intent: null,
      notice: null
    }));
  }, [onboardingHandoffStore, profile, subjectId]);

  const retryOnboardingHandoffRestore = useCallback(() => {
    if (profile === "native-secure" && subjectId) {
      setOnboardingHandoffRestoreState("loading");
      setOnboardingHandoffRestoreAttempt((current) => current + 1);
    }
  }, [profile, subjectId]);

  const completeOnboardingHandoff = useCallback(
    async (intent: OnboardingFirstRecordIntent) => {
      const activeSubject = subjectId;
      setDurableFirstRecordIntent((current) =>
        current === intent ? null : current
      );
      setOnboardingPreflight((current) =>
        current.intent === intent
          ? initialOnboardingDevicePreflightState
          : current
      );
      if (
        profile === "native-secure" &&
        activeSubject
      ) {
        await onboardingHandoffStore.clear(activeSubject);
      }
    },
    [onboardingHandoffStore, profile, subjectId]
  );

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
      vaultReleased:
        !nativeSubjectProtection ||
        (onboardingHandoffRestoreState === "ready" &&
          ((state.phase === "unlocked" &&
            releasedSubjectRef.current === subjectId) ||
            Boolean(matchingOnboardingGrant))),
      previewBypass,
      onboardingPreflight,
      pendingFirstRecordIntent: durableFirstRecordIntent,
      onboardingHandoffRestoreState,
      checkOnboardingProtection,
      authorizeOnboarding,
      clearOnboardingAuthorization,
      retryOnboardingHandoffRestore,
      completeOnboardingHandoff,
      unlock,
      retryCapability,
      lockNow
    }),
    [
      lockNow,
      authorizeOnboarding,
      checkOnboardingProtection,
      clearOnboardingAuthorization,
      completeOnboardingHandoff,
      durableFirstRecordIntent,
      matchingOnboardingGrant,
      nativeSubjectProtection,
      onboardingHandoffRestoreState,
      onboardingPreflight,
      previewBypass,
      requiresUnlock,
      retryCapability,
      retryOnboardingHandoffRestore,
      state,
      subjectId,
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
