import { randomUUID } from "expo-crypto";

import type {
  AccountAuthGateway,
  AuthGatewayResult,
  AuthSessionDescriptor
} from "./types";
import type {
  PasswordRecoverySessionMarker,
  PasswordRecoverySessionMarkerStore
} from "./passwordRecoverySessionMarker";

type SessionResult = AuthGatewayResult<AuthSessionDescriptor | null>;

export interface RecoveryProtectedAuthGatewayOptions {
  readonly markerStore: PasswordRecoverySessionMarkerStore;
  readonly createExchangeId?: () => string;
  readonly now?: () => Date;
}

function markerFailure(message: string): AuthGatewayResult<never> {
  return {
    ok: false,
    error: {
      code: "unexpected",
      message,
      retryable: true
    }
  };
}

function cancelledExchangeFailure(): AuthGatewayResult<never> {
  return {
    ok: false,
    error: {
      code: "session_missing",
      message:
        "This password-recovery session was closed before it finished.",
      retryable: false
    }
  };
}

function recoverySessionBlockedFailure(): AuthGatewayResult<never> {
  return {
    ok: false,
    error: {
      code: "session_missing",
      message:
        "Finish password-recovery cleanup before restoring account access.",
      retryable: true
    }
  };
}

function markerBelongsToDifferentSession(
  marker: PasswordRecoverySessionMarker,
  session: AuthSessionDescriptor | null
): boolean {
  return (
    marker.phase === "session-active" &&
    Boolean(session) &&
    marker.scope.kind === "account" &&
    marker.scope.accountId !== session?.identity.id
  );
}

/**
 * Adds the durable boundary that a provider PKCE recovery session lacks.
 *
 * Supabase persists the session created by `exchangeCodeForSession`. This
 * decorator writes an encrypted marker first, binds it to the provider account
 * before returning the session, and audits that marker before a fresh process
 * may expose any restored session to React routing. Normal sessions with no
 * marker retain the base gateway behavior.
 */
