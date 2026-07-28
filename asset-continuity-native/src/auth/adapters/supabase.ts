import { normalizeEmail } from "../validation";
import type {
  AccountAuthGateway,
  AuthAttempt,
  AuthFailure,
  AuthGatewayResult,
  AuthIdentity,
  AuthSessionDescriptor,
  ConfirmationRequest,
  PasswordRecoveryExchange,
  PasswordRecoveryGrant,
  PasswordRecoveryRequest
} from "../types";

interface SupabaseUserLike {
  readonly id: string;
  readonly email?: string;
  readonly email_confirmed_at?: string | null;
  readonly user_metadata?: Readonly<Record<string, unknown>>;
  readonly app_metadata?: Readonly<Record<string, unknown>>;
}

interface SupabaseSessionLike {
  readonly user: SupabaseUserLike;
  readonly expires_at?: number;
  readonly access_token?: string;
}

interface SupabaseErrorLike {
  readonly message: string;
  readonly status?: number;
  readonly code?: string;
}

interface SupabaseResponse<T> {
  readonly data: T;
  readonly error: SupabaseErrorLike | null;
}

/**
 * Minimal shape consumed from `supabase.auth`. The caller constructs the
 * Supabase client with a publishable/anon key and owns secure token storage.
 * A service-role client is intentionally not representable here.
 */
export interface SupabaseAuthClientLike {
  readonly auth: {
    signUp(input: {
      readonly email: string;
      readonly password: string;
      readonly options?: {
        readonly data?: Readonly<Record<string, unknown>>;
        readonly emailRedirectTo?: string;
      };
    }): Promise<
      SupabaseResponse<{
        readonly user: SupabaseUserLike | null;
        readonly session: SupabaseSessionLike | null;
      }>
    >;
    signInWithPassword(input: {
      readonly email: string;
      readonly password: string;
    }): Promise<
      SupabaseResponse<{
        readonly user: SupabaseUserLike | null;
        readonly session: SupabaseSessionLike | null;
      }>
    >;
    resend(input: {
      readonly type: "signup";
      readonly email: string;
      readonly options?: { readonly emailRedirectTo?: string };
    }): Promise<SupabaseResponse<object>>;
    resetPasswordForEmail(
      email: string,
      options?: { readonly redirectTo?: string }
    ): Promise<SupabaseResponse<object>>;
    updateUser(input: {
      readonly password: string;
    }): Promise<
      SupabaseResponse<{
        readonly user: SupabaseUserLike | null;
      }>
    >;
    getSession(): Promise<
      SupabaseResponse<{
        readonly session: SupabaseSessionLike | null;
      }>
    >;
    refreshSession(): Promise<
      SupabaseResponse<{
        readonly user: SupabaseUserLike | null;
        readonly session: SupabaseSessionLike | null;
      }>
    >;
    onAuthStateChange(
      listener: (
        event: string,
        session: SupabaseSessionLike | null
      ) => void
    ): {
      readonly data: {
        readonly subscription: {
          unsubscribe(): void;
        };
      };
    };
    exchangeCodeForSession(
      code: string
    ): Promise<
      SupabaseResponse<{
        readonly user: SupabaseUserLike | null;
        readonly session: SupabaseSessionLike | null;
      }>
    >;
    signOut(options?: {
      readonly scope?: "global" | "local" | "others";
    }): Promise<SupabaseResponse<object>>;
  };
}

export interface SupabaseAuthAdapterOptions {
  readonly emailRedirectTo: string;
  readonly passwordRecoveryRedirectTo: string;
  readonly pilotAccessEndpoint: string;
  readonly householdInviteAccessEndpoint?: string;
  readonly publicApiKey: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
}

