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
import { randomUUID } from "expo-crypto";
import {
  API_ERROR_VERSION,
  CONTRACT_API_VERSION,
  type AccountDeletionPort,
  type AccountDeletionReceipt,
  type ContractError,
  type HouseholdAccessPort,
  type HouseholdAccessSnapshot,
  type HouseholdInvite,
  type HouseholdInviteReview,
  type HouseholdMembership,
  type HouseholdRole,
  type Result
} from "@alyr/contracts";

import { createRuntimeAuthGateway } from "./runtime";
import {
  createRuntimePendingHouseholdInviteStore,
  normalizeHouseholdInviteCode,
  type PendingHouseholdInvite,
  type PendingHouseholdInviteStore
} from "./pendingHouseholdInvite";
import {
  createRuntimePendingHouseholdProvisionStore,
  type PendingHouseholdProvision,
  type PendingHouseholdProvisionStore
} from "./pendingHouseholdProvision";
import type {
  AccountAuthGateway,
  AuthAttempt,
  AuthFailure,
  AuthIdentity,
  AuthOnboardingCompletion,
  AuthSessionDescriptor,
  ConfirmationRequest,
  FirstCaptureIntent,
  PasswordRecoveryGrant,
  PasswordRecoveryRequest
} from "./types";
import { normalizeEmail } from "./validation";

interface AuthFlowContextValue {
  readonly mode: AccountAuthGateway["mode"];
  readonly bootstrapState: "bootstrapping" | "ready" | "error";
  readonly busy: boolean;
  readonly error: AuthFailure | null;
  readonly statusMessage: string | null;
  readonly email: string;
  readonly identity: AuthIdentity | null;
  readonly session: AuthSessionDescriptor | null;
  readonly activeHouseholdId: string | null;
  readonly confirmation: ConfirmationRequest | null;
  readonly passwordRecovery: PasswordRecoveryRequest | null;
  readonly passwordRecoveryGrant: PasswordRecoveryGrant | null;
  /**
   * True from a verified provider recovery exchange until that temporary
   * session is successfully signed out. Unlike the one-use grant, this remains
   * true after a password update so the completion screen can finish cleanup.
   */
  readonly passwordRecoverySessionActive: boolean;
  readonly pendingHouseholdInvite: PendingHouseholdInvite | null;
  readonly pendingHouseholdInviteReview: HouseholdInviteReview | null;
  readonly pendingHouseholdInviteDeferred: boolean;
  readonly householdName: string;
  readonly firstCaptureIntent: FirstCaptureIntent | null;
  readonly householdAccessSnapshot: HouseholdAccessSnapshot | null;
  readonly householdAccessStatus:
    | "idle"
    | "refreshing"
    | "ready"
    | "error";
  readonly householdAccessError: ContractError | null;
  readonly createAccount: (
    email: string,
    password: string,
    pilotAccessCode?: string
  ) => Promise<AuthAttempt | null>;
  readonly signIn: (
    email: string,
    password: string
  ) => Promise<AuthAttempt | null>;
  readonly continuePreview: () => Promise<AuthSessionDescriptor | null>;
  readonly retryBootstrap: () => Promise<boolean>;
  readonly checkConfirmedSession: () => Promise<AuthSessionDescriptor | null>;
  readonly exchangeConfirmationCode: (
    code: string
  ) => Promise<AuthSessionDescriptor | null>;
  readonly resendConfirmation: () => Promise<boolean>;
  readonly requestPasswordRecovery: (email: string) => Promise<boolean>;
  readonly exchangePasswordRecoveryCode: (
    code: string
  ) => Promise<AuthSessionDescriptor | null>;
  readonly cancelPasswordRecovery: () => Promise<boolean>;
  readonly updatePassword: (password: string) => Promise<boolean>;
  readonly provisionHousehold: (name: string) => Promise<string | null>;
  readonly completeOnboarding: () => Promise<boolean>;
  readonly createHouseholdInvite: (
    role: Exclude<HouseholdRole, "owner">,
    expiresInHours: 24 | 72 | 168
  ) => Promise<HouseholdInvite | null>;
  readonly acceptHouseholdInvite: (
    oneTimeCode: string
  ) => Promise<HouseholdMembership | null>;
  readonly stageHouseholdInvite: (
    oneTimeCode: string
  ) => Promise<boolean>;
  readonly reviewPendingHouseholdInvite: () => Promise<HouseholdInviteReview | null>;
  readonly acceptPendingHouseholdInvite: () => Promise<HouseholdMembership | null>;
  readonly deferPendingHouseholdInvite: () => void;
  readonly discardPendingHouseholdInvite: () => Promise<void>;
  readonly refreshHouseholdAccess: () => Promise<boolean>;
  readonly changeHouseholdMemberRole: (
    membershipId: string,
    expectedVersion: number,
    role: "editor" | "viewer"
  ) => Promise<boolean>;
  readonly revokeHouseholdMember: (
    membershipId: string,
    expectedVersion: number
  ) => Promise<boolean>;
  readonly cancelPendingHouseholdInvite: (
    inviteId: string,
    expectedVersion: number
  ) => Promise<boolean>;
  readonly transferHouseholdOwnership: (
    targetMembershipId: string,
    expectedTargetVersion: number
  ) => Promise<boolean>;
  readonly selectHousehold: (householdId: string) => void;
  readonly signOut: () => Promise<boolean>;
  readonly deleteAccount: (
    password: string,
    confirmationEmail: string
  ) => Promise<Result<AccountDeletionReceipt>>;
  readonly finalizeAccountDeletion: () => Promise<void>;
  readonly setHouseholdName: (name: string) => void;
  readonly setFirstCaptureIntent: (intent: FirstCaptureIntent) => void;
  readonly createCompletion: () => AuthOnboardingCompletion | null;
  readonly clearError: () => void;
  readonly clearStatus: () => void;
  readonly reset: () => void;
}

const AuthFlowContext = createContext<AuthFlowContextValue | null>(null);

export const PREVIEW_HOUSEHOLD_INVITE_CODE = "ALYR-PREVIEW";

interface PreviewHouseholdInviteRecord {
  readonly invite: HouseholdInvite;
  readonly householdId: string;
  readonly householdName: string;
  readonly createdByAccountId: string;
  acceptedMembership: HouseholdMembership | null;
}

function authFailureFromContract(error: ContractError): AuthFailure {
  switch (error.code) {
    case "AUTHENTICATION_REQUIRED":
    case "SESSION_EXPIRED":
      return {
        code: "session_missing",
        message: "Your account session needs to be refreshed.",
        retryable: true
      };
    case "OFFLINE":
    case "STORAGE_UNAVAILABLE":
      return {
        code: "network_unavailable",
        message: error.message,
        retryable: true
      };
    case "RATE_LIMITED":
      return {
        code: "rate_limited",
        message: error.message,
        retryable: true
      };
    case "VALIDATION_FAILED":
    case "INVALID_COMMAND":
    case "AUTHORIZATION_DENIED":
    case "NOT_FOUND":
      return {
        code: "invalid_request",
        message: error.message,
        retryable: error.retryable
      };
    default:
      return {
        code: "unexpected",
        message: error.message,
        retryable: error.retryable
      };
  }
}

function sessionConfirmsPendingHouseholdProvision(
  provision: PendingHouseholdProvision,
  session: AuthSessionDescriptor
): boolean {
  return (
    session.identity.id === provision.accountId &&
    session.activeHouseholdId === provision.householdId &&
    Boolean(session.activeMembershipId) &&
    session.activeHouseholdRole === "owner"
  );
}

