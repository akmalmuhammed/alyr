import type { Href } from "expo-router";

import type {
  AuthGatewayMode,
  AuthSessionDescriptor,
  FirstCaptureIntent
} from "./types";

export const AUTH_ROUTES = {
  welcome: "/(auth)",
  signIn: "/(auth)/sign-in",
  forgotPassword: "/(auth)/forgot-password",
  resetPassword: "/(auth)/reset-password",
  join: "/join",
  createAccount: "/(auth)/create-account",
  confirmEmail: "/(auth)/confirm-email",
  callback: "/(auth)/callback",
  household: "/(auth)/household",
  privacy: "/(auth)/privacy"
} as const satisfies Record<string, Href>;

export const HOUSEHOLD_ROUTES = {
  inviteMember: "/invite-member",
  memberAccess: "/member-access"
} as const satisfies Record<string, Href>;

export type AuthRouteName = keyof typeof AUTH_ROUTES;

export type PublicAuthEntryRoute =
  | "welcome"
  | "createAccount"
  | "signIn"
  | "forgotPassword"
  | "resetPassword";

export type AuthBootstrapState = "bootstrapping" | "ready" | "error";

const PUBLIC_AUTH_ENTRY_BY_SEGMENT = {
  "create-account": "createAccount",
  "forgot-password": "forgotPassword",
  "reset-password": "resetPassword",
  "sign-in": "signIn"
} as const satisfies Record<string, PublicAuthEntryRoute>;

/**
 * Resolves only the public account-entry routes owned by the `(auth)` group.
 * Setup, confirmation, and callback routes deliberately remain outside this
 * map because they have their own state-specific routing contracts.
 */
export function publicAuthEntryRouteFromSegments(
  segments: readonly string[]
): PublicAuthEntryRoute | null {
  const leaf = segments[segments.length - 1];
  if (leaf === "(auth)" || leaf === "index") return "welcome";
  return leaf && leaf in PUBLIC_AUTH_ENTRY_BY_SEGMENT
    ? PUBLIC_AUTH_ENTRY_BY_SEGMENT[
        leaf as keyof typeof PUBLIC_AUTH_ENTRY_BY_SEGMENT
      ]
    : null;
}

/**
 * A reset-link code is only an admission ticket to the recovery exchange
 * screen. It is not a recovery capability: the signed reset form remains
 * locked until the provider emits a matching one-use recovery grant.
 *
 * Expo Router may represent a repeated query key as an array. The reset
 * screen consumes the first value, so the route guard must make the same
 * decision and must not admit an empty first value.
 */
export function hasPasswordRecoveryCodeParameter(
  value: string | readonly string[] | undefined
): boolean {
  const code = typeof value === "string" ? value : value?.[0];
  return Boolean(code?.trim());
}

/**
 * A restored verified account never re-enters public authentication forms.
 * Incomplete accounts resume household setup; complete accounts pass through
 * `/` so the encrypted workspace and device-unlock boundaries run normally.
 *
 * A reset deep link may mount long enough to exchange its one-use code even
 * when an ordinary verified session was restored. This exception grants no
 * password-update authority by itself; the reset screen requires the separate
 * provider-backed, in-process recovery capability before exposing its form.
 * Preview sessions retain their existing flow.
 */
export function authenticatedAuthEntryDestination(input: {
  readonly bootstrapState: AuthBootstrapState;
  readonly mode: AuthGatewayMode;
  readonly passwordRecoveryCodePresent: boolean;
  readonly passwordRecoverySessionActive: boolean;
  readonly route: PublicAuthEntryRoute | null;
  readonly session: AuthSessionDescriptor | null;
}): typeof AUTH_ROUTES.household | "/" | null {
  const { session } = input;
  if (
    input.bootstrapState !== "ready" ||
    input.mode !== "supabase" ||
    !input.route ||
    !session ||
    session.assurance !== "verified-email" ||
    !session.identity.emailVerified
  ) {
    return null;
  }
  if (
    input.route === "resetPassword" &&
    (input.passwordRecoveryCodePresent ||
      input.passwordRecoverySessionActive)
  ) {
    return null;
  }
  if (
    session.onboarding !== "complete" ||
    !session.activeHouseholdId ||
    !session.activeMembershipId ||
    !session.activeHouseholdRole
  ) {
    return AUTH_ROUTES.household;
  }
  return "/";
}

export const AUTH_ROUTE_SEQUENCE = [
  "welcome",
  "createAccount",
  "confirmEmail",
  "household",
  "privacy"
] as const satisfies readonly AuthRouteName[];

export function authStepNumber(
  route: "confirmEmail" | "household" | "privacy"
): { readonly current: number; readonly total: number } {
  switch (route) {
    case "confirmEmail":
      return { current: 1, total: 3 };
    case "household":
      return { current: 2, total: 3 };
    case "privacy":
      return { current: 3, total: 3 };
  }
}

export function firstRecordCaptureDestination(
  intent: FirstCaptureIntent
): "/capture" | "/capture?intent=place" {
  return intent === "place" ? "/capture?intent=place" : "/capture";
}
