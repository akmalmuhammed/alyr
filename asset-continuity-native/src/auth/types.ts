import type { HouseholdRole } from "@alyr/contracts";

export type AuthGatewayMode = "preview" | "supabase" | "unavailable";

export type SignupLaunchMode =
  | "closed_pilot"
  | "public_email"
  | "public_email_google";

/**
 * Short-lived server attestation for the operator-controlled signup path.
 *
 * The app accepts this only from its configured HTTPS API origin after exact
 * shape and lifetime validation. The matching preflight endpoint verifies the
 * signature and current config version before an identity may be created.
 */
export interface SignupModeAttestation {
  readonly contract: "heldat-signup-mode-v1";
  readonly signupMode: SignupLaunchMode;
  readonly configVersion: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly signature: string;
}

export type AuthFailureCode =
  | "account_exists"
  | "confirmation_required"
  | "invalid_credentials"
  | "invalid_request"
  | "network_unavailable"
  | "pilot_access_denied"
  | "pilot_access_required"
  | "pilot_capacity_reached"
  | "rate_limited"
  | "session_missing"
  | "unsupported"
  | "unexpected";

export interface AuthFailure {
  readonly code: AuthFailureCode;
  readonly message: string;
  readonly retryable: boolean;
  /** Stable machine-readable recovery signal; never provider-supplied text. */
  readonly reason?: "signup_mode_changed";
}

export type AuthGatewayResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AuthFailure };

export type OnboardingDisposition = "required" | "complete";

export interface AuthIdentity {
  readonly id: string;
  readonly email: string;
  /**
   * True only when the identity provider has returned a verified email state.
   * Preview identities always remain false.
   */
  readonly emailVerified: boolean;
}

export interface AuthSessionDescriptor {
  readonly identity: AuthIdentity;
  readonly assurance: "preview" | "verified-email";
  readonly expiresAt: string | null;
  readonly onboarding: OnboardingDisposition;
  /**
   * The household selected by the authenticated account service.
   *
   * `null` is expected during first-use setup and in the session-only preview.
   * A signed client must not open durable local storage until both a verified
   * account identity and a household identifier are present.
   */
  readonly activeHouseholdId: string | null;
  /**
   * Provider-controlled membership selected with `activeHouseholdId`.
   * The three active-household fields are treated as one routing tuple.
   */
  readonly activeMembershipId: string | null;
  /**
   * Provider-controlled role for the selected membership. Client workspace
   * records are never an authorization source for household administration.
   */
  readonly activeHouseholdRole: HouseholdRole | null;
}

export interface ConfirmationRequest {
  readonly destination: string;
  readonly requestedAt: string;
  /**
   * `requested` means the provider accepted a delivery request. It does not
   * claim inbox delivery. `none` is used by the local Expo Go preview.
   */
  readonly delivery: "requested" | "none";
}

export interface PasswordRecoveryRequest {
  readonly destination: string;
  readonly requestedAt: string;
  /**
   * `requested` means the provider accepted the reset-email request.
   * The session-only preview uses `none` and opens its local reset form.
   */
  readonly delivery: "requested" | "none";
}

/**
 * Ephemeral proof that the account provider emitted PASSWORD_RECOVERY while
 * ALYR was exchanging the code from the reset deep link.
 *
 * This is an in-process capability marker, not a provider token. A signed
 * gateway accepts exactly one password-update attempt for the matching grant.
 */
export interface PasswordRecoveryGrant {
  readonly id: string;
  readonly grantedAt: string;
}

export interface PasswordRecoveryExchange {
  readonly session: AuthSessionDescriptor;
  readonly grant: PasswordRecoveryGrant;
}

export type AuthAttempt =
  | {
      readonly kind: "authenticated";
      readonly session: AuthSessionDescriptor;
    }
  | {
      readonly kind: "confirmation-required";
      readonly identity: AuthIdentity;
      readonly confirmation: ConfirmationRequest;
    }
  | {
      readonly kind: "preview-ready";
      readonly identity: AuthIdentity;
      readonly confirmation: ConfirmationRequest;
    };