export function AuthFlowProvider({
  children,
  gateway,
  householdAccess,
  accountDeletion,
  operationIdFactory,
  householdIdFactory,
  pendingInviteStore,
  pendingHouseholdProvisionStore
}: PropsWithChildren<{
  readonly gateway?: AccountAuthGateway;
  readonly householdAccess?: HouseholdAccessPort;
  readonly accountDeletion?: AccountDeletionPort;
  readonly operationIdFactory?: () => string;
  readonly householdIdFactory?: () => string;
  readonly pendingInviteStore?: PendingHouseholdInviteStore;
  readonly pendingHouseholdProvisionStore?: PendingHouseholdProvisionStore;
}>) {
  const gatewayRef = useRef<AccountAuthGateway>(
    gateway ?? createRuntimeAuthGateway()
  );
  const householdAccessRef = useRef(householdAccess);
  const accountDeletionRef = useRef(accountDeletion);
  const pendingInviteStoreRef = useRef(
    pendingInviteStore ?? createRuntimePendingHouseholdInviteStore()
  );
  const pendingHouseholdProvisionStoreRef = useRef(
    pendingHouseholdProvisionStore ??
      createRuntimePendingHouseholdProvisionStore()
  );
  const operationIdFactoryRef = useRef(
    operationIdFactory ?? randomUUID
  );
  const householdIdFactoryRef = useRef(
    householdIdFactory ?? randomUUID
  );
  const [bootstrapState, setBootstrapState] = useState<
    "bootstrapping" | "ready" | "error"
  >("bootstrapping");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthFailure | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [identity, setIdentity] = useState<AuthIdentity | null>(null);
  const [session, setSession] = useState<AuthSessionDescriptor | null>(null);
  const [confirmation, setConfirmation] =
    useState<ConfirmationRequest | null>(null);
  const [passwordRecovery, setPasswordRecovery] =
    useState<PasswordRecoveryRequest | null>(null);
  const [passwordRecoveryGrant, setPasswordRecoveryGrant] =
    useState<PasswordRecoveryGrant | null>(null);
  const [
    pendingHouseholdInvite,
    setPendingHouseholdInviteState
  ] = useState<PendingHouseholdInvite | null>(null);
  const [
    pendingHouseholdInviteReview,
    setPendingHouseholdInviteReview
  ] = useState<HouseholdInviteReview | null>(null);
  const [
    pendingHouseholdInviteDeferred,
    setPendingHouseholdInviteDeferred
  ] = useState(false);
  const [
    passwordRecoverySessionActive,
    setPasswordRecoverySessionActive
  ] = useState(false);
  const [householdName, updateHouseholdName] = useState("");
  const [firstCaptureIntent, updateFirstCaptureIntent] =
    useState<FirstCaptureIntent | null>(null);
  const [householdAccessSnapshot, setHouseholdAccessSnapshot] =
    useState<HouseholdAccessSnapshot | null>(null);
  const [householdAccessStatus, setHouseholdAccessStatus] = useState<
    "idle" | "refreshing" | "ready" | "error"
  >("idle");
  const [householdAccessError, setHouseholdAccessError] =
    useState<ContractError | null>(null);
  const activeAccountIdRef = useRef<string | null>(null);
  const activeSessionRef = useRef<AuthSessionDescriptor | null>(null);
  const pendingHouseholdInviteRef =
    useRef<PendingHouseholdInvite | null>(null);
  const pendingHouseholdInviteReviewRef =
    useRef<HouseholdInviteReview | null>(null);
  const pendingHouseholdProvisionRef =
    useRef<PendingHouseholdProvision | null>(null);
  const pendingHouseholdProvisionStoreStateRef = useRef<
    "pending" | "ready" | "blocked"
  >("pending");
  const previewInvitesRef = useRef(
    new Map<string, PreviewHouseholdInviteRecord>()
  );

  useEffect(() => {
    householdAccessRef.current = householdAccess;
  }, [householdAccess]);

  useEffect(() => {
    accountDeletionRef.current = accountDeletion;
  }, [accountDeletion]);

  useEffect(() => {
    operationIdFactoryRef.current = operationIdFactory ?? randomUUID;
  }, [operationIdFactory]);

  useEffect(() => {
    householdIdFactoryRef.current = householdIdFactory ?? randomUUID;
  }, [householdIdFactory]);

  const nextOperationId = useCallback((): string => {
    const operationId = operationIdFactoryRef.current();
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        operationId
      )
    ) {
      throw new Error(
        "Household administration requires a valid operation identity."
      );
    }
    return operationId;
  }, []);

  const nextHouseholdId = useCallback((): string => {
    const householdId = householdIdFactoryRef.current();
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        householdId
      )
    ) {
      throw new Error(
        "Household provisioning requires a valid household identity."
      );
    }
    return householdId;
  }, []);

  const discardPendingHouseholdProvision =
    useCallback(async (): Promise<boolean> => {
      try {
        await pendingHouseholdProvisionStoreRef.current.clear();
        pendingHouseholdProvisionRef.current = null;
        pendingHouseholdProvisionStoreStateRef.current = "ready";
        return true;
      } catch {
        pendingHouseholdProvisionStoreStateRef.current = "blocked";
        setError({
          code: "unexpected",
          message:
            "Household setup is confirmed, but its completed retry marker still needs cleanup.",
          retryable: true
        });
        return false;
      }
    }, []);

  const acceptSession = useCallback(
    (nextSession: AuthSessionDescriptor | null) => {
      const nextAccountId = nextSession?.identity.id ?? null;
      if (activeAccountIdRef.current !== nextAccountId) {
        updateHouseholdName("");
        updateFirstCaptureIntent(null);
        setHouseholdAccessSnapshot(null);
        setHouseholdAccessStatus("idle");
        setHouseholdAccessError(null);
      }
      if (
        householdAccessSnapshot?.householdId &&
        householdAccessSnapshot.householdId !==
          nextSession?.activeHouseholdId
      ) {
        setHouseholdAccessSnapshot(null);
        setHouseholdAccessStatus("idle");
        setHouseholdAccessError(null);
      }
      activeAccountIdRef.current = nextAccountId;
      activeSessionRef.current = nextSession;
      setSession(nextSession);
      setIdentity(nextSession?.identity ?? null);
      if (nextSession) {
        setEmail(nextSession.identity.email);
        setConfirmation(null);
      }
    },
    [householdAccessSnapshot?.householdId]
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        let storedInvite: PendingHouseholdInvite | null = null;
        try {
          storedInvite = await pendingInviteStoreRef.current.read();
        } catch {
          if (!active) return;
          setError({
            code: "unexpected",
            message:
              "The saved household invitation could not be restored.",
            retryable: true
          });
        }
        if (!active) return;
        pendingHouseholdInviteRef.current = storedInvite;
        setPendingHouseholdInviteState(storedInvite);
        let storedProvision: PendingHouseholdProvision | null = null;
        try {
          storedProvision =
            await pendingHouseholdProvisionStoreRef.current.read();
        } catch {
          if (!active) return;
          pendingHouseholdProvisionRef.current = null;
          pendingHouseholdProvisionStoreStateRef.current = "blocked";
          acceptSession(null);
          setPasswordRecoverySessionActive(false);
          setError({
            code: "unexpected",
            message:
              "The saved household setup operation could not be restored.",
            retryable: true
          });
          setBootstrapState("error");
          return;
        }
        if (!active) return;
        pendingHouseholdProvisionRef.current = storedProvision;
        pendingHouseholdProvisionStoreStateRef.current = "ready";
        const result = await gatewayRef.current.currentSession();
        if (!active) return;
        if (!result.ok) {
          acceptSession(null);
          setPasswordRecoverySessionActive(false);
          setError(result.error);
          setBootstrapState("error");
          return;
        }
        if (
          storedProvision &&
          result.value &&
          sessionConfirmsPendingHouseholdProvision(
            storedProvision,
            result.value
          )
        ) {
          const cleared = await discardPendingHouseholdProvision();
          if (!active) return;
          if (!cleared) {
            acceptSession(null);
            setPasswordRecoverySessionActive(false);
            setBootstrapState("error");
            return;
          }
        }
        acceptSession(result.value);
        setPasswordRecoverySessionActive(false);
        setBootstrapState("ready");
      } catch {
        if (!active) return;
        acceptSession(null);
        setPasswordRecoverySessionActive(false);
        setError({
          code: "unexpected",
          message: "The account session could not be restored.",
          retryable: true
        });
        setBootstrapState("error");
      }
    })();
    return () => {
      active = false;
    };
  }, [acceptSession, discardPendingHouseholdProvision]);

  const retryBootstrap = useCallback(async (): Promise<boolean> => {
    setBootstrapState("bootstrapping");
    setError(null);
    setStatusMessage(null);
    try {
      pendingHouseholdProvisionStoreStateRef.current = "pending";
      let pendingProvision: PendingHouseholdProvision | null;
      try {
        pendingProvision =
          await pendingHouseholdProvisionStoreRef.current.read();
      } catch {
        pendingHouseholdProvisionRef.current = null;
        pendingHouseholdProvisionStoreStateRef.current = "blocked";
        acceptSession(null);
        setPasswordRecoverySessionActive(false);
        setError({
          code: "unexpected",
          message:
            "The saved household setup operation could not be restored.",
          retryable: true
        });
        setBootstrapState("error");
        return false;
      }
      pendingHouseholdProvisionRef.current = pendingProvision;
      pendingHouseholdProvisionStoreStateRef.current = "ready";
      const result = await gatewayRef.current.currentSession();
      if (!result.ok) {
        acceptSession(null);
        setPasswordRecoverySessionActive(false);
        setError(result.error);
        setBootstrapState("error");
        return false;
      }
      if (
        pendingProvision &&
        result.value &&
        sessionConfirmsPendingHouseholdProvision(
          pendingProvision,
          result.value
        )
      ) {
        const cleared = await discardPendingHouseholdProvision();
        if (!cleared) {
          acceptSession(null);
          setPasswordRecoverySessionActive(false);
          setBootstrapState("error");
          return false;
        }
      }
      acceptSession(result.value);
      setPasswordRecoverySessionActive(false);
      setBootstrapState("ready");
      return true;
    } catch {
      acceptSession(null);
      setPasswordRecoverySessionActive(false);
      setError({
        code: "unexpected",
        message: "The account session could not be restored.",
        retryable: true
      });
      setBootstrapState("error");
      return false;
    }
  }, [acceptSession, discardPendingHouseholdProvision]);

  useEffect(
    () =>
      gatewayRef.current.onSessionChanged((nextSession) => {
        if (
          pendingHouseholdProvisionStoreStateRef.current !== "ready"
        ) {
          return;
        }
        const pendingProvision =
          pendingHouseholdProvisionRef.current;
        if (
          pendingProvision &&
          nextSession &&
          sessionConfirmsPendingHouseholdProvision(
            pendingProvision,
            nextSession
          )
        ) {
          void discardPendingHouseholdProvision().then((cleared) => {
            if (!cleared) {
              acceptSession(null);
              setPasswordRecoverySessionActive(false);
              setBootstrapState("error");
              return;
            }
            acceptSession(nextSession);
            setPasswordRecoverySessionActive(false);
            setBootstrapState("ready");
            setError(null);
          });
          return;
        }
        acceptSession(nextSession);
        setPasswordRecoverySessionActive(false);
        setBootstrapState("ready");
        setError(null);
      }),
    [acceptSession, discardPendingHouseholdProvision]
  );

  const prepareRequest = useCallback(() => {
    setError(null);
    setStatusMessage(null);
    setBusy(true);
  }, []);

  const discardPendingHouseholdInvite =
    useCallback(async (): Promise<void> => {
      pendingHouseholdInviteRef.current = null;
      pendingHouseholdInviteReviewRef.current = null;
      setPendingHouseholdInviteState(null);
      setPendingHouseholdInviteReview(null);
      setPendingHouseholdInviteDeferred(false);
      try {
        await pendingInviteStoreRef.current.clear();
      } catch {
        setError({
          code: "unexpected",
          message:
            "The household invitation was closed, but encrypted cleanup needs another attempt.",
          retryable: true
        });
      }
    }, []);

  const stageHouseholdInvite = useCallback(
    async (oneTimeCode: string): Promise<boolean> => {
      const normalized = normalizeHouseholdInviteCode(oneTimeCode);
      if (!normalized) {
        await discardPendingHouseholdInvite();
        setError({
          code: "invalid_request",
          message: "This household invitation link is incomplete.",
          retryable: false
        });
        return false;
      }
      const invite: PendingHouseholdInvite = {
        oneTimeCode: normalized,
        capturedAt: new Date().toISOString()
      };
      try {
        await pendingInviteStoreRef.current.write(invite);
        pendingHouseholdInviteRef.current = invite;
        pendingHouseholdInviteReviewRef.current = null;
        setPendingHouseholdInviteState(invite);
        setPendingHouseholdInviteReview(null);
        setPendingHouseholdInviteDeferred(false);
        setError(null);
        setStatusMessage(null);
        return true;
      } catch {
        pendingHouseholdInviteRef.current = null;
        pendingHouseholdInviteReviewRef.current = null;
        setPendingHouseholdInviteState(null);
        setPendingHouseholdInviteReview(null);
        setPendingHouseholdInviteDeferred(false);
        setError({
          code: "unexpected",
          message:
            "The household invitation could not be protected on this device.",
          retryable: true
        });
        return false;
      }
    },
    [discardPendingHouseholdInvite]
  );

  const finishAttempt = useCallback((attempt: AuthAttempt) => {
    setPasswordRecoverySessionActive(false);
    if (attempt.kind === "authenticated") {
      acceptSession(attempt.session);
      return;
    }
    acceptSession(null);
    setIdentity(attempt.identity);
    setEmail(attempt.identity.email);
    setConfirmation(attempt.confirmation);
  }, [acceptSession]);

  const createAccount = useCallback(
    async (
      emailValue: string,
      password: string,
      pilotAccessCode?: string
    ): Promise<AuthAttempt | null> => {
      prepareRequest();
      try {
        const householdInviteCode =
          pendingHouseholdInviteRef.current?.oneTimeCode;
        const result = await gatewayRef.current.signUp({
          email: normalizeEmail(emailValue),
          password,
          ...(householdInviteCode
            ? { householdInviteCode }
            : pilotAccessCode
              ? { pilotAccessCode }
              : {})
        });
        if (!result.ok) {
          setError(result.error);
          if (
            householdInviteCode &&
            result.error.code === "pilot_access_denied"
          ) {
            await discardPendingHouseholdInvite();
          }
          return null;
        }
        finishAttempt(result.value);
        return result.value;
      } finally {
        setBusy(false);
      }
    },
    [
      discardPendingHouseholdInvite,
      finishAttempt,
      prepareRequest
    ]
  );

  const signIn = useCallback(
    async (
      emailValue: string,
      password: string
    ): Promise<AuthAttempt | null> => {
      prepareRequest();
      try {
        const normalized = normalizeEmail(emailValue);
        const result = await gatewayRef.current.signIn({
          email: normalized,
          password
        });
        if (!result.ok) {
          setEmail(normalized);
          setError(result.error);
          return null;
        }
        finishAttempt(result.value);
        return result.value;
      } finally {
        setBusy(false);
      }
    },
    [finishAttempt, prepareRequest]
  );

  const continuePreview = useCallback(async () => {
    prepareRequest();
    try {
      const result = await gatewayRef.current.beginPreviewSession(email);
      if (!result.ok) {
        setError(result.error);
        return null;
      }
      acceptSession(result.value);
      setStatusMessage(
        "Test session started. This email remains unverified."
      );
      return result.value;
    } finally {
      setBusy(false);
    }
  }, [acceptSession, email, prepareRequest]);

  const checkConfirmedSession = useCallback(async () => {
    prepareRequest();
    try {
      const result = gatewayRef.current.refreshSession
        ? await gatewayRef.current.refreshSession()
        : await gatewayRef.current.currentSession();
      if (!result.ok) {
        setError(result.error);
        return null;
      }
      if (!result.value?.identity.emailVerified) {
        setError({
          code: "session_missing",
          message:
            "No confirmed session is available yet. Open the latest verification link, then return to ALYR.",
          retryable: true
        });
        return null;
      }
      acceptSession(result.value);
      return result.value;
    } finally {
      setBusy(false);
    }
  }, [acceptSession, prepareRequest]);

  const exchangeConfirmationCode = useCallback(
    async (code: string) => {
      prepareRequest();
      try {
        const result =
          await gatewayRef.current.exchangeConfirmationCode(code);
        if (!result.ok) {
          setError(result.error);
          return null;
        }
        acceptSession(result.value);
        return result.value;
      } finally {
        setBusy(false);
      }
    },
    [acceptSession, prepareRequest]
  );

  const resendConfirmation = useCallback(async () => {
    prepareRequest();
    try {
      const result =
        await gatewayRef.current.resendConfirmation(email);
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      setConfirmation(result.value);
      setStatusMessage(
        result.value.delivery === "requested"
          ? "The account provider accepted a new email request. Inbox delivery is not yet confirmed."
          : "Preview mode does not send email. Continue with a test session below."
      );
      return true;
    } finally {
      setBusy(false);
    }
  }, [email, prepareRequest]);

  const requestPasswordRecovery = useCallback(
    async (emailValue: string): Promise<boolean> => {
      const normalized = normalizeEmail(emailValue);
      prepareRequest();
      try {
        const result =
          await gatewayRef.current.requestPasswordRecovery(normalized);
        if (!result.ok) {
          setError(result.error);
          return false;
        }
        setEmail(normalized);
        setPasswordRecovery(result.value);
        setPasswordRecoveryGrant(null);
        setPasswordRecoverySessionActive(false);
        setStatusMessage(
          result.value.delivery === "requested"
            ? "Password reset instructions are ready. Check the latest email."
            : "Test-mode recovery is ready on this device."
        );
        return true;
      } finally {
        setBusy(false);
      }
    },
    [prepareRequest]
  );

  const exchangePasswordRecoveryCode = useCallback(
    async (code: string): Promise<AuthSessionDescriptor | null> => {
      prepareRequest();
      try {
        const result =
          await gatewayRef.current.exchangePasswordRecoveryCode(code);
        if (!result.ok) {
          setPasswordRecoveryGrant(null);
          setPasswordRecoverySessionActive(false);
          setError(result.error);
          return null;
        }
        setPasswordRecoveryGrant(result.value.grant);
        setPasswordRecoverySessionActive(true);
        acceptSession(result.value.session);
        return result.value.session;
      } finally {
        setBusy(false);
      }
    },
    [acceptSession, prepareRequest]
  );

  const cancelPasswordRecovery = useCallback(async (): Promise<boolean> => {
    prepareRequest();
    // Route exit revokes the UI capability immediately. The signed gateway
    // also clears its private grant even when provider sign-out later fails.
    setPasswordRecoveryGrant(null);
    try {
      const result =
        await gatewayRef.current.cancelPasswordRecovery();
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      setEmail("");
      acceptSession(null);
      setConfirmation(null);
      setPasswordRecovery(null);
      setPasswordRecoveryGrant(null);
      setPasswordRecoverySessionActive(false);
      setStatusMessage(null);
      return true;
    } finally {
      setBusy(false);
    }
  }, [acceptSession, prepareRequest]);

  const updatePassword = useCallback(
    async (password: string): Promise<boolean> => {
      prepareRequest();
      try {
        if (
          gatewayRef.current.mode === "supabase" &&
          !passwordRecoveryGrant
        ) {
          setError({
            code: "session_missing",
            message:
              "Open the latest password reset link before setting a new password.",
            retryable: false
          });
          return false;
        }
        if (
          gatewayRef.current.mode === "preview" &&
          !passwordRecovery
        ) {
          setError({
            code: "session_missing",
            message:
              "Start password recovery before setting a new test password.",
            retryable: false
          });
          return false;
        }
        const result = await gatewayRef.current.updatePassword(password);
        if (gatewayRef.current.mode === "supabase") {
          // The gateway claims the signed recovery grant before its request.
          setPasswordRecoveryGrant(null);
        }
        if (!result.ok) {
          setError(result.error);
          return false;
        }
        setPasswordRecovery(null);
        setStatusMessage("Your password has been updated.");
        return true;
      } finally {
        setBusy(false);
      }
    },
    [passwordRecovery, passwordRecoveryGrant, prepareRequest]
  );

  const provisionHousehold = useCallback(
    async (nameValue: string): Promise<string | null> => {
      const name = nameValue.trim();
      prepareRequest();
      try {
        const currentSession = activeSessionRef.current;
        if (!currentSession) {
          setError({
            code: "session_missing",
            message: "Sign in before creating a household.",
            retryable: false
          });
          return null;
        }
        if (!name || name.length > 120) {
          setError({
            code: "invalid_request",
            message: "Enter a valid household name.",
            retryable: false
          });
          return null;
        }

        const restoredProvision =
          pendingHouseholdProvisionRef.current;

        if (
          restoredProvision &&
          restoredProvision.accountId !== currentSession.identity.id
        ) {
          setError({
            code: "session_missing",
            message:
              "Household setup belongs to a different signed account. Sign out to clear it from this device.",
            retryable: false
          });
          return null;
        }

        if (currentSession.activeHouseholdId) {
          if (
            restoredProvision &&
            restoredProvision.householdId !==
              currentSession.activeHouseholdId
          ) {
            setError({
              code: "invalid_request",
              message:
                "Another household is active. Return to that household before retrying this setup.",
              retryable: false
            });
            return null;
          }
          updateHouseholdName(restoredProvision?.name ?? name);
          if (
            currentSession.activeMembershipId &&
            currentSession.activeHouseholdRole === "owner"
          ) {
            if (
              restoredProvision &&
              !(await discardPendingHouseholdProvision())
            ) {
              return null;
            }
            return currentSession.activeHouseholdId;
          }

          const refresh = gatewayRef.current.refreshSession;
          if (!refresh) {
            setError({
              code: "unsupported",
              message:
                "Account access needs to be refreshed before setup can continue.",
              retryable: true
            });
            return null;
          }
          const refreshed = await refresh.call(gatewayRef.current);
          if (
            !refreshed.ok ||
            !refreshed.value ||
            refreshed.value.activeHouseholdId !==
              currentSession.activeHouseholdId ||
            !refreshed.value.activeMembershipId ||
            refreshed.value.activeHouseholdRole !== "owner"
          ) {
            setError(
              refreshed.ok
                ? {
                    code: "session_missing",
                    message:
                      "The household exists, but account access is still refreshing. Retry account access.",
                    retryable: true
                  }
                : refreshed.error
            );
            return null;
          }
          acceptSession(refreshed.value);
          if (
            restoredProvision &&
            !(await discardPendingHouseholdProvision())
          ) {
            return null;
          }
          return refreshed.value.activeHouseholdId;
        }

        if (gatewayRef.current.mode === "preview") {
          const householdId = randomUUID();
          const membershipId = randomUUID();
          updateHouseholdName(name);
          acceptSession({
            ...currentSession,
            activeHouseholdId: householdId,
            activeMembershipId: membershipId,
            activeHouseholdRole: "owner",
            onboarding: "required"
          });
          return householdId;
        }

        const access = householdAccessRef.current;
        if (!access) {
          setError({
            code: "unsupported",
            message:
              "Household setup is not connected in this signed build.",
            retryable: false
          });
          return null;
        }

        let pendingProvision =
          pendingHouseholdProvisionRef.current;

        // A retry or process restart first asks the provider for the
        // authoritative owner tuple. This closes the server-commit/lost-HTTP-
        // response window without posting a second creation request.
        if (pendingProvision) {
          const refresh = gatewayRef.current.refreshSession;
          if (!refresh) {
            setError({
              code: "unsupported",
              message:
                "Account access needs to be reconciled before household setup can retry.",
              retryable: true
            });
            return null;
          }
          const reconciled = await refresh.call(gatewayRef.current);
          if (!reconciled.ok) {
            setError(reconciled.error);
            return null;
          }
          if (!reconciled.value) {
            setError({
              code: "session_missing",
              message:
                "Account access needs to be restored before household setup can retry.",
              retryable: true
            });
            return null;
          }
          if (
            reconciled.value.identity.id !==
            pendingProvision.accountId
          ) {
            setError({
              code: "session_missing",
              message:
                "Household setup belongs to a different signed account.",
              retryable: false
            });
            return null;
          }
          acceptSession(reconciled.value);
          if (reconciled.value.activeHouseholdId) {
            if (
              reconciled.value.activeHouseholdId !==
                pendingProvision.householdId ||
              !reconciled.value.activeMembershipId ||
              reconciled.value.activeHouseholdRole !== "owner"
            ) {
              setError({
                code: "session_missing",
                message:
                  "The household exists, but account access is still refreshing. Retry account access.",
                retryable: true
              });
              return null;
            }
            updateHouseholdName(pendingProvision.name);
            if (!(await discardPendingHouseholdProvision())) {
              return null;
            }
            return reconciled.value.activeHouseholdId;
          }
        }

        if (!pendingProvision) {
          pendingProvision = {
            accountId: currentSession.identity.id,
            operationId: nextOperationId(),
            householdId: nextHouseholdId(),
            name,
            createdAt: new Date().toISOString()
          };
          try {
            await pendingHouseholdProvisionStoreRef.current.write(
              pendingProvision
            );
            pendingHouseholdProvisionRef.current =
              pendingProvision;
          } catch {
            setError({
              code: "unexpected",
              message:
                "Household setup could not protect its retry identity on this device.",
              retryable: true
            });
            return null;
          }
        }

        const result = await access.createHousehold({
          apiVersion: CONTRACT_API_VERSION,
          operationId: pendingProvision.operationId,
          householdId: pendingProvision.householdId,
          name: pendingProvision.name
        });
        const sessionAfterResponse = activeSessionRef.current;
        if (
          !sessionAfterResponse ||
          sessionAfterResponse.identity.id !==
            pendingProvision.accountId ||
          (sessionAfterResponse.activeHouseholdId !== null &&
            sessionAfterResponse.activeHouseholdId !==
              pendingProvision.householdId)
        ) {
          return null;
        }
        if (!result.ok) {
          setError(authFailureFromContract(result.error));
          return null;
        }
        if (
          result.value.operationId !==
            pendingProvision.operationId ||
          result.value.household.householdId !==
            pendingProvision.householdId
        ) {
          setError({
            code: "unexpected",
            message:
              "Household setup returned a receipt for another operation.",
            retryable: false
          });
          return null;
        }

        const refresh = gatewayRef.current.refreshSession;
        if (!refresh) {
          setError({
            code: "unsupported",
            message:
              "The household was created, but account access still needs confirmation. Retry account access.",
            retryable: true
          });
          return null;
        }
        const refreshed = await refresh.call(gatewayRef.current);
        const sessionAfterRefresh = activeSessionRef.current;
        if (
          !sessionAfterRefresh ||
          sessionAfterRefresh.identity.id !==
            pendingProvision.accountId ||
          (sessionAfterRefresh.activeHouseholdId !== null &&
            sessionAfterRefresh.activeHouseholdId !==
              pendingProvision.householdId)
        ) {
          return null;
        }
        if (
          refreshed.ok &&
          refreshed.value &&
          refreshed.value.identity.id ===
            pendingProvision.accountId &&
          refreshed.value.activeHouseholdId ===
            pendingProvision.householdId
        ) {
          updateHouseholdName(result.value.household.name);
          acceptSession(refreshed.value);
        }
        if (
          !refreshed.ok ||
          !refreshed.value ||
          refreshed.value.identity.id !==
            pendingProvision.accountId ||
          refreshed.value.activeHouseholdId !==
            pendingProvision.householdId ||
          !refreshed.value.activeMembershipId ||
          refreshed.value.activeHouseholdRole !== "owner"
        ) {
          setError(
            refreshed.ok
              ? {
                  code: "session_missing",
                  message:
                    "The household was created, but account access is still refreshing. Retry account access.",
                  retryable: true
                }
              : refreshed.error
          );
          return null;
        }
        if (!(await discardPendingHouseholdProvision())) {
          return null;
        }
        return pendingProvision.householdId;
      } finally {
        setBusy(false);
      }
    },
    [
      acceptSession,
      discardPendingHouseholdProvision,
      nextHouseholdId,
      nextOperationId,
      prepareRequest
    ]
  );

  const completeOnboarding = useCallback(async (): Promise<boolean> => {
    prepareRequest();
    try {
      if (!session?.activeHouseholdId) {
        setError({
          code: "session_missing",
          message: "Choose a household before completing setup.",
          retryable: false
        });
        return false;
      }

      if (gatewayRef.current.mode === "preview") {
        acceptSession({ ...session, onboarding: "complete" });
        return true;
      }

      const access = householdAccessRef.current;
      if (!access) {
        setError({
          code: "unsupported",
          message:
            "Household setup is not connected in this signed build.",
          retryable: false
        });
        return false;
      }
      const completion = await access.completeOnboarding(
        session.activeHouseholdId
      );
      if (!completion.ok) {
        setError(authFailureFromContract(completion.error));
        return false;
      }

      const refresh = gatewayRef.current.refreshSession;
      if (!refresh) {
        setError({
          code: "unsupported",
          message:
            "The account service could not confirm durable household setup.",
          retryable: true
        });
        return false;
      }
      const refreshed = await refresh.call(gatewayRef.current);
      if (
        !refreshed.ok ||
        !refreshed.value ||
        refreshed.value.activeHouseholdId !==
          session.activeHouseholdId ||
        !refreshed.value.activeMembershipId ||
        !refreshed.value.activeHouseholdRole ||
        refreshed.value.onboarding !== "complete"
      ) {
        setError(
          refreshed.ok
            ? {
                code: "session_missing",
                message:
                  "The household is saved, but the refreshed account session is not ready yet. Try again.",
                retryable: true
              }
            : refreshed.error
        );
        return false;
      }
      acceptSession(refreshed.value);
      return true;
    } finally {
      setBusy(false);
    }
  }, [acceptSession, prepareRequest, session]);

  const refreshHouseholdAccess =
    useCallback(async (): Promise<boolean> => {
      if (
        gatewayRef.current.mode !== "supabase" ||
        !session?.activeHouseholdId ||
        !session.activeMembershipId
      ) {
        setHouseholdAccessSnapshot(null);
        setHouseholdAccessStatus("idle");
        setHouseholdAccessError(null);
        return false;
      }
      const access = householdAccessRef.current;
      if (!access) {
        setHouseholdAccessStatus("error");
        setHouseholdAccessError({
          errorVersion: API_ERROR_VERSION,
          code: "STORAGE_UNAVAILABLE",
          message:
            "Household administration is not configured for this build.",
          retryable: true
        });
        return false;
      }
      setHouseholdAccessStatus("refreshing");
      setHouseholdAccessError(null);
      const result = await access.getAccessSnapshot(
        session.activeHouseholdId
      );
      if (!result.ok) {
        setHouseholdAccessSnapshot(null);
        setHouseholdAccessStatus("error");
        setHouseholdAccessError(result.error);
        return false;
      }
      if (
        result.value.currentAccountId !== session.identity.id ||
        result.value.currentMembershipId !==
          session.activeMembershipId ||
        result.value.currentRole !== session.activeHouseholdRole
      ) {
        setHouseholdAccessSnapshot(null);
        setHouseholdAccessStatus("error");
        setHouseholdAccessError({
          errorVersion: API_ERROR_VERSION,
          code: "SESSION_EXPIRED",
          message:
            "Household access changed. Refresh the account session.",
          retryable: true
        });
        return false;
      }
      setHouseholdAccessSnapshot(result.value);
      setHouseholdAccessStatus("ready");
      return true;
    }, [session]);

  useEffect(() => {
    if (
      gatewayRef.current.mode !== "supabase" ||
      session?.onboarding !== "complete" ||
      !session.activeHouseholdId ||
      !session.activeMembershipId
    ) {
      return;
    }
    void refreshHouseholdAccess();
  }, [
    refreshHouseholdAccess,
    session?.activeHouseholdId,
    session?.activeMembershipId,
    session?.onboarding
  ]);

  const applyHouseholdAdministration = useCallback(
    async (
      operation: (
        access: HouseholdAccessPort,
        householdId: string
      ) => ReturnType<HouseholdAccessPort["changeMemberRole"]>
    ): Promise<boolean> => {
      if (
        gatewayRef.current.mode !== "supabase" ||
        !session?.activeHouseholdId ||
        !session.activeMembershipId ||
        session.activeHouseholdRole !== "owner" ||
        !householdAccessSnapshot
      ) {
        setHouseholdAccessError({
          errorVersion: API_ERROR_VERSION,
          code: "AUTHORIZATION_DENIED",
          message:
            "Refresh an owner household before changing access.",
          retryable: false
        });
        setHouseholdAccessStatus("error");
        return false;
      }
      const access = householdAccessRef.current;
      if (!access) {
        setHouseholdAccessError({
          errorVersion: API_ERROR_VERSION,
          code: "STORAGE_UNAVAILABLE",
          message:
            "Household administration is not configured for this build.",
          retryable: true
        });
        setHouseholdAccessStatus("error");
        return false;
      }
      setBusy(true);
      setHouseholdAccessStatus("refreshing");
      setHouseholdAccessError(null);
      try {
        const result = await operation(access, session.activeHouseholdId);
        if (!result.ok) {
          setHouseholdAccessError(result.error);
          setHouseholdAccessStatus("error");
          return false;
        }
        setHouseholdAccessSnapshot(result.value.snapshot);
        setHouseholdAccessStatus("ready");
        return true;
      } finally {
        setBusy(false);
      }
    },
    [householdAccessSnapshot, session]
  );

  const changeHouseholdMemberRole = useCallback(
    (
      membershipId: string,
      expectedVersion: number,
      role: "editor" | "viewer"
    ) =>
      applyHouseholdAdministration((access, householdId) =>
        access.changeMemberRole({
          householdId,
          membershipId,
          expectedVersion,
          role,
          operationId: nextOperationId()
        })
      ),
    [applyHouseholdAdministration, nextOperationId]
  );

  const revokeHouseholdMember = useCallback(
    (membershipId: string, expectedVersion: number) =>
      applyHouseholdAdministration((access, householdId) =>
        access.revokeMember({
          householdId,
          membershipId,
          expectedVersion,
          operationId: nextOperationId()
        })
      ),
    [applyHouseholdAdministration, nextOperationId]
  );

  const cancelPendingHouseholdInvite = useCallback(
    (inviteId: string, expectedVersion: number) =>
      applyHouseholdAdministration((access, householdId) =>
        access.cancelInvite({
          householdId,
          inviteId,
          expectedVersion,
          operationId: nextOperationId()
        })
      ),
    [applyHouseholdAdministration, nextOperationId]
  );

  const transferHouseholdOwnership = useCallback(
    async (
      targetMembershipId: string,
      expectedTargetVersion: number
    ): Promise<boolean> => {
      const currentMembership =
        householdAccessSnapshot?.members.find(
          (member) =>
            member.membershipId ===
            householdAccessSnapshot.currentMembershipId
        );
      if (!currentMembership) {
        setHouseholdAccessError({
          errorVersion: API_ERROR_VERSION,
          code: "CONFLICT_REQUIRES_REVIEW",
          message: "Refresh the owner record before transferring ownership.",
          retryable: true
        });
        setHouseholdAccessStatus("error");
        return false;
      }
      const changed = await applyHouseholdAdministration(
        (access, householdId) =>
          access.transferOwnership({
            householdId,
            targetMembershipId,
            expectedOwnerVersion: currentMembership.version,
            expectedTargetVersion,
            operationId: nextOperationId(),
            acknowledgeOwnerTransfer: true
          })
      );
      if (!changed) return false;

      const refresh = gatewayRef.current.refreshSession;
      if (!refresh) {
        setHouseholdAccessStatus("error");
        setHouseholdAccessError({
          errorVersion: API_ERROR_VERSION,
          code: "SESSION_EXPIRED",
          message:
            "Ownership changed. Refresh the account session before continuing.",
          retryable: true
        });
        return false;
      }
      const refreshed = await refresh.call(gatewayRef.current);
      if (
        !refreshed.ok ||
        !refreshed.value ||
        refreshed.value.activeHouseholdId !==
          householdAccessSnapshot?.householdId ||
        refreshed.value.activeMembershipId !==
          currentMembership.membershipId ||
        refreshed.value.activeHouseholdRole !== "editor"
      ) {
        const refreshError: ContractError = refreshed.ok
          ? {
              errorVersion: API_ERROR_VERSION,
              code: "SESSION_EXPIRED",
              message:
                "Ownership changed. Refresh the account session before continuing.",
              retryable: true
            }
          : {
              errorVersion: API_ERROR_VERSION,
              code: "SESSION_EXPIRED",
              message: refreshed.error.message,
              retryable: true
            };
        setHouseholdAccessStatus("error");
        setHouseholdAccessError(refreshError);
        return false;
      }
      acceptSession(refreshed.value);
      return true;
    },
    [
      acceptSession,
      applyHouseholdAdministration,
      householdAccessSnapshot,
      nextOperationId
    ]
  );

  const createHouseholdInvite = useCallback(
    async (
      role: Exclude<HouseholdRole, "owner">,
      expiresInHours: 24 | 72 | 168
    ): Promise<HouseholdInvite | null> => {
      prepareRequest();
      try {
        if (
          !session?.activeHouseholdId ||
          !session.activeMembershipId
        ) {
          setError({
            code: "session_missing",
            message:
              "Open an active household before creating an invitation.",
            retryable: false
          });
          return null;
        }
        if (session.activeHouseholdRole !== "owner") {
          setError({
            code: "invalid_request",
            message:
              "Only the household owner can invite another person.",
            retryable: false
          });
          return null;
        }
        if (
          (role !== "editor" && role !== "viewer") ||
          !([24, 72, 168] as const).includes(expiresInHours)
        ) {
          setError({
            code: "invalid_request",
            message: "Choose a valid role and invitation expiry.",
            retryable: false
          });
          return null;
        }

        if (gatewayRef.current.mode === "preview") {
          const oneTimeCode = randomUUID()
            .replaceAll("-", "")
            .slice(0, 12)
            .toUpperCase();
          const invite: HouseholdInvite = {
            inviteId: randomUUID(),
            oneTimeCode,
            role,
            expiresAt: new Date(
              Date.now() + expiresInHours * 60 * 60 * 1000
            ).toISOString()
          };
          previewInvitesRef.current.set(oneTimeCode, {
            invite,
            householdId: session.activeHouseholdId,
            householdName: householdName.trim() || "Preview household",
            createdByAccountId: session.identity.id,
            acceptedMembership: null
          });
          setStatusMessage(
            "A session-only test invitation is ready to share."
          );
          return invite;
        }

        const access = householdAccessRef.current;
        if (!access) {
          setError({
            code: "unsupported",
            message:
              "Household invitations are not connected in this signed build.",
            retryable: false
          });
          return null;
        }
        const result = await access.createInvite({
          householdId: session.activeHouseholdId,
          role,
          expiresInHours
        });
        if (!result.ok) {
          setError(authFailureFromContract(result.error));
          return null;
        }
        setStatusMessage(
          "The one-time invitation is ready to share."
        );
        const refreshed = await access.getAccessSnapshot(
          session.activeHouseholdId
        );
        if (refreshed.ok) {
          setHouseholdAccessSnapshot(refreshed.value);
          setHouseholdAccessStatus("ready");
          setHouseholdAccessError(null);
        }
        return result.value;
      } finally {
        setBusy(false);
      }
    },
    [householdName, prepareRequest, session]
  );

  const reviewPendingHouseholdInvite = useCallback(
    async (): Promise<HouseholdInviteReview | null> => {
      const pending = pendingHouseholdInviteRef.current;
      const normalizedCode = pending
        ? normalizeHouseholdInviteCode(pending.oneTimeCode)
        : null;
      prepareRequest();
      setPendingHouseholdInviteDeferred(false);
      try {
        const currentSession = activeSessionRef.current;
        if (!currentSession) {
          setError({
            code: "session_missing",
            message: "Sign in before reviewing a household invitation.",
            retryable: false
          });
          return null;
        }
        if (!normalizedCode) {
          await discardPendingHouseholdInvite();
          setError({
            code: "invalid_request",
            message: "Open a current household invitation to continue.",
            retryable: false
          });
          return null;
        }

        if (gatewayRef.current.mode === "preview") {
          if (normalizedCode === PREVIEW_HOUSEHOLD_INVITE_CODE) {
            const review: HouseholdInviteReview = {
              householdName: "Hassan household · sample",
              role: "viewer",
              expiresAt: new Date(
                Date.now() + 24 * 60 * 60 * 1000
              ).toISOString()
            };
            pendingHouseholdInviteReviewRef.current = review;
            setPendingHouseholdInviteReview(review);
            return review;
          }
          const record =
            previewInvitesRef.current.get(normalizedCode);
          if (
            !record ||
            record.acceptedMembership ||
            record.createdByAccountId === currentSession.identity.id ||
            Date.parse(record.invite.expiresAt) <= Date.now()
          ) {
            await discardPendingHouseholdInvite();
            setError({
              code: "invalid_request",
              message:
                "This session-only invitation is invalid or has expired.",
              retryable: false
            });
            return null;
          }
          const review: HouseholdInviteReview = {
            householdName: record.householdName,
            role: record.invite.role,
            expiresAt: record.invite.expiresAt
          };
          pendingHouseholdInviteReviewRef.current = review;
          setPendingHouseholdInviteReview(review);
          return review;
        }

        const access = householdAccessRef.current;
        if (!access) {
          setError({
            code: "unsupported",
            message:
              "Household invitation review is not connected in this signed build.",
            retryable: false
          });
          return null;
        }
        const result = await access.previewInvite(normalizedCode);
        if (!result.ok) {
          if (!result.error.retryable) {
            await discardPendingHouseholdInvite();
          }
          setError(authFailureFromContract(result.error));
          return null;
        }
        pendingHouseholdInviteReviewRef.current = result.value;
        setPendingHouseholdInviteReview(result.value);
        return result.value;
      } finally {
        setBusy(false);
      }
    },
    [discardPendingHouseholdInvite, prepareRequest]
  );

  const acceptHouseholdInvite = useCallback(
    async (
      oneTimeCode: string
    ): Promise<HouseholdMembership | null> => {
      const normalizedCode =
        normalizeHouseholdInviteCode(oneTimeCode);
      prepareRequest();
      try {
        const currentSession = activeSessionRef.current;
        if (!currentSession) {
          setError({
            code: "session_missing",
            message: "Sign in before joining a household.",
            retryable: false
          });
          return null;
        }
        if (!normalizedCode) {
          await discardPendingHouseholdInvite();
          setError({
            code: "invalid_request",
            message: "Enter a valid invitation code.",
            retryable: false
          });
          return null;
        }

        if (gatewayRef.current.mode === "preview") {
          if (normalizedCode === PREVIEW_HOUSEHOLD_INVITE_CODE) {
            const membership: HouseholdMembership = {
              membershipId: randomUUID(),
              householdId: randomUUID(),
              accountId: currentSession.identity.id,
              role: "viewer",
              status: "active",
              version: 1
            };
            updateHouseholdName("Hassan household · sample");
            acceptSession({
              ...currentSession,
              activeHouseholdId: membership.householdId,
              activeMembershipId: membership.membershipId,
              activeHouseholdRole: membership.role,
              onboarding: "complete"
            });
            setStatusMessage(
              "The session-only sample invitation was accepted."
            );
            await discardPendingHouseholdInvite();
            return membership;
          }

          const record =
            previewInvitesRef.current.get(normalizedCode);
          if (!record) {
            await discardPendingHouseholdInvite();
            setError({
              code: "invalid_request",
              message:
                "This session-only invitation is invalid or has expired.",
              retryable: false
            });
            return null;
          }
          if (record.acceptedMembership) {
            if (
              record.acceptedMembership.accountId !==
              currentSession.identity.id
            ) {
              await discardPendingHouseholdInvite();
              setError({
                code: "invalid_request",
                message:
                  "This session-only invitation has already been used.",
                retryable: false
              });
              return null;
            }
            acceptSession({
              ...currentSession,
              activeHouseholdId:
                record.acceptedMembership.householdId,
              activeMembershipId:
                record.acceptedMembership.membershipId,
              activeHouseholdRole:
                record.acceptedMembership.role,
              onboarding: "complete"
            });
            await discardPendingHouseholdInvite();
            return record.acceptedMembership;
          }
          if (
            record.createdByAccountId === currentSession.identity.id ||
            Date.parse(record.invite.expiresAt) <= Date.now()
          ) {
            await discardPendingHouseholdInvite();
            setError({
              code: "invalid_request",
              message:
                "This session-only invitation is invalid or has expired.",
              retryable: false
            });
            return null;
          }
          const membership: HouseholdMembership = {
            membershipId: randomUUID(),
            householdId: record.householdId,
            accountId: currentSession.identity.id,
            role: record.invite.role,
            status: "active",
            version: 1
          };
          record.acceptedMembership = membership;
          updateHouseholdName(record.householdName);
          acceptSession({
            ...currentSession,
            activeHouseholdId: membership.householdId,
            activeMembershipId: membership.membershipId,
            activeHouseholdRole: membership.role,
            onboarding: "complete"
          });
          setStatusMessage(
            "The session-only invitation was accepted."
          );
          await discardPendingHouseholdInvite();
          return membership;
        }

        const access = householdAccessRef.current;
        if (!access) {
          setError({
            code: "unsupported",
            message:
              "Joining a household is not connected in this signed build.",
            retryable: false
          });
          return null;
        }
        const result = await access.acceptInvite(normalizedCode);
        if (!result.ok) {
          const failure = authFailureFromContract(result.error);
          if (!result.error.retryable) {
            await discardPendingHouseholdInvite();
          }
          setError(failure);
          return null;
        }
        const membership = result.value;
        if (
          membership.accountId !== currentSession.identity.id ||
          membership.status !== "active" ||
          (membership.role !== "editor" &&
            membership.role !== "viewer")
        ) {
          await discardPendingHouseholdInvite();
          setError({
            code: "unexpected",
            message:
              "The account service returned an invalid household membership.",
            retryable: false
          });
          return null;
        }
        const refresh = gatewayRef.current.refreshSession;
        if (!refresh) {
          setError({
            code: "unsupported",
            message:
              "The account service could not confirm household access.",
            retryable: true
          });
          return null;
        }
        const refreshed = await refresh.call(gatewayRef.current);
        if (
          !refreshed.ok ||
          !refreshed.value ||
          refreshed.value.identity.id !== membership.accountId ||
          refreshed.value.activeHouseholdId !==
            membership.householdId ||
          refreshed.value.activeMembershipId !==
            membership.membershipId ||
          refreshed.value.activeHouseholdRole !== membership.role ||
          refreshed.value.onboarding !== "complete"
        ) {
          setError(
            refreshed.ok
              ? {
                  code: "session_missing",
                  message:
                    "The invitation was accepted, but account access is still refreshing. Submit the same code again.",
                  retryable: true
                }
              : refreshed.error
          );
          return null;
        }
        acceptSession(refreshed.value);
        setStatusMessage("Household access is ready.");
        await discardPendingHouseholdInvite();
        return membership;
      } finally {
        setBusy(false);
      }
    },
    [
      acceptSession,
      discardPendingHouseholdInvite,
      prepareRequest
    ]
  );

  const acceptPendingHouseholdInvite = useCallback(
    async (): Promise<HouseholdMembership | null> => {
      const pending = pendingHouseholdInviteRef.current;
      if (!pending) {
        setError({
          code: "invalid_request",
          message: "Open a current household invitation to continue.",
          retryable: false
        });
        return null;
      }
      if (!pendingHouseholdInviteReviewRef.current) {
        setError({
          code: "invalid_request",
          message: "Review the household invitation before joining.",
          retryable: false
        });
        return null;
      }
      return acceptHouseholdInvite(pending.oneTimeCode);
    },
    [acceptHouseholdInvite]
  );

  const deferPendingHouseholdInvite = useCallback(() => {
    if (!pendingHouseholdInviteRef.current) return;
    setPendingHouseholdInviteDeferred(true);
    setError(null);
    setStatusMessage(null);
  }, []);

  const createCompletion = useCallback(() => {
    const name = householdName.trim();
    if (!session || !name || !firstCaptureIntent) return null;
    return {
      householdName: name,
      firstCaptureIntent,
      session
    };
  }, [firstCaptureIntent, householdName, session]);

  const selectHousehold = useCallback((householdId: string) => {
    if (
      !householdId ||
      householdId.length > 512 ||
      householdId.trim() !== householdId ||
      /[\u0000-\u001f\u007f-\u009f]/u.test(householdId)
    ) {
      throw new Error(
        "A valid household identity is required before opening its vault."
      );
    }
    if (!session) {
      throw new Error(
        "An account session is required before selecting a household."
      );
    }
    setSession({
      ...session,
      activeHouseholdId: householdId,
      activeMembershipId: null,
      activeHouseholdRole: null,
      onboarding: "required"
    });
  }, [session]);

  const deleteAccount = useCallback(
    async (
      password: string,
      confirmationEmail: string
    ): Promise<Result<AccountDeletionReceipt>> => {
      prepareRequest();
      try {
        const port = accountDeletionRef.current;
        if (
          gatewayRef.current.mode !== "supabase" ||
          !session ||
          session.assurance !== "verified-email" ||
          !session.identity.emailVerified ||
          !session.activeHouseholdId ||
          !session.activeMembershipId ||
          !session.activeHouseholdRole
        ) {
          const result: Result<AccountDeletionReceipt> = {
            ok: false,
            error: {
              errorVersion: API_ERROR_VERSION,
              code: "AUTHENTICATION_REQUIRED",
              message:
                "Open account deletion from a verified signed-in household.",
              retryable: false
            }
          };
          setError(authFailureFromContract(result.error));
          return result;
        }
        if (!port) {
          const result: Result<AccountDeletionReceipt> = {
            ok: false,
            error: {
              errorVersion: API_ERROR_VERSION,
              code: "STORAGE_UNAVAILABLE",
              message:
                "Account deletion is not configured for this build.",
              retryable: true
            }
          };
          setError(authFailureFromContract(result.error));
          return result;
        }
        const result = await port.deleteAccount({
          apiVersion: CONTRACT_API_VERSION,
          expectedAccountId: session.identity.id,
          expectedActiveHouseholdId: session.activeHouseholdId,
          expectedActiveHouseholdRole: session.activeHouseholdRole,
          confirmationEmail: normalizeEmail(confirmationEmail),
          password,
          acknowledgeIrreversibleDeletion: true
        });
        if (!result.ok) {
          setError(authFailureFromContract(result.error));
        }
        return result;
      } finally {
        setBusy(false);
      }
    },
    [prepareRequest, session]
  );

  const finalizeAccountDeletion = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (gatewayRef.current.purgeLocalSession) {
        await gatewayRef.current.purgeLocalSession();
      } else {
        await gatewayRef.current.signOut();
      }
    } catch {
      // The server has already removed the identity. Clear in-memory routing
      // unconditionally so a stale provider response never reopens the vault.
    } finally {
      await discardPendingHouseholdInvite();
      await discardPendingHouseholdProvision();
      setEmail("");
      acceptSession(null);
      setConfirmation(null);
      setPasswordRecovery(null);
      setPasswordRecoveryGrant(null);
      setPasswordRecoverySessionActive(false);
      updateHouseholdName("");
      updateFirstCaptureIntent(null);
      setStatusMessage(null);
      setBusy(false);
    }
  }, [
    acceptSession,
    discardPendingHouseholdInvite,
    discardPendingHouseholdProvision
  ]);

  const signOut = useCallback(async () => {
    prepareRequest();
    try {
      const result = await gatewayRef.current.signOut();
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      await discardPendingHouseholdInvite();
      const provisionCleared =
        await discardPendingHouseholdProvision();
      setEmail("");
      acceptSession(null);
      setConfirmation(null);
      setPasswordRecovery(null);
      setPasswordRecoveryGrant(null);
      setPasswordRecoverySessionActive(false);
      updateHouseholdName("");
      updateFirstCaptureIntent(null);
      setStatusMessage(null);
      if (!provisionCleared) {
        setBootstrapState("error");
        return false;
      }
      setBootstrapState("ready");
      return true;
    } finally {
      setBusy(false);
    }
  }, [
    acceptSession,
    discardPendingHouseholdInvite,
    discardPendingHouseholdProvision,
    prepareRequest
  ]);

  const reset = useCallback(() => {
    setBusy(false);
    setError(null);
    setStatusMessage(null);
    setEmail("");
    acceptSession(null);
    setConfirmation(null);
    setPasswordRecovery(null);
    setPasswordRecoveryGrant(null);
    setPasswordRecoverySessionActive(false);
    updateHouseholdName("");
    updateFirstCaptureIntent(null);
    void discardPendingHouseholdInvite();
    void discardPendingHouseholdProvision();
  }, [
    acceptSession,
    discardPendingHouseholdInvite,
    discardPendingHouseholdProvision
  ]);

  const value = useMemo<AuthFlowContextValue>(
    () => ({
      mode: gatewayRef.current.mode,
      bootstrapState,
      busy,
      error,
      statusMessage,
      email,
      identity,
      session,
      activeHouseholdId: session?.activeHouseholdId ?? null,
      confirmation,
      passwordRecovery,
      passwordRecoveryGrant,
      passwordRecoverySessionActive,
      pendingHouseholdInvite,
      pendingHouseholdInviteReview,
      pendingHouseholdInviteDeferred,
      householdName,
      firstCaptureIntent,
      householdAccessSnapshot,
      householdAccessStatus,
      householdAccessError,
      createAccount,
      signIn,
      continuePreview,
      retryBootstrap,
      checkConfirmedSession,
      exchangeConfirmationCode,
      resendConfirmation,
      requestPasswordRecovery,
      exchangePasswordRecoveryCode,
      cancelPasswordRecovery,
      updatePassword,
      provisionHousehold,
      completeOnboarding,
      createHouseholdInvite,
      acceptHouseholdInvite,
      stageHouseholdInvite,
      reviewPendingHouseholdInvite,
      acceptPendingHouseholdInvite,
      deferPendingHouseholdInvite,
      discardPendingHouseholdInvite,
      refreshHouseholdAccess,
      changeHouseholdMemberRole,
      revokeHouseholdMember,
      cancelPendingHouseholdInvite,
      transferHouseholdOwnership,
      selectHousehold,
      signOut,
      deleteAccount,
      finalizeAccountDeletion,
      setHouseholdName: updateHouseholdName,
      setFirstCaptureIntent: updateFirstCaptureIntent,
      createCompletion,
      clearError: () => setError(null),
      clearStatus: () => setStatusMessage(null),
      reset
    }),
    [
      busy,
      bootstrapState,
      checkConfirmedSession,
      completeOnboarding,
      createHouseholdInvite,
      acceptHouseholdInvite,
      reviewPendingHouseholdInvite,
      acceptPendingHouseholdInvite,
      refreshHouseholdAccess,
      changeHouseholdMemberRole,
      revokeHouseholdMember,
      cancelPendingHouseholdInvite,
      transferHouseholdOwnership,
      confirmation,
      cancelPasswordRecovery,
      continuePreview,
      createAccount,
      createCompletion,
      email,
      error,
      exchangeConfirmationCode,
      exchangePasswordRecoveryCode,
      firstCaptureIntent,
      householdName,
      householdAccessSnapshot,
      householdAccessStatus,
      householdAccessError,
      identity,
      provisionHousehold,
      passwordRecovery,
      passwordRecoveryGrant,
      passwordRecoverySessionActive,
      pendingHouseholdInvite,
      pendingHouseholdInviteReview,
      pendingHouseholdInviteDeferred,
      requestPasswordRecovery,
      resendConfirmation,
      retryBootstrap,
      reset,
      selectHousehold,
      session,
      deleteAccount,
      finalizeAccountDeletion,
      signOut,
      signIn,
      stageHouseholdInvite,
      deferPendingHouseholdInvite,
      discardPendingHouseholdInvite,
      statusMessage,
      updatePassword
    ]
  );

  return (
    <AuthFlowContext.Provider value={value}>
      {children}
    </AuthFlowContext.Provider>
  );
}

export function useAuthFlow(): AuthFlowContextValue {
  const context = useContext(AuthFlowContext);
  if (!context) {
    throw new Error("useAuthFlow must be used inside AuthFlowProvider.");
  }
  return context;
}