function mapFailure(error: SupabaseErrorLike): AuthFailure {
  const status = error.status ?? 0;
  const source = `${error.code ?? ""} ${error.message}`.toLowerCase();
  if (
    source.includes("pilot_signup_grant_required") ||
    source.includes("pilot signup grant")
  ) {
    return {
      code: "pilot_access_denied",
      message: "Pilot access changed before the account was created.",
      retryable: false
    };
  }
  if (status === 429 || source.includes("rate")) {
    return {
      code: "rate_limited",
      message: "Too many attempts. Wait a moment, then try again.",
      retryable: true
    };
  }
  if (
    source.includes("invalid login") ||
    source.includes("invalid credentials")
  ) {
    return {
      code: "invalid_credentials",
      message: "The email or password is not correct.",
      retryable: false
    };
  }
  if (
    source.includes("email not confirmed") ||
    source.includes("email_not_confirmed")
  ) {
    return {
      code: "confirmation_required",
      message: "Confirm this email before signing in.",
      retryable: false
    };
  }
  if (
    source.includes("already registered") ||
    source.includes("already exists")
  ) {
    return {
      code: "account_exists",
      message: "An account already exists for this email.",
      retryable: false
    };
  }
  if (status === 0 || source.includes("network") || source.includes("fetch")) {
    return {
      code: "network_unavailable",
      message: "ALYR could not reach the account service. Check your connection.",
      retryable: true
    };
  }
  return {
    code: "unexpected",
    message: "The account service could not complete this request.",
    retryable: status >= 500
  };
}

function fail<T>(error: SupabaseErrorLike): AuthGatewayResult<T> {
  return { ok: false, error: mapFailure(error) };
}

function identityFrom(user: SupabaseUserLike): AuthIdentity | null {
  const email = user.email ? normalizeEmail(user.email) : "";
  if (!user.id || !email) return null;
  return {
    id: user.id,
    email,
    emailVerified: Boolean(user.email_confirmed_at)
  };
}

function sessionFrom(
  session: SupabaseSessionLike
): AuthSessionDescriptor | null {
  const identity = identityFrom(session.user);
  if (!identity || !identity.emailVerified) return null;
  const householdValue =
    session.user.app_metadata?.active_household_id;
  const membershipValue =
    session.user.app_metadata?.active_membership_id;
  const roleValue =
    session.user.app_metadata?.active_household_role;
  const validRoutingIdentity = (value: unknown): value is string =>
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 512 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
  const routingTupleIsValid =
    validRoutingIdentity(householdValue) &&
    validRoutingIdentity(membershipValue) &&
    (roleValue === "owner" ||
      roleValue === "editor" ||
      roleValue === "viewer");
  const activeHouseholdId = routingTupleIsValid
    ? householdValue
    : null;
  const activeMembershipId = routingTupleIsValid
    ? membershipValue
    : null;
  const activeHouseholdRole = routingTupleIsValid
    ? roleValue
    : null;
  return {
    identity,
    assurance: "verified-email",
    expiresAt:
      typeof session.expires_at === "number"
        ? new Date(session.expires_at * 1000).toISOString()
        : null,
    onboarding:
      routingTupleIsValid &&
      session.user.app_metadata?.onboarding_complete === true
        ? "complete"
        : "required",
    activeHouseholdId,
    activeMembershipId,
    activeHouseholdRole
  };
}

function missingSession(): AuthGatewayResult<never> {
  return {
    ok: false,
    error: {
      code: "session_missing",
      message: "No confirmed account session is available yet.",
      retryable: true
    }
  };
}

function missingRecoveryGrant(): AuthGatewayResult<never> {
  return {
    ok: false,
    error: {
      code: "session_missing",
      message:
        "Open the latest password reset link before setting a new password.",
      retryable: false
    }
  };
}

type PilotPreflightBody = {
  readonly apiVersion?: unknown;
  readonly enrollmentGrant?: unknown;
  readonly expiresAt?: unknown;
};

function pilotFailure(
  code: AuthFailure["code"],
  message: string,
  retryable: boolean
): AuthGatewayResult<never> {
  return {
    ok: false,
    error: { code, message, retryable }
  };
}

