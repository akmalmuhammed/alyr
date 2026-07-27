import { act, render, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

import {
  AuthFlowProvider,
  useAuthFlow
} from "@/auth/AuthFlowProvider";
import {
  createPendingHouseholdInviteStore,
  type PendingHouseholdInviteStore
} from "@/auth/pendingHouseholdInvite";
import type {
  AccountAuthGateway,
  AuthSessionDescriptor
} from "@/auth/types";
import type {
  HouseholdAccessPort,
  HouseholdMembership
} from "@alyr/contracts";

const recipientSession: AuthSessionDescriptor = {
  identity: {
    id: "account-recipient",
    email: "recipient@example.com",
    emailVerified: true
  },
  assurance: "verified-email",
  expiresAt: "2026-08-01T00:00:00.000Z",
  onboarding: "required",
  activeHouseholdId: null,
  activeMembershipId: null,
  activeHouseholdRole: null
};

const joinedSession: AuthSessionDescriptor = {
  ...recipientSession,
  onboarding: "complete",
  activeHouseholdId: "household-invited",
  activeMembershipId: "membership-recipient",
  activeHouseholdRole: "viewer"
};

const membership: HouseholdMembership = {
  membershipId: "membership-recipient",
  householdId: "household-invited",
  accountId: "account-recipient",
  role: "viewer",
  status: "active",
  version: 1
};

function inviteStore(initial: string | null = null): {
  readonly store: PendingHouseholdInviteStore;
  readonly values: Map<string, string>;
  readonly removeItem: jest.Mock;
} {
  const values = new Map<string, string>();
  if (initial) {
    values.set("alyr.pending-household-invite.v1", initial);
  }
  const removeItem = jest.fn(async (key: string) => {
    values.delete(key);
  });
  return {
    values,
    removeItem,
    store: createPendingHouseholdInviteStore({
      async getItem(key) {
        return values.get(key) ?? null;
      },
      async setItem(key, value) {
        values.set(key, value);
      },
      removeItem
    })
  };
}

function signedGateway(
  initialSession: AuthSessionDescriptor | null = null
): AccountAuthGateway {
  const unsupported = {
    ok: false as const,
    error: {
      code: "unsupported" as const,
      message: "Not used in this test.",
      retryable: false
    }
  };
  return {
    mode: "supabase",
    currentSession: jest.fn(async () => ({
      ok: true as const,
      value: initialSession
    })),
    refreshSession: jest.fn(async () => ({
      ok: true as const,
      value: joinedSession
    })),
    currentAccessToken: jest.fn(async () => ({
      ok: true as const,
      value: "recipient-access-token"
    })),
    onSessionChanged: jest.fn(() => () => undefined),
    signUp: jest.fn(async (credentials) => ({
      ok: true as const,
      value: {
        kind: "confirmation-required" as const,
        identity: {
          ...recipientSession.identity,
          email: credentials.email,
          emailVerified: false
        },
        confirmation: {
          destination: credentials.email,
          requestedAt: "2026-07-28T08:00:00.000Z",
          delivery: "requested" as const
        }
      }
    })),
    signIn: jest.fn(async () => ({
      ok: true as const,
      value: {
        kind: "authenticated" as const,
        session: recipientSession
      }
    })),
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
      value: recipientSession
    })),
    beginPreviewSession: jest.fn(async () => unsupported),
    signOut: jest.fn(async () => ({
      ok: true as const,
      value: undefined
    }))
  };
}

function householdAccess(
  acceptInvite: HouseholdAccessPort["acceptInvite"]
): HouseholdAccessPort {
  const unsupported = jest.fn();
  const offlineSnapshot = jest.fn(async () => ({
    ok: false as const,
    error: {
      errorVersion: 1 as const,
      code: "OFFLINE" as const,
      message: "Roster unavailable in this focused test.",
      retryable: true
    }
  }));
  return {
    createHousehold: unsupported,
    completeOnboarding: unsupported,
    createInvite: unsupported,
    acceptInvite,
    getAccessSnapshot: offlineSnapshot,
    changeMemberRole: unsupported,
    revokeMember: unsupported,
    cancelInvite: unsupported,
    transferOwnership: unsupported
  };
}

let flow: ReturnType<typeof useAuthFlow> | null = null;

function Probe() {
  flow = useAuthFlow();
  return (
    <Text testID="recipient-flow">
      {flow.bootstrapState}:{flow.session?.identity.id ?? "signed-out"}:
      {flow.pendingHouseholdInvite ? "invite" : "none"}
    </Text>
  );
}

