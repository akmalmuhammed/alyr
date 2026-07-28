import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren
} from "react";
import { AppState } from "react-native";

import { useAuthFlow } from "@/auth/AuthFlowProvider";
import type {
  AuthGatewayMode,
  AuthSessionDescriptor
} from "@/auth/types";
import {
  deriveAuthenticatedVaultScope,
  type VaultScope
} from "@/data/vaultScope";
import {
  DEFAULT_REVIEW_REMINDER_PREFERENCES,
  type ReviewReminderPreferences
} from "@/domain/reviewReminders";
import type { NativeWorkspace } from "@/domain/model";
import { useWorkspace } from "@/state/WorkspaceProvider";

import {
  createExpoLocalReviewReminderManager
} from "./expoReviewReminderRuntime";
import type {
  LocalReviewReminderManager,
  ReviewReminderCancellationResult,
  ReviewNotificationPermission,
  ReviewReminderReconcileResult
} from "./reviewReminderAdapter";

export type ReviewReminderStatus =
  | "loading"
  | "unavailable"
  | "disabled"
  | "enabled"
  | "no-review"
  | "permission-blocked"
  | "cleanup-pending"
  | "error";

export interface ReviewReminderViewState {
  readonly status: ReviewReminderStatus;
  readonly enabled: boolean;
  readonly scheduledAt: string | null;
  readonly permission: Extract<
    ReviewNotificationPermission,
    "denied" | "undetermined"
  > | null;
}

export interface ReviewReminderContextValue
  extends ReviewReminderViewState {
  readonly available: boolean;
  readonly busy: boolean;
  /**
   * This is the only path that may show the operating-system permission sheet.
   */
  readonly enable: () => Promise<ReviewReminderStatus>;
  readonly disable: () => Promise<ReviewReminderStatus>;
}

export interface ReviewReminderManagerPort {
  getPreferences(
    scope: VaultScope
  ): Promise<ReviewReminderPreferences>;
  reconcile(input: {
    readonly scope: VaultScope | null;
    readonly workspace: NativeWorkspace | null;
    readonly runtime: "supabase" | "preview" | "unavailable";
  }): Promise<ReviewReminderReconcileResult>;
  optIn(input: {
    readonly scope: VaultScope | null;
    readonly workspace: NativeWorkspace | null;
    readonly runtime: "supabase" | "preview" | "unavailable";
    readonly localHour: number;
    readonly localMinute: number;
  }): Promise<ReviewReminderReconcileResult>;
  optOut(
    scope: VaultScope | null
  ): Promise<ReviewReminderCancellationResult>;
  cancel(
    scope?: VaultScope | null
  ): Promise<ReviewReminderCancellationResult>;
  retryPendingCleanup(): Promise<ReviewReminderCancellationResult>;
}

interface SignedReminderIdentity {
  readonly accountId: string;
  readonly householdId: string;
}

interface ReviewReminderProviderProps extends PropsWithChildren {
  readonly manager?: ReviewReminderManagerPort;
  readonly deriveScope?: (
    accountId: string,
    householdId: string
  ) => Promise<VaultScope>;
}

const INITIAL_STATE: ReviewReminderViewState = Object.freeze({
  status: "unavailable",
  enabled: false,
  scheduledAt: null,
  permission: null
});

const ReviewReminderContext =
  createContext<ReviewReminderContextValue | null>(null);
const ReviewReminderWorkspaceContext =
  createContext<((workspace: NativeWorkspace | null) => void) | null>(
    null
  );

/**
 * Mirrors the signed-workspace gate. A reminder scope is never derived for
 * preview, unverified, partially onboarded, or membership-incomplete sessions.
 */
export function signedReminderIdentity(
  mode: AuthGatewayMode,
  bootstrapState: "bootstrapping" | "ready" | "error",
  session: AuthSessionDescriptor | null
): SignedReminderIdentity | null {
  if (
    mode !== "supabase" ||
    bootstrapState !== "ready" ||
    !session ||
    session.assurance !== "verified-email" ||
    !session.identity.emailVerified ||
    session.onboarding !== "complete" ||
    !session.activeHouseholdId ||
    !session.activeMembershipId ||
    !session.activeHouseholdRole
  ) {
    return null;
  }
  return {
    accountId: session.identity.id,
    householdId: session.activeHouseholdId
  };
}