export function createSupabaseAuthGateway(
  client: SupabaseAuthClientLike,
  options: SupabaseAuthAdapterOptions
): AccountAuthGateway {
  const now = options.now ?? (() => new Date());
  const fetchImpl = options.fetchImpl ?? fetch;
  let recoverySequence = 0;
  let recoveryGrant: PasswordRecoveryGrant | null = null;
  let pendingRecoveryExchange: {
    readonly id: number;
    cancelled: boolean;
    readonly settled: Promise<void>;
  } | null = null;

  const clearRecoveryGrant = () => {
    recoveryGrant = null;
  };

  const invalidateRecoverySession =
    async (): Promise<AuthGatewayResult<void>> => {
      const pending = pendingRecoveryExchange;
      if (pending) {
        pending.cancelled = true;
        await pending.settled;
      }
      clearRecoveryGrant();
      const response = await client.auth.signOut();
      return response.error
        ? fail(response.error)
        : { ok: true, value: undefined };
    };

  const confirmationFor = (email: string): ConfirmationRequest => ({
    destination: normalizeEmail(email),
    requestedAt: now().toISOString(),
    delivery: "requested"
  });
  const recoveryFor = (email: string): PasswordRecoveryRequest => ({
    destination: normalizeEmail(email),
    requestedAt: now().toISOString(),
    delivery: "requested"
  });

  const preflightPilotSignup = async (
    email: string,
    accessCode: string
  ): Promise<AuthGatewayResult<string>> => {
    const normalizedAccessCode = accessCode
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/gu, "");
    if (!normalizedAccessCode) {
      return pilotFailure(
        "pilot_access_required",
        "Enter the early access code from your invitation.",
        false
      );
    }

    let response: Response;
    try {
      response = await fetchImpl(options.pilotAccessEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: options.publicApiKey
        },
        body: JSON.stringify({
          apiVersion: 1,
          email,
          accessCode: normalizedAccessCode
        })
      });
    } catch {
      return pilotFailure(
        "network_unavailable",
        "ALYR could not verify pilot access. Check your connection.",
        true
      );
    }

    let body: PilotPreflightBody | null = null;
    try {
      const candidate = await response.json() as unknown;
      body =
        candidate && typeof candidate === "object"
          ? candidate as PilotPreflightBody
          : null;
    } catch {
      body = null;
    }

    if (!response.ok) {
      if (response.status === 429) {
        return pilotFailure(
          "rate_limited",
          "Too many access checks. Wait a moment, then try again.",
          true
        );
      }
      if (response.status === 409) {
        return pilotFailure(
          "pilot_capacity_reached",
          "The current pilot group is full.",
          false
        );
      }
      if (response.status >= 500) {
        return pilotFailure(
          "network_unavailable",
          "Pilot access could not be verified right now.",
          true
        );
      }
      return pilotFailure(
        "pilot_access_denied",
        "This pilot invitation does not match the email.",
        false
      );
    }

    if (
      body?.apiVersion !== 1 ||
      typeof body.enrollmentGrant !== "string" ||
      !/^[a-f0-9]{64}$/u.test(body.enrollmentGrant) ||
      typeof body.expiresAt !== "string" ||
      Number.isNaN(Date.parse(body.expiresAt)) ||
      Date.parse(body.expiresAt) <= now().getTime()
    ) {
      return pilotFailure(
        "unexpected",
        "Pilot access returned an incomplete verification.",
        true
      );
    }

    return { ok: true, value: body.enrollmentGrant };
  };

  const preflightHouseholdInviteSignup = async (
    email: string,
    inviteCode: string
  ): Promise<AuthGatewayResult<string>> => {
    const normalizedInviteCode = inviteCode.trim().toUpperCase();
    if (
      !normalizedInviteCode ||
      normalizedInviteCode.length > 128 ||
      /[\u0000-\u001f\u007f-\u009f]/u.test(normalizedInviteCode)
    ) {
      return pilotFailure(
        "pilot_access_denied",
        "This household invitation is invalid or has expired.",
        false
      );
    }
    const endpoint =
      options.householdInviteAccessEndpoint ??
      options.pilotAccessEndpoint.replace(
        /\/pilot\/preflight$/u,
        "/invites/preflight"
      );
    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: options.publicApiKey
        },
        body: JSON.stringify({
          apiVersion: 1,
          email,
          oneTimeCode: normalizedInviteCode
        })
      });
    } catch {
      return pilotFailure(
        "network_unavailable",
        "ALYR could not verify the household invitation. Check your connection.",
        true
      );
    }

    let body: PilotPreflightBody | null = null;
    try {
      const candidate = await response.json() as unknown;
      body =
        candidate && typeof candidate === "object"
          ? candidate as PilotPreflightBody
          : null;
    } catch {
      body = null;
    }
    if (!response.ok) {
      if (response.status === 429) {
        return pilotFailure(
          "rate_limited",
          "Too many invitation checks. Wait a moment, then try again.",
          true
        );
      }
      if (response.status >= 500) {
        return pilotFailure(
          "network_unavailable",
          "The household invitation could not be verified right now.",
          true
        );
      }
      return pilotFailure(
        "pilot_access_denied",
        "This household invitation is invalid, expired, used, or reserved for another email.",
        false
      );
    }
    if (
      body?.apiVersion !== 1 ||
      typeof body.enrollmentGrant !== "string" ||
      !/^[a-f0-9]{64}$/u.test(body.enrollmentGrant) ||
      typeof body.expiresAt !== "string" ||
      Number.isNaN(Date.parse(body.expiresAt)) ||
      Date.parse(body.expiresAt) <= now().getTime()
    ) {
      return pilotFailure(
        "unexpected",
        "Household access returned an incomplete verification.",
        true
      );
    }
    return { ok: true, value: body.enrollmentGrant };
  };

  return {
    mode: "supabase",

    async currentSession() {
      const response = await client.auth.getSession();
      if (response.error) return fail(response.error);
      if (!response.data.session) return { ok: true, value: null };
      const session = sessionFrom(response.data.session);
      return session
        ? { ok: true, value: session }
        : { ok: true, value: null };
    },

    async refreshSession() {
      const response = await client.auth.refreshSession();
      if (response.error) return fail(response.error);
      if (!response.data.session) return { ok: true, value: null };
      const session = sessionFrom(response.data.session);
      return session
        ? { ok: true, value: session }
        : { ok: true, value: null };
    },

    async currentAccessToken() {
      const response = await client.auth.getSession();
      if (response.error) return fail(response.error);
      const providerSession = response.data.session;
      if (!providerSession || !sessionFrom(providerSession)) {
        return { ok: true, value: null };
      }
      const token = providerSession.access_token;
      return {
        ok: true,
        value:
          typeof token === "string" && token.trim().length > 0
            ? token
            : null
      };
    },

    onSessionChanged(listener) {
      const {
        data: { subscription }
      } = client.auth.onAuthStateChange((event, providerSession) => {
        /*
         * A recovery exchange can produce an otherwise valid signed-in
         * session before ALYR has verified the PASSWORD_RECOVERY event. Keep
         * that transient session outside global app state; the dedicated
         * exchange method exposes it only together with the one-use grant.
         */
        if (
          pendingRecoveryExchange &&
          event !== "SIGNED_OUT"
        ) {
          return;
        }
        if (event === "SIGNED_OUT") clearRecoveryGrant();
        listener(providerSession ? sessionFrom(providerSession) : null);
      });
      return () => {
        subscription.unsubscribe();
      };
    },

    async signUp(credentials) {
      clearRecoveryGrant();
      const email = normalizeEmail(credentials.email);
      if (
        credentials.pilotAccessCode &&
        credentials.householdInviteCode
      ) {
        return pilotFailure(
          "invalid_request",
          "Choose either pilot enrollment or a household invitation.",
          false
        );
      }
      const preflight = credentials.householdInviteCode
        ? await preflightHouseholdInviteSignup(
            email,
            credentials.householdInviteCode
          )
        : await preflightPilotSignup(
            email,
            credentials.pilotAccessCode ?? ""
          );
      if (!preflight.ok) return preflight;
      const response = await client.auth.signUp({
        email,
        password: credentials.password,
        options: {
          data: {
            alyr_signup_channel: "mobile-pilot-v1",
            pilot_signup_grant: preflight.value
          },
          emailRedirectTo: options.emailRedirectTo
        }
      });
      if (response.error) return fail(response.error);

      if (response.data.session) {
        const session = sessionFrom(response.data.session);
        if (!session) return missingSession();
        const value: AuthAttempt = { kind: "authenticated", session };
        return { ok: true, value };
      }

      const identity = response.data.user
        ? identityFrom(response.data.user)
        : null;
      if (!identity) {
        return {
          ok: false,
          error: {
            code: "unexpected",
            message: "The account service returned an incomplete identity.",
            retryable: true
          }
        };
      }
      const value: AuthAttempt = {
        kind: "confirmation-required",
        identity,
        confirmation: confirmationFor(email)
      };
      return { ok: true, value };
    },

    async signIn(credentials) {
      clearRecoveryGrant();
      const response = await client.auth.signInWithPassword({
        email: normalizeEmail(credentials.email),
        password: credentials.password
      });
      if (response.error) return fail(response.error);
      if (!response.data.session) return missingSession();
      const session = sessionFrom(response.data.session);
      if (!session) {
        return {
          ok: false,
          error: {
            code: "confirmation_required",
            message: "Confirm this email before signing in.",
            retryable: false
          }
        };
      }
      const value: AuthAttempt = { kind: "authenticated", session };
      return { ok: true, value };
    },

    async resendConfirmation(emailValue) {
      const email = normalizeEmail(emailValue);
      const response = await client.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: options.emailRedirectTo }
      });
      if (response.error) return fail(response.error);
      return { ok: true, value: confirmationFor(email) };
    },

    async requestPasswordRecovery(emailValue) {
      clearRecoveryGrant();
      const email = normalizeEmail(emailValue);
      const response = await client.auth.resetPasswordForEmail(email, {
        redirectTo: options.passwordRecoveryRedirectTo
      });
      if (response.error) return fail(response.error);
      return { ok: true, value: recoveryFor(email) };
    },

    async exchangePasswordRecoveryCode(code) {
      if (!code.trim()) return missingRecoveryGrant();
      if (pendingRecoveryExchange || recoveryGrant) {
        return {
          ok: false,
          error: {
            code: "invalid_request",
            message:
              "Finish or cancel the current password recovery before opening another link.",
            retryable: false
          }
        };
      }

      const id = ++recoverySequence;
      let settleExchange: () => void = () => undefined;
      const settled = new Promise<void>((resolve) => {
        settleExchange = resolve;
      });
      const pending = {
        id,
        cancelled: false,
        settled
      };
      pendingRecoveryExchange = pending;
      const observedRecovery: {
        value: PasswordRecoveryExchange | null;
      } = { value: null };
      const {
        data: { subscription }
      } = client.auth.onAuthStateChange((event, providerSession) => {
        if (
          event !== "PASSWORD_RECOVERY" ||
          pending.cancelled ||
          pendingRecoveryExchange !== pending ||
          !providerSession
        ) {
          return;
        }
        const session = sessionFrom(providerSession);
        if (!session) return;
        const grant: PasswordRecoveryGrant = {
          id: `password-recovery-${id}`,
          grantedAt: now().toISOString()
        };
        recoveryGrant = grant;
        observedRecovery.value = { session, grant };
      });

      let response: Awaited<
        ReturnType<SupabaseAuthClientLike["auth"]["exchangeCodeForSession"]>
      > | null = null;
      try {
        response = await client.auth.exchangeCodeForSession(code);
      } catch {
        response = null;
      } finally {
        subscription.unsubscribe();
        settleExchange();
        if (pendingRecoveryExchange === pending) {
          pendingRecoveryExchange = null;
        }
      }
      if (pending.cancelled) {
        clearRecoveryGrant();
        return missingRecoveryGrant();
      }
      if (!response) {
        clearRecoveryGrant();
        return fail({
          message: "network request failed",
          status: 0
        });
      }
      if (response.error) {
        clearRecoveryGrant();
        return fail(response.error);
      }

      const exchangedSession = response.data.session
        ? sessionFrom(response.data.session)
        : null;
      const recoveryExchange = observedRecovery.value;
      if (
        !recoveryExchange ||
        !exchangedSession ||
        recoveryExchange.session.identity.id !==
          exchangedSession.identity.id
      ) {
        clearRecoveryGrant();
        const signOut = await client.auth.signOut();
        return signOut.error ? fail(signOut.error) : missingRecoveryGrant();
      }
      return { ok: true, value: recoveryExchange };
    },

    async cancelPasswordRecovery() {
      return invalidateRecoverySession();
    },

    async updatePassword(password) {
      if (!recoveryGrant) return missingRecoveryGrant();
      /*
       * Claim before the network call so concurrent or repeated submissions
       * cannot reuse the same provider recovery event. A failed attempt
       * requires a fresh reset link.
       */
      clearRecoveryGrant();
      const response = await client.auth.updateUser({ password });
      if (response.error) return fail(response.error);
      return { ok: true, value: undefined };
    },

    async exchangeConfirmationCode(code) {
      clearRecoveryGrant();
      if (!code.trim()) {
        return {
          ok: false,
          error: {
            code: "invalid_request",
            message: "The confirmation link is incomplete.",
            retryable: false
          }
        };
      }
      const response = await client.auth.exchangeCodeForSession(code);
      if (response.error) return fail(response.error);
      if (!response.data.session) return missingSession();
      const session = sessionFrom(response.data.session);
      return session ? { ok: true, value: session } : missingSession();
    },

    async beginPreviewSession() {
      return {
        ok: false,
        error: {
          code: "unsupported",
          message: "Preview sessions are unavailable for cloud accounts.",
          retryable: false
        }
      };
    },

    async signOut() {
      return invalidateRecoverySession();
    },

    async purgeLocalSession() {
      clearRecoveryGrant();
      await client.auth.signOut({ scope: "local" });
    }
  };
}
