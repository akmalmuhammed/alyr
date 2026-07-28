import type {
  AccountAuthGateway,
  AuthSessionDescriptor
} from "@/auth/types";
import {
  createHeadlessBackgroundSyncTask,
  resolveHeadlessBackgroundSyncState,
  resolveHeadlessRegistrationDisposition,
  type HeadlessBackgroundSyncDependencies
} from "@/background/headlessBackgroundSync";

const VALID_SESSION: AuthSessionDescriptor = {
  identity: {
    id: "account-headless-fixture",
    email: "owner@example.test",
    emailVerified: true
  },
  assurance: "verified-email",
  expiresAt: "2099-07-28T12:00:00.000Z",
  onboarding: "complete",
  activeHouseholdId: "household-headless-fixture",
  activeMembershipId: "membership-headless-fixture",
  activeHouseholdRole: "owner"
};

type CurrentSessionResult = Awaited<
  ReturnType<AccountAuthGateway["currentSession"]>
>;

function gateway(
  result: CurrentSessionResult,
  mode: AccountAuthGateway["mode"] = "supabase"
): AccountAuthGateway {
  return {
    mode,
    currentSession: async () => result
  } as AccountAuthGateway;
}

function dependencies(
  options: Partial<HeadlessBackgroundSyncDependencies> = {}
): HeadlessBackgroundSyncDependencies {
  return {
    profile: () => "native-secure",
    authGateway: () =>
      gateway({ ok: true, value: VALID_SESSION }),
    providersReady: () => true,
    nowMs: () => Date.parse("2026-07-28T12:00:00.000Z"),
    ...options
  };
}

describe("device-auth-bound headless background policy", () => {
  it.each(["expo-go-preview", "web-preview", "test"] as const)(
    "never inspects persisted identity in the %s runtime",
    async (profile) => {
      const authGateway = jest.fn(() => {
        throw new Error("preview identity must stay unreachable");
      });
      const providersReady = jest.fn(() => true);

      await expect(
        resolveHeadlessBackgroundSyncState(
          dependencies({
            profile: () => profile,
            authGateway,
            providersReady
          })
        )
      ).resolves.toEqual({ kind: "signed-out" });

      expect(authGateway).not.toHaveBeenCalled();
      expect(providersReady).not.toHaveBeenCalled();
    }
  );

  it("requires the configured user-scoped Supabase gateway", async () => {
    await expect(
      resolveHeadlessBackgroundSyncState(
        dependencies({
          authGateway: () =>
            gateway({ ok: true, value: VALID_SESSION }, "unavailable")
        })
      )
    ).resolves.toEqual({ kind: "provider-missing" });
  });

  it("reports signed-out for an absent or incomplete persisted session", async () => {
    await expect(
      resolveHeadlessBackgroundSyncState(
        dependencies({
          authGateway: () => gateway({ ok: true, value: null })
        })
      )
    ).resolves.toEqual({ kind: "signed-out" });

    await expect(
      resolveHeadlessBackgroundSyncState(
        dependencies({
          authGateway: () =>
            gateway({
              ok: true,
              value: {
                ...VALID_SESSION,
                onboarding: "required",
                activeHouseholdId: null,
                activeMembershipId: null,
                activeHouseholdRole: null
              }
            })
        })
      )
    ).resolves.toEqual({ kind: "signed-out" });
  });

  it("rejects an expired persisted session before inspecting cloud ports", async () => {
    const providersReady = jest.fn(() => true);
    await expect(
      resolveHeadlessBackgroundSyncState(
        dependencies({
          authGateway: () =>
            gateway({
              ok: true,
              value: {
                ...VALID_SESSION,
                expiresAt: "2026-07-28T11:59:59.000Z"
              }
            }),
          providersReady
        })
      )
    ).resolves.toEqual({ kind: "signed-out" });
    expect(providersReady).not.toHaveBeenCalled();
  });

  it("reports provider-missing when session or signed transport resolution fails", async () => {
    await expect(
      resolveHeadlessBackgroundSyncState(
        dependencies({
          authGateway: () =>
            gateway({
              ok: false,
              error: {
                code: "network_unavailable",
                message: "fixture",
                retryable: true
              }
            })
        })
      )
    ).resolves.toEqual({ kind: "provider-missing" });

    await expect(
      resolveHeadlessBackgroundSyncState(
        dependencies({ providersReady: () => false })
      )
    ).resolves.toEqual({ kind: "provider-missing" });
  });

  it("keeps a fully configured verified household vault locked without an interactive grant", async () => {
    await expect(
      resolveHeadlessBackgroundSyncState(dependencies())
    ).resolves.toEqual({ kind: "vault-locked" });
    await expect(
      resolveHeadlessRegistrationDisposition(dependencies())
    ).resolves.toEqual({
      kind: "foreground-only",
      reason: "device-unlock-required"
    });
  });

  it("returns the explicit privacy-safe skip state from the module task", async () => {
    const task = createHeadlessBackgroundSyncTask(dependencies());

    await expect(task()).resolves.toEqual({
      kind: "skipped",
      reason: "vault-locked",
      metadataOperationsAttempted: 0,
      evidenceTransfersAttempted: 0
    });
  });
});