export function reviewReminderViewState(
  result: ReviewReminderReconcileResult,
  preferences: ReviewReminderPreferences
): ReviewReminderViewState {
  switch (result.kind) {
    case "scheduled":
    case "unchanged":
      return {
        status: "enabled",
        enabled: true,
        scheduledAt: result.scheduledAt,
        permission: null
      };
    case "no-review":
      return {
        status: "no-review",
        enabled: preferences.enabled,
        scheduledAt: null,
        permission: null
      };
    case "permission-blocked":
      return {
        status: "permission-blocked",
        enabled: preferences.enabled,
        scheduledAt: null,
        permission: result.permission
      };
    case "cleanup-pending":
      return {
        status: "cleanup-pending",
        enabled: preferences.enabled,
        scheduledAt: null,
        permission: null
      };
    case "disabled":
      return {
        status: "disabled",
        enabled: false,
        scheduledAt: null,
        permission: null
      };
    case "inactive":
    default:
      return INITIAL_STATE;
  }
}

function workspaceMatchesIdentity(
  workspace: NativeWorkspace | null,
  identity: SignedReminderIdentity | null
): boolean {
  return Boolean(
    identity &&
      workspace &&
      workspace.mode === "personal" &&
      workspace.household.id === identity.householdId
  );
}

function errorState(
  previous: ReviewReminderViewState
): ReviewReminderViewState {
  return {
    ...previous,
    status: "error",
    scheduledAt: null,
    permission: null
  };
}

function cleanupPendingState(
  enabled: boolean
): ReviewReminderViewState {
  return {
    status: "cleanup-pending",
    enabled,
    scheduledAt: null,
    permission: null
  };
}