export function createRecoveryProtectedAuthGateway(
  base: AccountAuthGateway,
  options: RecoveryProtectedAuthGatewayOptions
): AccountAuthGateway {
  const createExchangeId =
    options.createExchangeId ?? randomUUID;
  const now = options.now ?? (() => new Date());
  let auditState: "pending" | "ready" | "blocked" = "pending";
  let auditInFlight: Promise<SessionResult> | null = null;
  let markerPresent = false;
  let activeExchange: {
    readonly exchangeId: string;
    cancelled: boolean;
  } | null = null;

  const clearKnownMarker = async (): Promise<AuthGatewayResult<void>> => {
    if (!markerPresent) {
      return { ok: true, value: undefined };
    }
    try {
      await options.markerStore.clear();
      markerPresent = false;
      return { ok: true, value: undefined };
    } catch {
      return markerFailure(
        "The closed recovery session still needs protected device cleanup."
      );
    }
  };

  const cleanupRecoverySession =
    async (): Promise<AuthGatewayResult<void>> => {
      const cleanup = await base.cancelPasswordRecovery();
      if (!cleanup.ok) return cleanup;
      return clearKnownMarker();
    };

  const auditRestoredSession = async (): Promise<SessionResult> => {
    let marker: PasswordRecoverySessionMarker | null;
    try {
      marker = await options.markerStore.read();
    } catch {
      auditState = "blocked";
      markerPresent = true;
      return markerFailure(
        "Heldat could not verify the protected password-recovery state on this device."
      );
    }

    markerPresent = Boolean(marker);
    const restored = await base.currentSession();
    if (!restored.ok) {
      auditState = "blocked";
      return restored;
    }
    if (!marker) {
      auditState = "ready";
      return restored;
    }

    /*
     * A provider session for another account proves the marked recovery
     * session was already replaced through an explicit account boundary.
     * Remove only the stale marker; the unrelated normal session stays intact.
     */
    if (markerBelongsToDifferentSession(marker, restored.value)) {
      const cleared = await clearKnownMarker();
      if (!cleared.ok) {
        auditState = "blocked";
        return cleared;
      }
      auditState = "ready";
      return restored;
    }

    const cleaned = await cleanupRecoverySession();
    if (!cleaned.ok) {
      auditState = "blocked";
      return cleaned;
    }
    auditState = "ready";
    return { ok: true, value: null };
  };

  const currentSession = async (): Promise<SessionResult> => {
    if (auditState === "ready") {
      return markerPresent
        ? recoverySessionBlockedFailure()
        : base.currentSession();
    }
    if (auditInFlight) return auditInFlight;
    const attempt = auditRestoredSession().finally(() => {
      auditInFlight = null;
    });
    auditInFlight = attempt;
    return attempt;
  };

  const gateway: AccountAuthGateway = {
    mode: base.mode,
    currentSession,
    ...(base.refreshSession
      ? {
          async refreshSession() {
            if (auditState !== "ready" || markerPresent) {
              return recoverySessionBlockedFailure();
            }
            return base.refreshSession!();
          }
        }
      : {}),
    async currentAccessToken() {
      if (auditState !== "ready" || markerPresent) {
        return {
          ok: false,
          error: {
            code: "session_missing",
            message:
              "Finish password-recovery cleanup before opening account data.",
            retryable: true
          }
        };
      }
      return base.currentAccessToken();
    },
    onSessionChanged(listener) {
      return base.onSessionChanged((session) => {
        if (auditState === "ready" && !markerPresent) {
          listener(session);
        }
      });
    },
    signIn(credentials) {
      return base.signIn(credentials);
    },
    ...(base.beginGoogleOAuthSignIn
      ? {
          beginGoogleOAuthSignIn() {
            return base.beginGoogleOAuthSignIn!();
          }
        }
      : {}),
    signUp(credentials) {
      return base.signUp(credentials);
    },
    resendConfirmation(email) {
      return base.resendConfirmation(email);
    },
    requestPasswordRecovery(email) {
      return base.requestPasswordRecovery(email);
    },
    async exchangePasswordRecoveryCode(code) {
      /*
       * Serialize a deep-link exchange behind bootstrap. Without this await,
       * a cold-start session read could race the provider exchange and return
       * its newly persisted recovery session as an ordinary restored session.
       */
      if (auditState !== "ready") {
        const audited = await currentSession();
        if (!audited.ok) {
          return { ok: false, error: audited.error };
        }
      }
      if (markerPresent) return recoverySessionBlockedFailure();
      if (activeExchange) {
        return {
          ok: false,
          error: {
            code: "invalid_request",
            message:
              "Finish or close the current password-recovery exchange first.",
            retryable: false
          }
        };
      }
      const exchangeId = createExchangeId();
      const attempt = { exchangeId, cancelled: false };
      activeExchange = attempt;
      try {
        /*
         * Treat an interrupted/partially failed secure write as protected too.
         * The explicit cleanup path will remove any record that reached disk.
         */
        markerPresent = true;
        try {
          await options.markerStore.begin(
            exchangeId,
            now().toISOString()
          );
        } catch {
          return markerFailure(
            "Heldat could not protect this password-recovery exchange on the device."
          );
        }

        const exchanged =
          await base.exchangePasswordRecoveryCode(code);
        if (!exchanged.ok) return exchanged;
        if (attempt.cancelled) {
          const cleaned = await cleanupRecoverySession();
          return cleaned.ok ? cancelledExchangeFailure() : cleaned;
        }

        try {
          await options.markerStore.bindAccount(
            exchangeId,
            exchanged.value.session.identity.id
          );
        } catch {
          const cleaned = await cleanupRecoverySession();
          return cleaned.ok
            ? markerFailure(
                "Heldat closed a recovery session that could not be protected on this device."
              )
            : cleaned;
        }

        if (attempt.cancelled) {
          const cleaned = await cleanupRecoverySession();
          return cleaned.ok ? cancelledExchangeFailure() : cleaned;
        }
        return exchanged;
      } finally {
        if (activeExchange === attempt) activeExchange = null;
      }
    },
    async cancelPasswordRecovery() {
      if (!activeExchange && !markerPresent) {
        return { ok: true, value: undefined };
      }
      if (activeExchange) activeExchange.cancelled = true;
      return cleanupRecoverySession();
    },
    async updatePassword(password) {
      const updated = await base.updatePassword(password);
      if (!updated.ok) return updated;

      /*
       * Updating the password does not end Supabase's persisted recovery
       * session. Finish that account boundary before reporting success so a
       * process death on the completion screen cannot restore the session as
       * an ordinary sign-in.
       */
      return cleanupRecoverySession();
    },
    exchangeConfirmationCode(code) {
      return base.exchangeConfirmationCode(code);
    },
    beginPreviewSession(email) {
      return base.beginPreviewSession(email);
    },
    async signOut() {
      if (activeExchange) activeExchange.cancelled = true;
      const result = await base.signOut();
      if (!result.ok) return result;
      return clearKnownMarker();
    },
    async purgeLocalSession() {
      if (activeExchange) activeExchange.cancelled = true;
      if (base.purgeLocalSession) {
        await base.purgeLocalSession();
      } else {
        const signedOut = await base.signOut();
        if (!signedOut.ok) {
          throw new Error(signedOut.error.message);
        }
      }
      const cleared = await clearKnownMarker();
      if (!cleared.ok) throw new Error(cleared.error.message);
    }
  };

  return gateway;
}