describe("recipient household invitation continuity", () => {
  beforeEach(() => {
    flow = null;
    jest.clearAllMocks();
  });

  it("preserves a signed-out invitation through new-account email confirmation and consumes it only after membership is authoritative", async () => {
    const storage = inviteStore();
    const gateway = signedGateway();
    const acceptInvite = jest.fn(async () => ({
      ok: true as const,
      value: membership
    }));
    const screen = await render(
      <AuthFlowProvider
        gateway={gateway}
        householdAccess={householdAccess(acceptInvite)}
        pendingInviteStore={storage.store}
      >
        <Probe />
      </AuthFlowProvider>
    );
    await waitFor(() => expect(flow?.bootstrapState).toBe("ready"));

    await act(async () => {
      await expect(
        flow!.stageHouseholdInvite("  invite-recipient-01  ")
      ).resolves.toBe(true);
    });
    expect(flow?.pendingHouseholdInvite?.oneTimeCode).toBe(
      "INVITE-RECIPIENT-01"
    );

    await act(async () => {
      await expect(
        flow!.createAccount(
          "recipient@example.com",
          "correct horse battery staple"
        )
      ).resolves.toMatchObject({ kind: "confirmation-required" });
    });
    expect(gateway.signUp).toHaveBeenCalledWith({
      email: "recipient@example.com",
      password: "correct horse battery staple",
      householdInviteCode: "INVITE-RECIPIENT-01"
    });
    expect(flow?.pendingHouseholdInvite).not.toBeNull();

    await act(async () => {
      await expect(
        flow!.exchangeConfirmationCode("provider-code")
      ).resolves.toEqual(recipientSession);
      await expect(
        flow!.acceptPendingHouseholdInvite()
      ).resolves.toEqual(membership);
    });

    expect(acceptInvite).toHaveBeenCalledWith(
      "INVITE-RECIPIENT-01"
    );
    expect(flow?.session).toEqual(joinedSession);
    expect(flow?.pendingHouseholdInvite).toBeNull();
    expect(storage.values.size).toBe(0);
    await screen.unmount();
  });

  it("lets an existing account sign in and accept immediately without a stale-state race", async () => {
    const storage = inviteStore();
    const gateway = signedGateway();
    const acceptInvite = jest.fn(async () => ({
      ok: true as const,
      value: membership
    }));
    const screen = await render(
      <AuthFlowProvider
        gateway={gateway}
        householdAccess={householdAccess(acceptInvite)}
        pendingInviteStore={storage.store}
      >
        <Probe />
      </AuthFlowProvider>
    );
    await waitFor(() => expect(flow?.bootstrapState).toBe("ready"));

    await act(async () => {
      await flow!.stageHouseholdInvite("EXISTING-ACCOUNT-CODE");
      await flow!.signIn(
        "recipient@example.com",
        "correct horse battery staple"
      );
      await expect(
        flow!.acceptPendingHouseholdInvite()
      ).resolves.toEqual(membership);
    });

    expect(acceptInvite).toHaveBeenCalledWith(
      "EXISTING-ACCOUNT-CODE"
    );
    expect(flow?.session).toEqual(joinedSession);
    expect(storage.values.size).toBe(0);
    await screen.unmount();
  });

  it("clears an expired or invalid invitation without exposing it to the next account", async () => {
    const storage = inviteStore();
    const gateway = signedGateway(recipientSession);
    const acceptInvite = jest.fn(async () => ({
      ok: false as const,
      error: {
        errorVersion: 1 as const,
        code: "NOT_FOUND" as const,
        message: "This invitation is invalid or has expired.",
        retryable: false
      }
    }));
    const screen = await render(
      <AuthFlowProvider
        gateway={gateway}
        householdAccess={householdAccess(acceptInvite)}
        pendingInviteStore={storage.store}
      >
        <Probe />
      </AuthFlowProvider>
    );
    await waitFor(() => expect(flow?.bootstrapState).toBe("ready"));

    await act(async () => {
      await flow!.stageHouseholdInvite("EXPIRED-CODE");
      await expect(
        flow!.acceptPendingHouseholdInvite()
      ).resolves.toBeNull();
    });

    expect(flow?.error).toMatchObject({
      code: "invalid_request",
      retryable: false
    });
    expect(flow?.pendingHouseholdInvite).toBeNull();
    expect(storage.values.size).toBe(0);
    await screen.unmount();
  });

  it("removes a pending bearer on sign-out so it never crosses account boundaries", async () => {
    const storage = inviteStore();
    const gateway = signedGateway(recipientSession);
    const screen = await render(
      <AuthFlowProvider
        gateway={gateway}
        householdAccess={householdAccess(jest.fn())}
        pendingInviteStore={storage.store}
      >
        <Probe />
      </AuthFlowProvider>
    );
    await waitFor(() => expect(flow?.bootstrapState).toBe("ready"));
    await act(async () => {
      await flow!.stageHouseholdInvite("PRIVATE-BEARER");
      await expect(flow!.signOut()).resolves.toBe(true);
    });

    expect(flow?.pendingHouseholdInvite).toBeNull();
    expect(flow?.session).toBeNull();
    expect(storage.values.size).toBe(0);
    expect(storage.removeItem).toHaveBeenCalled();
    await screen.unmount();
  });
});
