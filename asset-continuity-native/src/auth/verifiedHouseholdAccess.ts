import type {
  HouseholdAccessSnapshot,
  HouseholdRole
} from "@alyr/contracts";

import type {
  AuthGatewayMode,
  AuthSessionDescriptor
} from "./types";

export interface VerifiedHouseholdAccess {
  readonly accountId: string;
  readonly householdId: string;
  readonly membershipId: string;
  readonly role: HouseholdRole;
}

/**
 * The UI boundary for claims backed by the authenticated household service.
 *
 * A configured Supabase runtime is not proof that a person is signed in. The
 * complete verified session tuple is required before Family, exports, or
 * Settings describe local data as cloud household data.
 */
export function verifiedHouseholdAccess(
  mode: AuthGatewayMode,
  session: AuthSessionDescriptor | null
): VerifiedHouseholdAccess | null {
  if (
    mode !== "supabase" ||
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
    householdId: session.activeHouseholdId,
    membershipId: session.activeMembershipId,
    role: session.activeHouseholdRole
  };
}

export function verifiedHouseholdAccessForWorkspace(
  mode: AuthGatewayMode,
  session: AuthSessionDescriptor | null,
  workspaceHouseholdId: string
): VerifiedHouseholdAccess | null {
  const access = verifiedHouseholdAccess(mode, session);
  return access?.householdId === workspaceHouseholdId ? access : null;
}

/**
 * Accepts a roster only when every provider-controlled identity in the
 * snapshot matches the verified active-session tuple.
 */
export function authoritativeHouseholdAccessSnapshot(
  mode: AuthGatewayMode,
  session: AuthSessionDescriptor | null,
  snapshot: HouseholdAccessSnapshot | null,
  workspaceHouseholdId: string
): HouseholdAccessSnapshot | null {
  const access = verifiedHouseholdAccessForWorkspace(
    mode,
    session,
    workspaceHouseholdId
  );
  if (
    !access ||
    !snapshot ||
    snapshot.householdId !== access.householdId ||
    snapshot.currentAccountId !== access.accountId ||
    snapshot.currentMembershipId !== access.membershipId ||
    snapshot.currentRole !== access.role
  ) {
    return null;
  }
  return snapshot;
}
