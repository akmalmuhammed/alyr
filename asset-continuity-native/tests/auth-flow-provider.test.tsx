import { act, render, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

import {
  AuthFlowProvider,
  useAuthFlow
} from "@/auth/AuthFlowProvider";
import { createUnavailableAuthGateway } from "@/auth/adapters/unavailable";
import type {
  AccountAuthGateway,
  AuthSessionDescriptor
} from "@/auth/types";
import type {
  AccountDeletionPort,
  HouseholdAccessSnapshot,
  HouseholdAccessPort
} from "@alyr/contracts";

function householdAdministrationStubs() {
  return {
    getAccessSnapshot: jest.fn(async () => ({
      ok: false as const,
      error: {
        errorVersion: 1 as const,
        code: "OFFLINE" as const,
        message: "Test roster offline.",
        retryable: true
      }
    })),
    changeMemberRole: jest.fn(),
    revokeMember: jest.fn(),
    cancelInvite: jest.fn(),
    transferOwnership: jest.fn()
  };
}

const restoredSession: AuthSessionDescriptor = {
  identity: {
    id: "account-owner",
    email: "owner@example.com",
    emailVerified: true
  },
  assurance: "verified-email",
  expiresAt: "2026-08-01T00:00:00.000Z",
  onboarding: "complete",
  activeHouseholdId: "household-a",
  activeMembershipId: "membership-a",
  activeHouseholdRole: "owner"
};

function gatewayWithSession(
  session: AuthSessionDescriptor | null
): AccountAuthGateway {
  const currentSession: AccountAuthGateway["currentSession"] = jest.fn(
    async () => ({ ok: true as const, value: session })
  );
  const signIn: AccountAuthGateway["signIn"] = jest.fn(async () => ({
    ok: true as const,
    value: {
      kind: "authenticated" as const,
      session: restoredSession
    }
  }));
  const signUp: AccountAuthGateway["signUp"] = jest.fn(async () => ({
    ok: true as const,
    value: {
      kind: "authenticated" as const,
      session: restoredSession
    }
  }));
  const unsupported = {
    ok: false as const,
    error: {
      code: "unsupported" as const,
      message: "not used",
      retryable: false
    }
  };
  return {
    mode: "supabase",
    currentSession,
    refreshSession: jest.fn(async () => ({
      ok: true as const,
      value: session
    })),
    currentAccessToken: jest.fn(async () => ({
      ok: true as const,
      value: "test-access-token"
    })),
    onSessionChanged: jest.fn(() => () => undefined),
    signIn,
    signUp,
    resendConfirmation: jest.fn(async () => unsupported),
    requestPasswordRecovery: jest.fn(async () => unsupported),
    exchangePasswordRecoveryCode: jest.fn(async () => unsupported),
    cancelPasswordRecovery: jest.fn(async () => ({
      ok: true as const,
      value: undefined
    })),
    updatePassword: jest.fn(async () => unsupported),
    exchangeConfirmationCode: jest.fn(async () => ({
      ok: true as const,
      value: restoredSession
    })),
    beginPreviewSession: jest.fn(async () => unsupported),
    signOut: jest.fn(async () => ({
      ok: true as const,
      value: undefined
    }))
  };
}

let latestAuth: ReturnType<typeof useAuthFlow> | null = null;

function Probe() {
  latestAuth = useAuthFlow();
  return (
    <Text testID="auth-state">
      {latestAuth.bootstrapState}:{latestAuth.session?.identity.id ?? "none"}:
      {latestAuth.activeHouseholdId ?? "none"}
    </Text>
  );
}

describe("global auth session state", () => {
  beforeEach(() => {
    latestAuth = null;
  });

  it("bootstraps a verified session and changes household selection atomically", async () => {
    const gateway = gatewayWithSession(restoredSession);
    const screen = await render(
      <AuthFlowProvider gateway={gateway}>
        <Probe />
      </AuthFlowProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-state").props.children.join("")).toBe(
        "ready:account-owner:household-a"
      );
    });
    expect(gateway.currentSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      latestAuth!.selectHousehold("household-b");
    });
    await waitFor(() => {
      expect(screen.getByTestId("auth-state").props.children.join("")).toBe(
        "ready:account-owner:household-b"
      );
    });

    await act(async () => {
      await latestAuth!.signOut();
    });
    expect(screen.getByTestId("auth-state").props.children.join("")).toBe(
      "ready:none:none"
    );
    expect(gateway.signOut).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });

  it("binds destructive deletion to the verified session and clears the local provider session", async () => {
    const gateway = gatewayWithSession(restoredSession);
    gateway.purgeLocalSession = jest.fn(async () => undefined);
    const accountDeletion: AccountDeletionPort = {
      deleteAccount: jest.fn(async (input) => ({
        ok: true as const,
        value: {
          accountId: input.expectedAccountId,
          deletedHouseholdIds: [input.expectedActiveHouseholdId],
          departedHouseholdIds: [],
          deletedAt: "2026-07-27T08:00:00.000Z"
        }
      }))
    };
    const screen = await render(
      <AuthFlowProvider
        accountDeletion={accountDeletion}
        gateway={gateway}
      >
        <Probe />
      </AuthFlowProvider>
    );
    await waitFor(() => expect(latestAuth?.bootstrapState).toBe("ready"));

    await act(async () => {
      await expect(
        latestAuth!.deleteAccount(
          "private-password",
          "owner@example.com"
        )
      ).resolves.toMatchObject({
        ok: true,
        value: { accountId: "account-owner" }
      });
    });
    expect(accountDeletion.deleteAccount).toHaveBeenCalledWith({
      apiVersion: 1,
      expectedAccountId: "account-owner",
      expectedActiveHouseholdId: "household-a",
      expectedActiveHouseholdRole: "owner",
      confirmationEmail: "owner@example.com",
      password: "private-password",
      acknowledgeIrreversibleDeletion: true
    });

    await act(async () => {
      await latestAuth!.finalizeAccountDeletion();
    });
    expect(gateway.purgeLocalSession).toHaveBeenCalledTimes(1);
    expect(latestAuth?.session).toBeNull();
    await screen.unmount();
  });

  it("fails closed when a signed build has no account gateway", async () => {
    const screen = await render(
      <AuthFlowProvider gateway={createUnavailableAuthGateway()}>
        <Probe />
      </AuthFlowProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-state").props.children.join("")).toBe(
        "error:none:none"
      );
    });
    expect(latestAuth?.mode).toBe("unavailable");
    expect(latestAuth?.error).toMatchObject({
      code: "unsupported"
    });
    await screen.unmount();
  });

  it("surfaces a bootstrap failure and restores the verified session on retry", async () => {
    const gateway = gatewayWithSession(restoredSession);
    gateway.currentSession = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false as const,
        error: {
          code: "network_unavailable" as const,
          message: "Session lookup was interrupted.",
          retryable: true
        }
      })
      .mockResolvedValueOnce({
        ok: true as const,
        value: restoredSession
      });
    const screen = await render(
      <AuthFlowProvider gateway={gateway}>
        <Probe />
      </AuthFlowProvider>
    );

    await waitFor(() =>
      expect(latestAuth?.bootstrapState).toBe("error")
    );
    expect(latestAuth?.session).toBeNull();
    expect(latestAuth?.error).toMatchObject({
      code: "network_unavailable",
      retryable: true
    });

    await act(async () => {
      await expect(latestAuth!.retryBootstrap()).resolves.toBe(true);
    });
    expect(latestAuth?.bootstrapState).toBe("ready");
    expect(latestAuth?.session).toEqual(restoredSession);
    expect(latestAuth?.error).toBeNull();
    expect(gateway.currentSession).toHaveBeenCalledTimes(2);
    await screen.unmount();
  });

  it("holds and consumes a signed recovery grant before one password update", async () => {
    const gateway = gatewayWithSession(null);
    gateway.exchangePasswordRecoveryCode = jest.fn(async () => ({
      ok: true as const,
      value: {
        session: restoredSession,
        grant: {
          id: "password-recovery-1",
          grantedAt: "2026-07-27T10:00:00.000Z"
        }
      }
    }));
    gateway.updatePassword = jest.fn(async () => ({
      ok: true as const,
      value: undefined
    }));
    const screen = await render(
      <AuthFlowProvider gateway={gateway}>
        <Probe />
      </AuthFlowProvider>
    );
    await waitFor(() => expect(latestAuth?.bootstrapState).toBe("ready"));

    await act(async () => {
      await expect(
        latestAuth!.exchangePasswordRecoveryCode("recovery-pkce-code")
      ).resolves.toEqual(restoredSession);
    });
    expect(latestAuth?.passwordRecoveryGrant).toEqual({
      id: "password-recovery-1",
      grantedAt: "2026-07-27T10:00:00.000Z"
    });
    expect(latestAuth?.passwordRecoverySessionActive).toBe(true);

    await act(async () => {
      await expect(
        latestAuth!.updatePassword("new private password")
      ).resolves.toBe(true);
    });
    expect(latestAuth?.passwordRecoveryGrant).toBeNull();
    expect(latestAuth?.passwordRecoverySessionActive).toBe(true);
    await act(async () => {
      await expect(
        latestAuth!.updatePassword("second private password")
      ).resolves.toBe(false);
    });
    expect(gateway.updatePassword).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });

  it("revokes the UI recovery grant but stays signed in when cancellation fails", async () => {
    const gateway = gatewayWithSession(null);
    gateway.exchangePasswordRecoveryCode = jest.fn(async () => ({
      ok: true as const,
      value: {
        session: restoredSession,
        grant: {
          id: "password-recovery-1",
          grantedAt: "2026-07-27T10:00:00.000Z"
        }
      }
    }));
    gateway.cancelPasswordRecovery = jest.fn(async () => ({
      ok: false as const,
      error: {
        code: "network_unavailable" as const,
        message: "The provider did not confirm sign-out.",
        retryable: true
      }
    }));
    const screen = await render(
      <AuthFlowProvider gateway={gateway}>
        <Probe />
      </AuthFlowProvider>
    );
    await waitFor(() => expect(latestAuth?.bootstrapState).toBe("ready"));
    await act(async () => {
      await latestAuth!.exchangePasswordRecoveryCode(
        "recovery-pkce-code"
      );
    });

    await act(async () => {
      await expect(
        latestAuth!.cancelPasswordRecovery()
      ).resolves.toBe(false);
    });
    expect(latestAuth?.session).toEqual(restoredSession);
    expect(latestAuth?.passwordRecoveryGrant).toBeNull();
    expect(latestAuth?.passwordRecoverySessionActive).toBe(true);
    expect(latestAuth?.error).toMatchObject({
      code: "network_unavailable"
    });
    await screen.unmount();
  });

  it("provisions and durably completes a signed household before opening data routes", async () => {
    const householdId = "00000000-0000-4000-8000-000000000010";
    const membershipId =
      "00000000-0000-4000-8000-000000000011";
    const requiredSession: AuthSessionDescriptor = {
      ...restoredSession,
      onboarding: "required",
      activeHouseholdId: null,
      activeMembershipId: null,
      activeHouseholdRole: null
    };
    const selectedSession: AuthSessionDescriptor = {
      ...requiredSession,
      activeHouseholdId: householdId,
      activeMembershipId: membershipId,
      activeHouseholdRole: "owner"
    };
    const completedSession: AuthSessionDescriptor = {
      ...selectedSession,
      onboarding: "complete"
    };
    const gateway = gatewayWithSession(requiredSession);
    gateway.refreshSession = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        value: selectedSession
      })
      .mockResolvedValueOnce({
        ok: true,
        value: completedSession
      });
    const householdAccess: HouseholdAccessPort = {
      ...householdAdministrationStubs(),
      createHousehold: jest.fn(async () => ({
        ok: true as const,
        value: {
          householdId,
          name: "Rahman household",
          version: 1,
          createdAt: "2026-07-27T12:00:00.000Z"
        }
      })),
      completeOnboarding: jest.fn(async () => ({
        ok: true as const,
        value: { householdId, onboarding: "complete" as const }
      })),
      createInvite: jest.fn(),
      acceptInvite: jest.fn()
    };
    const screen = await render(
      <AuthFlowProvider
        gateway={gateway}
        householdAccess={householdAccess}
      >
        <Probe />
      </AuthFlowProvider>
    );
    await waitFor(() => expect(latestAuth?.bootstrapState).toBe("ready"));

    await act(async () => {
      await expect(
        latestAuth!.provisionHousehold("Rahman household")
      ).resolves.toBe(householdId);
    });
    expect(latestAuth?.activeHouseholdId).toBe(householdId);
    expect(latestAuth?.session?.onboarding).toBe("required");

    await act(async () => {
      await expect(latestAuth!.completeOnboarding()).resolves.toBe(true);
    });
    expect(latestAuth?.session).toEqual(completedSession);
    expect(householdAccess.createHousehold).toHaveBeenCalledWith(
      "Rahman household"
    );
    expect(
      householdAccess.completeOnboarding
    ).toHaveBeenCalledWith(householdId);
    expect(gateway.refreshSession).toHaveBeenCalledTimes(2);
    await screen.unmount();
  });

  it("keeps household setup recoverable until the provider returns the full owner tuple", async () => {
    const householdId = "00000000-0000-4000-8000-000000000012";
    const membershipId =
      "00000000-0000-4000-8000-000000000013";
    const requiredSession: AuthSessionDescriptor = {
      ...restoredSession,
      onboarding: "required",
      activeHouseholdId: null,
      activeMembershipId: null,
      activeHouseholdRole: null
    };
    const delayedSession: AuthSessionDescriptor = {
      ...requiredSession,
      activeHouseholdId: householdId
    };
    const readySession: AuthSessionDescriptor = {
      ...delayedSession,
      activeMembershipId: membershipId,
      activeHouseholdRole: "owner"
    };
    const gateway = gatewayWithSession(requiredSession);
    gateway.refreshSession = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        value: delayedSession
      })
      .mockResolvedValueOnce({
        ok: true,
        value: readySession
      });
    const householdAccess: HouseholdAccessPort = {
      ...householdAdministrationStubs(),
      createHousehold: jest.fn(async () => ({
        ok: true as const,
        value: {
          householdId,
          name: "Rahman household",
          version: 1,
          createdAt: "2026-07-27T12:00:00.000Z"
        }
      })),
      completeOnboarding: jest.fn(),
      createInvite: jest.fn(),
      acceptInvite: jest.fn()
    };
    const screen = await render(
      <AuthFlowProvider
        gateway={gateway}
        householdAccess={householdAccess}
      >
        <Probe />
      </AuthFlowProvider>
    );
    await waitFor(() => expect(latestAuth?.bootstrapState).toBe("ready"));

    await act(async () => {
      await expect(
        latestAuth!.provisionHousehold("Rahman household")
      ).resolves.toBeNull();
    });
    expect(latestAuth?.session).toEqual(delayedSession);
    expect(latestAuth?.error).toMatchObject({
      code: "session_missing",
      retryable: true
    });

    await act(async () => {
      await expect(
        latestAuth!.provisionHousehold("Rahman household")
      ).resolves.toBe(householdId);
    });
    expect(latestAuth?.session).toEqual(readySession);
    expect(householdAccess.createHousehold).toHaveBeenCalledTimes(1);
    expect(gateway.refreshSession).toHaveBeenCalledTimes(2);
    await screen.unmount();
  });

  it("creates an invitation only from the provider-authoritative owner role", async () => {
    const createInvite = jest.fn(async () => ({
      ok: true as const,
      value: {
        inviteId: "00000000-0000-4000-8000-000000000020",
        oneTimeCode: "ABCD1234",
        role: "viewer" as const,
        expiresAt: "2026-07-30T12:00:00.000Z"
      }
    }));
    const householdAccess: HouseholdAccessPort = {
      ...householdAdministrationStubs(),
      createHousehold: jest.fn(),
      completeOnboarding: jest.fn(),
      createInvite,
      acceptInvite: jest.fn()
    };
    const screen = await render(
      <AuthFlowProvider
        gateway={gatewayWithSession(restoredSession)}
        householdAccess={householdAccess}
      >
        <Probe />
      </AuthFlowProvider>
    );
    await waitFor(() => expect(latestAuth?.bootstrapState).toBe("ready"));

    await act(async () => {
      await expect(
        latestAuth!.createHouseholdInvite("viewer", 72)
      ).resolves.toMatchObject({
        oneTimeCode: "ABCD1234",
        role: "viewer"
      });
    });
    expect(createInvite).toHaveBeenCalledWith({
      householdId: "household-a",
      role: "viewer",
      expiresInHours: 72
    });
    await screen.unmount();
  });

  it("accepts an invitation only after the refreshed provider tuple matches", async () => {
    const recipientSession: AuthSessionDescriptor = {
      ...restoredSession,
      identity: {
        id: "account-recipient",
        email: "recipient@example.com",
        emailVerified: true
      },
      onboarding: "required",
      activeHouseholdId: null,
      activeMembershipId: null,
      activeHouseholdRole: null
    };
    const joinedSession: AuthSessionDescriptor = {
      ...recipientSession,
      onboarding: "complete",
      activeHouseholdId: "household-joined",
      activeMembershipId: "membership-joined",
      activeHouseholdRole: "editor"
    };
    const gateway = gatewayWithSession(recipientSession);
    gateway.refreshSession = jest.fn(async () => ({
      ok: true as const,
      value: joinedSession
    }));
    const acceptInvite = jest.fn(async () => ({
      ok: true as const,
      value: {
        membershipId: "membership-joined",
        householdId: "household-joined",
        accountId: "account-recipient",
        role: "editor" as const,
        status: "active" as const,
        version: 1
      }
    }));
    const householdAccess: HouseholdAccessPort = {
      ...householdAdministrationStubs(),
      createHousehold: jest.fn(),
      completeOnboarding: jest.fn(),
      createInvite: jest.fn(),
      acceptInvite
    };
    const screen = await render(
      <AuthFlowProvider
        gateway={gateway}
        householdAccess={householdAccess}
      >
        <Probe />
      </AuthFlowProvider>
    );
    await waitFor(() => expect(latestAuth?.bootstrapState).toBe("ready"));

    await act(async () => {
      await expect(
        latestAuth!.acceptHouseholdInvite(" abcd1234 ")
      ).resolves.toMatchObject({
        membershipId: "membership-joined",
        role: "editor"
      });
    });
    expect(acceptInvite).toHaveBeenCalledWith("ABCD1234");
    expect(latestAuth?.session).toEqual(joinedSession);
    await screen.unmount();
  });

  it("refreshes the authoritative roster and applies versioned owner changes", async () => {
    const snapshot: HouseholdAccessSnapshot = {
      householdId: "household-a",
      householdName: "Rahman household",
      householdVersion: 1,
      currentMembershipId: "membership-a",
      currentAccountId: "account-owner",
      currentRole: "owner",
      members: [
        {
          membershipId: "membership-a",
          householdId: "household-a",
          accountId: "account-owner",
          displayName: "Amina Owner",
          email: "owner@example.com",
          role: "owner",
          status: "active",
          version: 2,
          joinedAt: "2026-07-20T12:00:00.000Z",
          isCurrentUser: true
        },
        {
          membershipId: "membership-editor",
          householdId: "household-a",
          accountId: "account-editor",
          displayName: "Omar Editor",
          email: "editor@example.com",
          role: "editor",
          status: "active",
          version: 3,
          joinedAt: "2026-07-21T12:00:00.000Z",
          isCurrentUser: false
        }
      ],
      pendingInvites: [],
      refreshedAt: "2026-07-27T12:00:00.000Z"
    };
    const updated: HouseholdAccessSnapshot = {
      ...snapshot,
      members: snapshot.members.map((member) =>
        member.membershipId === "membership-editor"
          ? { ...member, role: "viewer" as const, version: 4 }
          : member
      ),
      refreshedAt: "2026-07-27T12:01:00.000Z"
    };
    const getAccessSnapshot = jest.fn(async () => ({
      ok: true as const,
      value: snapshot
    }));
    const changeMemberRole = jest.fn(
      async (
        input: Parameters<HouseholdAccessPort["changeMemberRole"]>[0]
      ) => ({
        ok: true as const,
        value: {
          receipt: {
            operationId: input.operationId,
            kind: "membership.role_changed" as const
          },
          snapshot: updated
        }
      })
    );
    const householdAccess: HouseholdAccessPort = {
      ...householdAdministrationStubs(),
      createHousehold: jest.fn(),
      completeOnboarding: jest.fn(),
      createInvite: jest.fn(),
      acceptInvite: jest.fn(),
      getAccessSnapshot,
      changeMemberRole
    };
    const screen = await render(
      <AuthFlowProvider
        gateway={gatewayWithSession(restoredSession)}
        householdAccess={householdAccess}
        operationIdFactory={() =>
          "00000000-0000-4000-8000-000000000099"
        }
      >
        <Probe />
      </AuthFlowProvider>
    );

    await waitFor(() =>
      expect(latestAuth?.householdAccessStatus).toBe("ready")
    );
    expect(latestAuth?.householdAccessSnapshot).toEqual(snapshot);

    await act(async () => {
      await expect(
        latestAuth!.changeHouseholdMemberRole(
          "membership-editor",
          3,
          "viewer"
        )
      ).resolves.toBe(true);
    });
    expect(changeMemberRole).toHaveBeenCalledWith({
      householdId: "household-a",
      membershipId: "membership-editor",
      expectedVersion: 3,
      role: "viewer",
      operationId: expect.stringMatching(
        /^00000000-0000-4000-8000-000000000099$/u
      )
    });
    expect(
      latestAuth?.householdAccessSnapshot?.members[1]
    ).toMatchObject({ role: "viewer", version: 4 });
    await screen.unmount();
  });
});
