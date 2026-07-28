import type { HouseholdAccessSnapshot } from "@alyr/contracts";

import {
  authoritativeHouseholdAccessSnapshot,
  verifiedHouseholdAccess,
  verifiedHouseholdAccessForWorkspace
} from "@/auth/verifiedHouseholdAccess";
import type { AuthSessionDescriptor } from "@/auth/types";
import {
  householdAccessSummary,
  sampleHouseholdAccessSummary
} from "@/i18n/coreJourneyCopy";

const verifiedSession: AuthSessionDescriptor = {
  identity: {
    id: "account-a",
    email: "owner@example.com",
    emailVerified: true
  },
  assurance: "verified-email",
  expiresAt: "2026-08-01T00:00:00.000Z",
  onboarding: "complete",
  activeHouseholdId: "household-a",
  activeMembershipId: "membership-owner",
  activeHouseholdRole: "owner"
};

const accessSnapshot: HouseholdAccessSnapshot = {
  householdId: "household-a",
  householdName: "Household A",
  householdVersion: 1,
  currentMembershipId: "membership-owner",
  currentAccountId: "account-a",
  currentRole: "owner",
  members: [
    {
      membershipId: "membership-owner",
      householdId: "household-a",
      accountId: "account-a",
      displayName: "Owner",
      email: "owner@example.com",
      role: "owner",
      status: "active",
      version: 1,
      joinedAt: "2026-07-01T00:00:00.000Z",
      isCurrentUser: true
    },
    {
      membershipId: "membership-editor",
      householdId: "household-a",
      accountId: "account-b",
      displayName: "Editor",
      email: "editor@example.com",
      role: "editor",
      status: "active",
      version: 1,
      joinedAt: "2026-07-02T00:00:00.000Z",
      isCurrentUser: false
    }
  ],
  pendingInvites: [
    {
      inviteId: "invite-a",
      householdId: "household-a",
      role: "viewer",
      status: "pending",
      version: 1,
      createdAt: "2026-07-27T00:00:00.000Z",
      expiresAt: "2026-07-30T00:00:00.000Z"
    }
  ],
  refreshedAt: "2026-07-28T00:00:00.000Z"
};

describe("verified household UI boundary", () => {
  it("does not treat a configured signed runtime as an authenticated household", () => {
    expect(verifiedHouseholdAccess("supabase", null)).toBeNull();
    expect(
      verifiedHouseholdAccess("supabase", {
        ...verifiedSession,
        onboarding: "required"
      })
    ).toBeNull();
    expect(
      verifiedHouseholdAccess("supabase", {
        ...verifiedSession,
        activeMembershipId: null
      })
    ).toBeNull();
    expect(
      verifiedHouseholdAccess("preview", verifiedSession)
    ).toBeNull();
  });

  it("requires the verified active household to match the open workspace", () => {
    expect(
      verifiedHouseholdAccessForWorkspace(
        "supabase",
        verifiedSession,
        "household-b"
      )
    ).toBeNull();
    expect(
      verifiedHouseholdAccessForWorkspace(
        "supabase",
        verifiedSession,
        "household-a"
      )
    ).toEqual({
      accountId: "account-a",
      householdId: "household-a",
      membershipId: "membership-owner",
      role: "owner"
    });
  });

  it("accepts only a roster bound to the complete verified session tuple", () => {
    expect(
      authoritativeHouseholdAccessSnapshot(
        "supabase",
        verifiedSession,
        accessSnapshot,
        "household-a"
      )
    ).toBe(accessSnapshot);
    expect(
      authoritativeHouseholdAccessSnapshot(
        "supabase",
        verifiedSession,
        {
          ...accessSnapshot,
          currentMembershipId: "membership-stale"
        },
        "household-a"
      )
    ).toBeNull();
    expect(
      authoritativeHouseholdAccessSnapshot(
        "supabase",
        null,
        accessSnapshot,
        "household-a"
      )
    ).toBeNull();
  });

  it("reports active members and pending invitations separately in English and Arabic", () => {
    expect(
      householdAccessSummary(
        accessSnapshot.members.length,
        accessSnapshot.pendingInvites.length,
        "en"
      )
    ).toBe("2 people · 1 pending invitation");
    expect(
      householdAccessSummary(
        accessSnapshot.members.length,
        accessSnapshot.pendingInvites.length,
        "ar"
      )
    ).toContain("دعوة معلّقة واحدة");
    expect(householdAccessSummary(1, 0, "en")).toBe(
      "1 person · no pending invitations"
    );
    expect(sampleHouseholdAccessSummary(3, "en")).toBe(
      "3 people · local sample · not shared"
    );
    expect(sampleHouseholdAccessSummary(3, "ar")).toContain(
      "نموذج محلي غير مشترك"
    );
  });
});
