import { act, render, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  CryptoEncoding: { HEX: "hex" },
  digestStringAsync: jest.fn(async () => "a".repeat(64)),
  randomUUID: jest.fn(
    () => "90000000-0000-4000-8000-000000000001"
  ),
  getRandomBytes: jest.fn(
    (length: number) => new Uint8Array(length).fill(9)
  )
}));

import type {
  SyncCursor,
  SyncOperation,
  SyncTransport
} from "@alyr/contracts";

import { MemoryPreviewAttachmentStore } from "@/data/attachmentStore";
import type { InstallationDeviceIdentity } from "@/data/installationDeviceIdentity";
import { MemoryWorkspaceRepository } from "@/data/memoryRepository";
import { deriveAuthenticatedVaultScope } from "@/data/vaultScope";
import { createWorkspace } from "@/domain/sample";
import {
  WorkspaceProvider,
  useWorkspace
} from "@/state/WorkspaceProvider";

const ACCOUNT_ID = "account-stable-device";
const HOUSEHOLD_ID = "30000000-0000-4000-8000-000000000001";
const MEMBERSHIP_ID = "30000000-0000-4000-8000-000000000002";
const INSTALLATION_ID = "30000000-0000-4000-8000-000000000003";
const OLD_WORKSPACE_DEVICE_ID =
  "30000000-0000-4000-8000-000000000004";
const NOW = "2026-07-27T12:00:00.000Z";

let latest: ReturnType<typeof useWorkspace> | null = null;

function Probe() {
  latest = useWorkspace();
  return <Text>{latest.bootstrap.status}</Text>;
}

class RetryBootstrapTransport implements SyncTransport {
  pullCalls = 0;

  async push(operations: readonly SyncOperation[]) {
    return {
      ok: true as const,
      value: {
        acknowledgedOperationIds: operations.map(
          (operation) => operation.operationId
        ),
        conflicts: [],
        cursor: this.cursor()
      }
    };
  }

  async pull(
    _householdId: string,
    _cursor: SyncCursor
  ): ReturnType<SyncTransport["pull"]> {
    this.pullCalls += 1;
    if (this.pullCalls === 1) {
      return {
        ok: false,
        error: {
          errorVersion: 1,
          code: "OFFLINE",
          message: "The first restore attempt is offline.",
          retryable: true
        }
      };
    }
    return {
      ok: true,
      value: {
        workspace: {
          householdId: HOUSEHOLD_ID,
          householdName: "Stable device household",
          householdVersion: 1,
          householdCreatedAt: NOW,
          membershipId: MEMBERSHIP_ID,
          accountId: ACCOUNT_ID,
          role: "owner",
          membershipVersion: 1
        },
        changes: [],
        cursor: this.cursor()
      }
    };
  }

  private cursor(): SyncCursor {
    return {
      cursorVersion: 1,
      value: "0",
      issuedAt: NOW
    };
  }
}

function fixedInstallationIdentity(
  getOrCreate = jest.fn(async () => INSTALLATION_ID)
): InstallationDeviceIdentity {
  return {
    scope: "installation",
    getOrCreate
  };
}

describe("WorkspaceProvider stable installation identity", () => {
  beforeEach(() => {
    latest = null;
  });

  it("reuses one identity when a clean-device restore is retried", async () => {
    const scope = await deriveAuthenticatedVaultScope(
      ACCOUNT_ID,
      HOUSEHOLD_ID
    );
    const repository = new MemoryWorkspaceRepository(scope);
    const transport = new RetryBootstrapTransport();
    const getOrCreate = jest.fn(async () => INSTALLATION_ID);
    const screen = await render(
      <WorkspaceProvider
        repositoryOverride={repository}
        attachmentStoreOverride={
          new MemoryPreviewAttachmentStore(scope)
        }
        vaultAccess={{
          kind: "authenticated",
          accountId: ACCOUNT_ID,
          householdId: HOUSEHOLD_ID,
          role: "owner"
        }}
        syncTransport={transport}
        installationDeviceIdentity={fixedInstallationIdentity(
          getOrCreate
        )}
      >
        <Probe />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(latest?.bootstrap.status).toBe("retryable-error");
      expect(transport.pullCalls).toBe(1);
    });
    await act(async () => {
      await latest!.retryBootstrap();
    });
    await waitFor(() => {
      expect(latest?.bootstrap.status).toBe("ready");
      expect(latest?.workspace?.deviceId).toBe(INSTALLATION_ID);
    });

    expect(getOrCreate).toHaveBeenCalledTimes(1);
    expect(transport.pullCalls).toBe(2);
    expect((await repository.load()).snapshot).toMatchObject({
      deviceId: INSTALLATION_ID
    });
    await screen.unmount();
  });

  it("rebinds a pre-identity signed workspace before exposing it", async () => {
    const scope = await deriveAuthenticatedVaultScope(
      ACCOUNT_ID,
      HOUSEHOLD_ID
    );
    const repository = new MemoryWorkspaceRepository(scope);
    await repository.initialize();
    await repository.commit({
      expectedRevision: 0,
      nextRevision: 1,
      snapshot: createWorkspace("personal", NOW, {
        householdId: HOUSEHOLD_ID,
        ownerMemberId: MEMBERSHIP_ID,
        deviceId: OLD_WORKSPACE_DEVICE_ID
      }),
      operations: []
    });
    const screen = await render(
      <WorkspaceProvider
        repositoryOverride={repository}
        attachmentStoreOverride={
          new MemoryPreviewAttachmentStore(scope)
        }
        vaultAccess={{
          kind: "authenticated",
          accountId: ACCOUNT_ID,
          householdId: HOUSEHOLD_ID,
          role: "owner"
        }}
        installationDeviceIdentity={fixedInstallationIdentity()}
      >
        <Probe />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(latest?.bootstrap.status).toBe("ready");
      expect(latest?.workspace?.deviceId).toBe(INSTALLATION_ID);
    });
    const rebound = await repository.load();
    expect(rebound.revision).toBe(2);
    expect(rebound.snapshot).toMatchObject({
      deviceId: INSTALLATION_ID
    });
    await screen.unmount();
  });
});
