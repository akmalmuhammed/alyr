import type {
  AccountAuthGateway,
  AuthGatewayResult
} from "../types";

function unavailable<T>(): AuthGatewayResult<T> {
  return {
    ok: false,
    error: {
      code: "unsupported",
      message:
        "Account service configuration is not available in this signed build.",
      retryable: false
    }
  };
}

/**
 * Fail-closed gateway used by a signed runtime until its user-scoped account
 * client has been configured. Falling back to the session-only preview here
 * would let a signed binary appear authenticated while opening an unscoped
 * device vault.
 */
export function createUnavailableAuthGateway(): AccountAuthGateway {
  return {
    mode: "unavailable",
    async readSignupMode() {
      return unavailable();
    },
    async currentSession() {
      return unavailable();
    },
    async currentAccessToken() {
      return unavailable();
    },
    onSessionChanged() {
      return () => undefined;
    },
    async signIn() {
      return unavailable();
    },
    async signUp() {
      return unavailable();
    },
    async resendConfirmation() {
      return unavailable();
    },
    async requestPasswordRecovery() {
      return unavailable();
    },
    async exchangePasswordRecoveryCode() {
      return unavailable();
    },
    async cancelPasswordRecovery() {
      return unavailable();
    },
    async updatePassword() {
      return unavailable();
    },
    async exchangeConfirmationCode() {
      return unavailable();
    },
    async beginPreviewSession() {
      return unavailable();
    },
    async signOut() {
      return { ok: true, value: undefined };
    },
    async purgeLocalSession() {
      return undefined;
    }
  };
}
