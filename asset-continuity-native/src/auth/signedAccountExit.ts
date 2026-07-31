import type {
  AuthGatewayMode,
  AuthIdentity,
  AuthSessionDescriptor
} from "./types";

export type SignedAccountExitResult = "signed-out" | "still-signed-in";

/**
 * Keeps signed-account controls behind the same verified identity boundary as
 * the durable household vault. Preview identities must never be described as
 * signed accounts.
 */
export function signedAccountIdentity(
  mode: AuthGatewayMode,
  session: AuthSessionDescriptor | null
): AuthIdentity | null {
  if (
    mode !== "supabase" ||
    !session ||
    session.assurance !== "verified-email" ||
    !session.identity.emailVerified ||
    !session.activeHouseholdId
  ) {
    return null;
  }
  return session.identity;
}

export function signedAccountExitMessage(
  email: string,
  householdName: string
): string {
  const account = email.trim() || "this account";
  const household = householdName.trim() || "this household";
  return `Heldat will sign out ${account}, lock “${household}” on this device, and return to account access. Local records and pending changes remain in this account’s protected vault. This does not delete household data or move it to another account.`;
}

/**
 * Navigation occurs only after the account provider confirms sign-out. A
 * provider error leaves the current vault and route in place.
 */
export async function completeSignedAccountExit(
  signOut: () => Promise<boolean>,
  routeToAuth: () => void
): Promise<SignedAccountExitResult> {
  let signedOut = false;
  try {
    signedOut = await signOut();
  } catch {
    return "still-signed-in";
  }
  if (!signedOut) return "still-signed-in";
  routeToAuth();
  return "signed-out";
}
