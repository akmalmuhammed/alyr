import * as Crypto from "expo-crypto";

import { normalizeEmail } from "../validation";
import type {
  AccountAuthGateway,
  AuthAttempt,
  AuthFailure,
  AuthGatewayResult,
  AuthSessionDescriptor,
  ConfirmationRequest,
  PasswordRecoveryRequest
} from "../types";

type PasswordDigest = (value: string) => Promise<string>;

interface PreviewAccount {
  readonly id: string;
  readonly email: string;
  credentialDigest: string;
  readonly createdAt: string;
  activated: boolean;
}

export interface PreviewAuthOptions {
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly digest?: PasswordDigest;
}

function failure(
  code: AuthFailure["code"],
  message: string,
  retryable = false
): AuthGatewayResult<never> {
  return { ok: false, error: { code, message, retryable } };
}

async function defaultDigest(value: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    value
  );
}

/**
 * Session-only identity adapter for Expo Go and browser previews.
 *
 * It never sends email, never claims verification, stores no plaintext
 * password, and loses every account when the JavaScript session ends.
 */
export function createPreviewAuthGateway(
  options: PreviewAuthOptions = {}
): AccountAuthGateway {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? (() => Crypto.randomUUID());
  const digest = options.digest ?? defaultDigest;
  const accounts = new Map<string, PreviewAccount>();
  const listeners = new Set<
    (session: AuthSessionDescriptor | null) => void
  >();
  let current: AuthSessionDescriptor | null = null;
  let recoveryEmail: string | null = null;
  const publish = () => {
    listeners.forEach((listener) => listener(current));
  };

  const requestFor = (email: string): ConfirmationRequest => ({
    destination: email,
    requestedAt: now().toISOString(),
    delivery: "none"
  });

  const sessionFor = (
    account: PreviewAccount
  ): AuthSessionDescriptor => ({
    identity: {
      id: account.id,
      email: account.email,
      emailVerified: false
    },
    assurance: "preview",
    expiresAt: null,
    onboarding: "required",
    activeHouseholdId: null,
    activeMembershipId: null,
    activeHouseholdRole: null
  });

  const gateway: AccountAuthGateway = {
    mode: "preview",

    async currentSession() {
      return { ok: true, value: current };
    },

    async currentAccessToken() {
      return { ok: true, value: null };
    },

    onSessionChanged(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async signUp(credentials) {
      const email = normalizeEmail(credentials.email);
      if (accounts.has(email)) {
        return failure(
          "account_exists",
          "A preview account with this email already exists in this session."
        );
      }
      const accountId = createId();
      const account: PreviewAccount = {
        id: accountId,
        email,
        credentialDigest: await digest(
          `${accountId}:${credentials.password}`
        ),
        createdAt: now().toISOString(),
        activated: false
      };
      accounts.set(email, account);
      const value: AuthAttempt = {
        kind: "preview-ready",
        identity: {
          id: account.id,
          email: account.email,
          emailVerified: false
        },
        confirmation: requestFor(email)
      };
      return { ok: true, value };
    },

    async signIn(credentials) {
      const email = normalizeEmail(credentials.email);
      const account = accounts.get(email);
      if (!account) {
        return failure(
          "invalid_credentials",
          "No matching preview account exists in this session."
        );
      }
      const candidate = await digest(
        `${account.id}:${credentials.password}`
      );
      if (candidate !== account.credentialDigest) {
        return failure(
          "invalid_credentials",
          "The email or password does not match this preview account."
        );
      }
      if (!account.activated) {
        const value: AuthAttempt = {
          kind: "preview-ready",
          identity: {
            id: account.id,
            email: account.email,
            emailVerified: false
          },
          confirmation: requestFor(email)
        };
        return { ok: true, value };
      }
      current = sessionFor(account);
      publish();
      const value: AuthAttempt = {
        kind: "authenticated",
        session: current
      };
      return { ok: true, value };
    },

    async resendConfirmation(emailValue) {
      const email = normalizeEmail(emailValue);
      if (!accounts.has(email)) {
        return failure(
          "invalid_request",
          "Create a preview account before continuing."
        );
      }
      return { ok: true, value: requestFor(email) };
    },

    async requestPasswordRecovery(emailValue) {
      const email = normalizeEmail(emailValue);
      recoveryEmail = email;
      const value: PasswordRecoveryRequest = {
        destination: email,
        requestedAt: now().toISOString(),
        delivery: "none"
      };
      return { ok: true, value };
    },

    async exchangePasswordRecoveryCode() {
      return failure(
        "unsupported",
        "Email recovery links are not used in session-only preview mode."
      );
    },

    async cancelPasswordRecovery() {
      current = null;
      recoveryEmail = null;
      publish();
      return { ok: true, value: undefined };
    },

    async updatePassword(password) {
      if (!recoveryEmail) {
        return failure(
          "session_missing",
          "Start password recovery before setting a new password."
        );
      }
      const account = accounts.get(recoveryEmail);
      if (!account) {
        recoveryEmail = null;
        return failure(
          "session_missing",
          "The preview recovery session has expired."
        );
      }
      account.credentialDigest = await digest(
        `${account.id}:${password}`
      );
      recoveryEmail = null;
      return { ok: true, value: undefined };
    },

    async exchangeConfirmationCode() {
      return failure(
        "unsupported",
        "Email confirmation links are not used in session-only preview mode."
      );
    },

    async beginPreviewSession(emailValue) {
      const email = normalizeEmail(emailValue);
      const account = accounts.get(email);
      if (!account) {
        return failure(
          "invalid_request",
          "Create a preview account before continuing."
        );
      }
      account.activated = true;
      current = sessionFor(account);
      publish();
      return { ok: true, value: current };
    },

    async signOut() {
      current = null;
      recoveryEmail = null;
      publish();
      return { ok: true, value: undefined };
    },

    async purgeLocalSession() {
      current = null;
      recoveryEmail = null;
      publish();
    }
  };

  return gateway;
}
