import type { Href } from "expo-router";

import type {
  AuthGatewayMode,
  AuthSessionDescriptor
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
 * A restored verified account never re-enters public authentication forms.
 * Incomplete accounts resume household setup; complete accounts pass through
 * `/` so the encrypted workspace and device-unlock boundaries run normally.
 *
 * The reset screen is available only while the provider-backed, in-process
 * recovery capability exists. Preview sessions retain their existing flow.
 */
export function authenticatedAuthEntryDestination(input: {
  readonly bootstrapState: AuthBootstrapState;
  readonly mode: AuthGatewayMode;
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
    input.passwordRecoverySessionActive
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