export interface AuthCredentials {
  readonly email: string;
  readonly password: string;
}

export interface SignUpCredentials extends AuthCredentials {
  /**
   * Operator-issued closed-pilot credential. Preview gateways ignore this
   * field; signed gateways verify it before calling the identity provider.
   */
  readonly pilotAccessCode?: string;
  /**
   * One-time household invitation captured from a join link. A signed gateway
   * exchanges this for an email-bound, zero-household-creation signup grant.
   * It is mutually exclusive with `pilotAccessCode`.
   */
  readonly householdInviteCode?: string;
}

export interface OAuthCallbackCode {
  /**
   * Short-lived PKCE authorization code returned through the app-owned
   * callback. Provider tokens are deliberately excluded from this boundary.
   */
  readonly code: string;
}

/**
 * Account authentication boundary for the native client.
 *
 * A production implementation receives a user-scoped Supabase client that is
 * configured with a publishable/anon key. Service-role credentials are never
 * accepted by this interface and must never enter the application bundle.
 */
export interface AccountAuthGateway {
  readonly mode: AuthGatewayMode;
  readSignupMode?(): Promise<
    AuthGatewayResult<SignupModeAttestation>
  >;
  currentSession(): Promise<AuthGatewayResult<AuthSessionDescriptor | null>>;
  /**
   * Requests a fresh provider session after server-side app metadata changes.
   * Preview and unavailable gateways may omit this capability.
   */
  refreshSession?(): Promise<
    AuthGatewayResult<AuthSessionDescriptor | null>
  >;
  /**
   * Returns the short-lived user bearer only at the transport boundary.
   * Tokens never enter React context, workspace snapshots, analytics, or logs.
   */
  currentAccessToken(): Promise<AuthGatewayResult<string | null>>;
  onSessionChanged(
    listener: (session: AuthSessionDescriptor | null) => void
  ): () => void;
  signIn(
    credentials: AuthCredentials
  ): Promise<AuthGatewayResult<AuthAttempt>>;
  /**
   * Opens Supabase's Google OAuth authorization endpoint in the operating
   * system authentication session. A successful result contains only the
   * callback PKCE code; the existing callback route owns the one-time exchange.
   *
   * Preview and unavailable gateways omit this capability.
   */
  beginGoogleOAuthSignIn?(): Promise<
    AuthGatewayResult<OAuthCallbackCode | null>
  >;
  signUp(
    credentials: SignUpCredentials
  ): Promise<AuthGatewayResult<AuthAttempt>>;
  resendConfirmation(
    email: string
  ): Promise<AuthGatewayResult<ConfirmationRequest>>;
  requestPasswordRecovery(
    email: string
  ): Promise<AuthGatewayResult<PasswordRecoveryRequest>>;
  exchangePasswordRecoveryCode(
    code: string
  ): Promise<AuthGatewayResult<PasswordRecoveryExchange>>;
  /**
   * Abandons an active recovery exchange/grant and invalidates its provider
   * session. The caller must stay on the protected route when this fails.
   */
  cancelPasswordRecovery(): Promise<AuthGatewayResult<void>>;
  updatePassword(password: string): Promise<AuthGatewayResult<void>>;
  exchangeConfirmationCode(
    code: string
  ): Promise<AuthGatewayResult<AuthSessionDescriptor>>;
  beginPreviewSession(
    email: string
  ): Promise<AuthGatewayResult<AuthSessionDescriptor>>;
  signOut(): Promise<AuthGatewayResult<void>>;
  /**
   * Removes this device's persisted provider session after the server has
   * already removed the account identity.
   */
  purgeLocalSession?(): Promise<void>;
}

export type FirstCaptureIntent = "item" | "place";

export interface AuthOnboardingCompletion {
  readonly householdName: string;
  readonly firstCaptureIntent: FirstCaptureIntent;
  readonly session: AuthSessionDescriptor;
}