export function ReviewReminderProvider({
  children,
  manager,
  deriveScope = deriveAuthenticatedVaultScope
}: ReviewReminderProviderProps) {
  const { bootstrapState, mode, session } = useAuthFlow();
  const resolvedManager = useMemo<ReviewReminderManagerPort>(
    () =>
      manager ??
      (createExpoLocalReviewReminderManager() as LocalReviewReminderManager),
    [manager]
  );
  const identity = useMemo(
    () => signedReminderIdentity(mode, bootstrapState, session),
    [bootstrapState, mode, session]
  );
  const identityKey = identity
    ? `${identity.accountId}\u0000${identity.householdId}`
    : null;
  const previousIdentityKey = useRef<string | null | undefined>(
    undefined
  );
  const authGeneration = useRef(0);
  const stateRequest = useRef(0);
  const scopeRef = useRef<VaultScope | null>(null);
  const workspaceRef = useRef<NativeWorkspace | null>(null);
  const identityRef = useRef<SignedReminderIdentity | null>(identity);
  const [scope, setScope] = useState<VaultScope | null>(null);
  const [workspace, setWorkspace] = useState<NativeWorkspace | null>(
    null
  );
  const [viewState, setViewState] =
    useState<ReviewReminderViewState>(INITIAL_STATE);
  const [busy, setBusy] = useState(false);

  identityRef.current = identity;
  scopeRef.current = scope;
  workspaceRef.current = workspace;

  useEffect(() => {
    const generation = ++authGeneration.current;
    const request = ++stateRequest.current;

    if (bootstrapState !== "ready") {
      // Bootstrap and recovery failures are not proof of sign-out. Keep any
      // valid device-local schedule until the auth gateway resolves.
      return;
    }

    const previous = previousIdentityKey.current;
    const previousScope = scopeRef.current;
    previousIdentityKey.current = identityKey;
    scopeRef.current = null;
    setScope(null);
    setBusy(false);

    const publishCancellation = (
      fallback: ReviewReminderViewState
    ): void => {
      void resolvedManager.cancel(previousScope).then(
        (result) => {
          if (
            authGeneration.current !== generation ||
            stateRequest.current !== request
          ) {
            return;
          }
          setViewState(
            result.cleanupPending
              ? cleanupPendingState(false)
              : fallback
          );
        },
        () => {
          if (
            authGeneration.current !== generation ||
            stateRequest.current !== request
          ) {
            return;
          }
          setViewState((current) => errorState(current));
        }
      );
    };

    if (!identity || !identityKey) {
      setViewState(INITIAL_STATE);
      publishCancellation(INITIAL_STATE);
      return;
    }

    if (previous !== undefined && previous !== identityKey) {
      const loadingState: ReviewReminderViewState = {
        ...INITIAL_STATE,
        status: "loading"
      };
      setViewState(loadingState);
      publishCancellation(loadingState);
    } else if (previous === undefined) {
      setViewState({
        ...INITIAL_STATE,
        status: "loading"
      });
    }

    void deriveScope(identity.accountId, identity.householdId)
      .then((nextScope) => {
        if (
          authGeneration.current !== generation ||
          identityRef.current?.accountId !== identity.accountId ||
          identityRef.current?.householdId !== identity.householdId
        ) {
          return;
        }
        scopeRef.current = nextScope;
        setScope(nextScope);
      })
      .catch(() => {
        if (authGeneration.current !== generation) return;
        setViewState((current) => errorState(current));
      });
  }, [
    bootstrapState,
    deriveScope,
    identityKey,
    resolvedManager
  ]);

  useEffect(() => {
    if (!identity || !scope) return;

    if (workspace === null) {
      // A released signed vault may temporarily disappear while the device is
      // locked. Keeping the existing notification is intentional.
      return;
    }

    if (!workspaceMatchesIdentity(workspace, identity)) {
      const request = ++stateRequest.current;
      void resolvedManager.cancel(scope).then(
        (result) => {
          if (stateRequest.current !== request) return;
          if (result.cleanupPending) {
            setViewState(cleanupPendingState(false));
            return;
          }
          setViewState(workspace.mode === "sample"
            ? INITIAL_STATE
            : {
                ...INITIAL_STATE,
                status: "loading"
              });
        },
        () => {
          if (stateRequest.current !== request) return;
          setViewState((current) => errorState(current));
        }
      );
      return;
    }

    const request = ++stateRequest.current;
    void (async () => {
      try {
        const preferences =
          await resolvedManager.getPreferences(scope);
        const result = await resolvedManager.reconcile({
          scope,
          workspace,
          runtime: "supabase"
        });
        if (
          stateRequest.current !== request ||
          scopeRef.current?.scopeId !== scope.scopeId
        ) {
          return;
        }
        setViewState(
          reviewReminderViewState(result, preferences)
        );
      } catch {
        if (stateRequest.current !== request) return;
        setViewState((current) => errorState(current));
      }
    })();
  }, [identity, resolvedManager, scope, workspace]);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      "change",
      (nextState) => {
        if (nextState !== "active") return;
        const request = ++stateRequest.current;
        const activeScope = scopeRef.current;
        const activeWorkspace = workspaceRef.current;
        const activeIdentity = identityRef.current;

        void (async () => {
          try {
            if (
              activeScope &&
              activeWorkspace &&
              workspaceMatchesIdentity(
                activeWorkspace,
                activeIdentity
              )
            ) {
              const preferences =
                await resolvedManager.getPreferences(activeScope);
              const result = await resolvedManager.reconcile({
                scope: activeScope,
                workspace: activeWorkspace,
                runtime: "supabase"
              });
              if (
                stateRequest.current !== request ||
                scopeRef.current?.scopeId !== activeScope.scopeId
              ) {
                return;
              }
              setViewState(
                reviewReminderViewState(result, preferences)
              );
              return;
            }

            const result =
              await resolvedManager.retryPendingCleanup();
            if (stateRequest.current !== request) return;
            if (result.cleanupPending) {
              setViewState(cleanupPendingState(false));
            } else if (
              !activeIdentity ||
              (activeWorkspace !== null &&
                !workspaceMatchesIdentity(
                  activeWorkspace,
                  activeIdentity
                ))
            ) {
              setViewState(INITIAL_STATE);
            }
          } catch {
            if (stateRequest.current !== request) return;
            setViewState((current) => errorState(current));
          }
        })();
      }
    );
    return () => subscription?.remove?.();
  }, [resolvedManager]);

  const publishWorkspace = useCallback(
    (nextWorkspace: NativeWorkspace | null) => {
      workspaceRef.current = nextWorkspace;
      setWorkspace(nextWorkspace);
    },
    []
  );

  const available = workspaceMatchesIdentity(
    workspace,
    identity
  ) && Boolean(scope);

  const enable = useCallback(async (): Promise<ReviewReminderStatus> => {
    const activeScope = scopeRef.current;
    const activeWorkspace = workspaceRef.current;
    const activeIdentity = identityRef.current;
    if (
      !activeScope ||
      !activeWorkspace ||
      !workspaceMatchesIdentity(activeWorkspace, activeIdentity)
    ) {
      setViewState(INITIAL_STATE);
      return "unavailable";
    }

    const request = ++stateRequest.current;
    setBusy(true);
    try {
      const result = await resolvedManager.optIn({
        scope: activeScope,
        workspace: activeWorkspace,
        runtime: "supabase",
        localHour: DEFAULT_REVIEW_REMINDER_PREFERENCES.localHour,
        localMinute: DEFAULT_REVIEW_REMINDER_PREFERENCES.localMinute
      });
      const preferences =
        await resolvedManager.getPreferences(activeScope);
      const nextState = reviewReminderViewState(
        result,
        preferences
      );
      if (
        stateRequest.current === request &&
        scopeRef.current?.scopeId === activeScope.scopeId
      ) {
        setViewState(nextState);
      }
      return nextState.status;
    } catch {
      if (stateRequest.current === request) {
        setViewState((current) => errorState(current));
      }
      return "error";
    } finally {
      if (stateRequest.current === request) {
        setBusy(false);
      }
    }
  }, [resolvedManager]);

  const disable = useCallback(async (): Promise<ReviewReminderStatus> => {
    const activeScope = scopeRef.current;
    if (!activeScope) {
      setViewState(INITIAL_STATE);
      return "unavailable";
    }

    const request = ++stateRequest.current;
    setBusy(true);
    try {
      const result = await resolvedManager.optOut(activeScope);
      const nextState = result.cleanupPending
        ? cleanupPendingState(false)
        : {
            status: "disabled" as const,
            enabled: false,
            scheduledAt: null,
            permission: null
          };
      if (
        stateRequest.current === request &&
        scopeRef.current?.scopeId === activeScope.scopeId
      ) {
        setViewState(nextState);
      }
      return nextState.status;
    } catch {
      if (stateRequest.current === request) {
        setViewState((current) => errorState(current));
      }
      return "error";
    } finally {
      if (stateRequest.current === request) {
        setBusy(false);
      }
    }
  }, [resolvedManager]);

  const value = useMemo<ReviewReminderContextValue>(
    () => ({
      ...viewState,
      available,
      busy,
      enable,
      disable
    }),
    [available, busy, disable, enable, viewState]
  );

  return (
    <ReviewReminderWorkspaceContext.Provider
      value={publishWorkspace}
    >
      <ReviewReminderContext.Provider value={value}>
        {children}
      </ReviewReminderContext.Provider>
    </ReviewReminderWorkspaceContext.Provider>
  );
}

/**
 * Keep this bridge inside SessionBoundWorkspaceProvider while the reminder
 * provider stays outside it. That lets account changes be observed across
 * vault remounts without treating a device lock as sign-out.
 */
export function ReviewReminderWorkspaceObserver({
  children
}: PropsWithChildren) {
  const publishWorkspace = useContext(
    ReviewReminderWorkspaceContext
  );
  const { workspace } = useWorkspace();

  if (!publishWorkspace) {
    throw new Error(
      "ReviewReminderWorkspaceObserver must be used inside ReviewReminderProvider."
    );
  }

  useEffect(() => {
    publishWorkspace(workspace);
    return () => publishWorkspace(null);
  }, [publishWorkspace, workspace]);

  return children;
}

export function useReviewReminder(): ReviewReminderContextValue {
  const value = useContext(ReviewReminderContext);
  if (!value) {
    throw new Error(
      "useReviewReminder must be used inside ReviewReminderProvider."
    );
  }
  return value;
}
