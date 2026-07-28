jest.mock("expo-crypto", () => {
  let id = 700;
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    CryptoEncoding: { HEX: "hex" },
    digestStringAsync: jest.fn(
      async () => "a".repeat(64)
    ),
    randomUUID: jest.fn(
      () =>
        `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`
    ),
    getRandomBytes: jest.fn(
      (length: number) => new Uint8Array(length).fill(7)
    )
  };
});

import { act, render, waitFor } from "@testing-library/react-native";
import {
  AppState,
  Text,
  type AppStateStatus
} from "react-native";

import type {
  SyncChange,
  SyncCursor,
  SyncOperation,
  SyncTransport
} from "@alyr/contracts";

import { MemoryPreviewAttachmentStore } from "@/data/attachmentStore";
import { MemoryWorkspaceRepository } from "@/data/memoryRepository";
import { deriveAuthenticatedVaultScope } from "@/data/vaultScope";
import { runVaultOperationExclusive } from "@/data/vaultOperationGate";
import { createWorkspace } from "@/domain/sample";
import {
  WorkspaceProvider,
  useWorkspace
} from "@/state/WorkspaceProvider";

const HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000801";
const NOW = "2026-07-27T12:00:00.000Z";

let latest: ReturnType<typeof useWorkspace> | null = null;

function Probe() {
  latest = useWorkspace();
  return (
    <Text testID="sync-state">
      {latest.sync.status}:{latest.pendingOperationCount}
    </Text>
  );
}

class ProviderTestTransport implements SyncTransport {
  readonly changes: SyncChange[] = [];
  readonly seen = new Set<string>();
  pushCalls = 0;
  pullCalls = 0;
  failNextPull = false;
  denyAccess = false;

  async push(operations: readonly SyncOperation[]) {
    this.pushCalls += 1;
    for (const operation of operations) {
      if (this.seen.has(operation.operationId)) continue;
      this.seen.add(operation.operationId);
      this.changes.push({
        sequence: this.changes.length + 1,
        entityType: operation.command.type.split(".", 1)[0]!,
        entityId: operation.command.aggregateId!,
        householdId: operation.householdId,
        version: 1,
        tombstoned: false,
        body: {
          operationId: operation.operationId,
          command: operation.command.type,
          payload: operation.command.payload,
          result: {}
        },
        changedAt: operation.command.occurredAt
      });
    }
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
    cursor: SyncCursor
  ): ReturnType<SyncTransport["pull"]> {
    this.pullCalls += 1;
    if (this.failNextPull) {
      this.failNextPull = false;
      return {
        ok: false,
        error: {
          errorVersion: 1,
          code: "OFFLINE",
          message: "The test transport is offline.",
          retryable: true
        }
      };
    }
    if (this.denyAccess) {
      return {
        ok: false,
        error: {
          errorVersion: 1,
          code: "AUTHORIZATION_DENIED",
          message: "You no longer have access to this household.",
          retryable: false
        }
      };
    }
    const sequence = Number(cursor.value ?? "0");
    const changes = this.changes.filter(
      (change) => change.sequence > sequence
    );
    return {
      ok: true as const,
      value: {
        workspace: {
          householdId: HOUSEHOLD_ID,
          householdName: "Provider household",
          householdVersion: 1,
          householdCreatedAt: NOW,
          membershipId:
            "00000000-0000-4000-8000-000000000804",
          accountId: "account-provider-test",
          role: "owner" as const,
          membershipVersion: 1
        },
        changes,
        cursor: {
          cursorVersion: 1 as const,
          value: String(
            changes.at(-1)?.sequence ?? sequence
          ),
          issuedAt: NOW
        }
      }
    };
  }

  private cursor(): SyncCursor {
    return {
      cursorVersion: 1,
      value: String(this.changes.length),
      issuedAt: NOW
    };
  }
}

describe("WorkspaceProvider foreground sync lifecycle", () => {
  beforeEach(() => {
    latest = null;
  });

  it("reconciles on startup and again after a non-blocking local mutation", async () => {
    let foregroundListener:
      | ((state: AppStateStatus) => void)
      | null = null;
    const appStateSpy = jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_type, listener) => {
        foregroundListener = listener;
        return { remove: jest.fn() };
      });
    const scope = await deriveAuthenticatedVaultScope(
      "account-provider-test",
      HOUSEHOLD_ID
    );
    const repository = new MemoryWorkspaceRepository(scope);
    await repository.initialize();
    const workspace = createWorkspace("personal", NOW, {
      householdId: HOUSEHOLD_ID,
      ownerMemberId:
        "00000000-0000-4000-8000-000000000802",
      deviceId: "00000000-0000-4000-8000-000000000803"
    });
    await repository.commit({
      expectedRevision: 0,
      nextRevision: 1,
      snapshot: workspace,
      operations: []
    });
    const transport = new ProviderTestTransport();
    const screen = await render(
      <WorkspaceProvider
        repositoryOverride={repository}
        attachmentStoreOverride={
          new MemoryPreviewAttachmentStore(scope)
        }
        vaultAccess={{
          kind: "authenticated",
          accountId: "account-provider-test",
          householdId: HOUSEHOLD_ID,
          role: "owner"
        }}
        syncTransport={transport}
      >
        <Probe />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(latest?.storageReady).toBe(true);
      expect(latest?.sync.status).toBe("idle");
      expect(transport.pullCalls).toBeGreaterThanOrEqual(1);
    });
    const startupPullCount = transport.pullCalls;
    await act(async () => {
      foregroundListener?.("active");
    });
    await waitFor(() => {
      expect(transport.pullCalls).toBeGreaterThan(startupPullCount);
    });

    await act(async () => {
      await latest!.createPlace({
        name: "Doha home",
        addressSummary: "Doha",
        regionLabel: "Doha",
        roomName: null,
        pin: null
      });
    });
    // The mutation resolves at the encrypted local commit boundary; the
    // provider then drains the durable outbox in the background.
    expect(latest?.workspace?.places[0]?.name).toBe("Doha home");

    await waitFor(() => {
      expect(transport.pushCalls).toBe(1);
      expect(latest?.pendingOperationCount).toBe(0);
      expect(latest?.sync.status).toBe("idle");
      expect(latest?.workspace?.lastSyncedAt).toBeTruthy();
    });
    await screen.unmount();
    appStateSpy.mockRestore();
  });

  it("queues manual/AppState sync and attachment persistence behind an active vault operation", async () => {
    let foregroundListener:
      | ((state: AppStateStatus) => void)
      | null = null;
    const appStateSpy = jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_type, listener) => {
        foregroundListener = listener;
        return { remove: jest.fn() };
      });
    const scope = await deriveAuthenticatedVaultScope(
      "account-provider-test",
      HOUSEHOLD_ID
    );
    const repository = new MemoryWorkspaceRepository(scope);
    await repository.initialize();
    const workspace = createWorkspace("personal", NOW, {
      householdId: HOUSEHOLD_ID,
      ownerMemberId:
        "00000000-0000-4000-8000-000000000812",
      deviceId: "00000000-0000-4000-8000-000000000813"
    });
    await repository.commit({
      expectedRevision: 0,
      nextRevision: 1,
      snapshot: workspace,
      operations: []
    });
    const attachmentStore = new MemoryPreviewAttachmentStore(scope);
    const ingest = jest.spyOn(attachmentStore, "ingest");
    const transport = new ProviderTestTransport();
    const screen = await render(
      <WorkspaceProvider
        repositoryOverride={repository}
        attachmentStoreOverride={attachmentStore}
        vaultAccess={{
          kind: "authenticated",
          accountId: "account-provider-test",
          householdId: HOUSEHOLD_ID,
          role: "owner"
        }}
        syncTransport={transport}
      >
        <Probe />
      </WorkspaceProvider>
    );
    await waitFor(() => {
      expect(latest?.storageReady).toBe(true);
      expect(latest?.sync.status).toBe("idle");
    });
    const pullsBeforeGate = transport.pullCalls;
    let releaseGate!: () => void;
    let signalGateStarted!: () => void;
    const gateStarted = new Promise<void>((resolve) => {
      signalGateStarted = resolve;
    });
    const gateRelease = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const activeVaultOperation = runVaultOperationExclusive(async () => {
      signalGateStarted();
      await gateRelease;
    });
    await gateStarted;

    let asset!: ReturnType<NonNullable<typeof latest>["createAsset"]>;
    let manualSync!: ReturnType<NonNullable<typeof latest>["syncNow"]>;
    await act(async () => {
      asset = latest!.createAsset({
        name: "Gate camera",
        categoryId: "home.other",
        categoryLabel: "Personal item",
        photo: {
          localUri: "file:///gate-camera.jpg",
          fileName: "gate-camera.jpg",
          mimeType: "image/jpeg",
          byteSize: 1024
        },
        locationStatus: "unknown",
        placeId: null,
        roomId: null,
        locatorText: null,
        evidence: null
      });
      manualSync = latest!.syncNow();
      foregroundListener?.("active");
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(ingest).not.toHaveBeenCalled();
    expect(transport.pullCalls).toBe(pullsBeforeGate);

    await act(async () => {
      releaseGate();
      await activeVaultOperation;
      await asset;
      await manualSync;
    });
    await waitFor(() => {
      expect(ingest).toHaveBeenCalledTimes(1);
      expect(transport.pullCalls).toBeGreaterThan(pullsBeforeGate);
    });
    await screen.unmount();
    appStateSpy.mockRestore();
  });

  it("serializes startup interrupted-restore resolution through the shared vault gate", async () => {
    const appStateSpy = jest
      .spyOn(AppState, "addEventListener")
      .mockReturnValue({ remove: jest.fn() });
    const scope = await deriveAuthenticatedVaultScope(
      "account-provider-test",
      HOUSEHOLD_ID
    );
    const repository = new MemoryWorkspaceRepository(scope);
    const initialize = jest.spyOn(repository, "initialize");
    let releaseGate!: () => void;
    let signalGateStarted!: () => void;
    const gateStarted = new Promise<void>((resolve) => {
      signalGateStarted = resolve;
    });
    const gateRelease = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const activeVaultOperation = runVaultOperationExclusive(async () => {
      signalGateStarted();
      await gateRelease;
    });
    await gateStarted;

    const screen = await render(
      <WorkspaceProvider
        repositoryOverride={repository}
        attachmentStoreOverride={
          new MemoryPreviewAttachmentStore(scope)
        }
        vaultAccess={{
          kind: "authenticated",
          accountId: "account-provider-test",
          householdId: HOUSEHOLD_ID,
          role: "owner"
        }}
        installationDeviceIdentity={{
          scope: "installation",
          getOrCreate: async () =>
            "00000000-0000-4000-8000-000000000813"
        }}
      >
        <Probe />
      </WorkspaceProvider>
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(initialize).not.toHaveBeenCalled();
    expect(latest?.storageReady).toBe(false);

    await act(async () => {
      releaseGate();
      await activeVaultOperation;
    });
    await waitFor(() => {
      expect(initialize).toHaveBeenCalledTimes(1);
      expect(latest?.storageReady).toBe(true);
    });
    await screen.unmount();
    appStateSpy.mockRestore();
  });

  it("restores a signed clean-device vault instead of leaving setup empty", async () => {
    const appStateSpy = jest
      .spyOn(AppState, "addEventListener")
      .mockReturnValue({ remove: jest.fn() });
    const scope = await deriveAuthenticatedVaultScope(
      "account-provider-test",
      HOUSEHOLD_ID
    );
    const repository = new MemoryWorkspaceRepository(scope);
    const transport = new ProviderTestTransport();
    const screen = await render(
      <WorkspaceProvider
        repositoryOverride={repository}
        attachmentStoreOverride={
          new MemoryPreviewAttachmentStore(scope)
        }
        vaultAccess={{
          kind: "authenticated",
          accountId: "account-provider-test",
          householdId: HOUSEHOLD_ID,
          role: "owner"
        }}
        syncTransport={transport}
      >
        <Probe />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(latest?.bootstrap.status).toBe("ready");
      expect(latest?.workspace).toMatchObject({
        household: {
          id: HOUSEHOLD_ID,
          name: "Provider household"
        }
      });
    });
    expect((await repository.load()).revision).toBe(1);
    expect(transport.pushCalls).toBe(0);
    await screen.unmount();
    appStateSpy.mockRestore();
  });

  it("keeps a failed clean restore retryable and completes it on demand", async () => {
    const appStateSpy = jest
      .spyOn(AppState, "addEventListener")
      .mockReturnValue({ remove: jest.fn() });
    const scope = await deriveAuthenticatedVaultScope(
      "account-provider-test",
      HOUSEHOLD_ID
    );
    const repository = new MemoryWorkspaceRepository(scope);
    const transport = new ProviderTestTransport();
    transport.failNextPull = true;
    const screen = await render(
      <WorkspaceProvider
        repositoryOverride={repository}
        attachmentStoreOverride={
          new MemoryPreviewAttachmentStore(scope)
        }
        vaultAccess={{
          kind: "authenticated",
          accountId: "account-provider-test",
          householdId: HOUSEHOLD_ID,
          role: "owner"
        }}
        syncTransport={transport}
      >
        <Probe />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(latest?.bootstrap).toMatchObject({
        status: "retryable-error",
        lastError: { code: "OFFLINE", retryable: true }
      });
      expect(latest?.workspace).toBeNull();
    });
    await act(async () => {
      await latest!.retryBootstrap();
    });
    await waitFor(() => {
      expect(latest?.bootstrap.status).toBe("ready");
      expect(latest?.workspace?.household.id).toBe(HOUSEHOLD_ID);
    });
    await screen.unmount();
    appStateSpy.mockRestore();
  });

  it("surfaces revoked membership without creating a local workspace", async () => {
    const appStateSpy = jest
      .spyOn(AppState, "addEventListener")
      .mockReturnValue({ remove: jest.fn() });
    const scope = await deriveAuthenticatedVaultScope(
      "account-provider-test",
      HOUSEHOLD_ID
    );
    const repository = new MemoryWorkspaceRepository(scope);
    const transport = new ProviderTestTransport();
    transport.denyAccess = true;
    const screen = await render(
      <WorkspaceProvider
        repositoryOverride={repository}
        attachmentStoreOverride={
          new MemoryPreviewAttachmentStore(scope)
        }
        vaultAccess={{
          kind: "authenticated",
          accountId: "account-provider-test",
          householdId: HOUSEHOLD_ID,
          role: "owner"
        }}
        syncTransport={transport}
      >
        <Probe />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(latest?.bootstrap).toMatchObject({
        status: "access-revoked",
        lastError: {
          code: "AUTHORIZATION_DENIED",
          retryable: false
        }
      });
      expect(latest?.workspace).toBeNull();
    });
    expect(await repository.load()).toEqual({
      revision: 0,
      snapshot: null
    });
    await screen.unmount();
    appStateSpy.mockRestore();
  });

  it("removes an already-cached household from rendered state after revocation", async () => {
    const appStateSpy = jest
      .spyOn(AppState, "addEventListener")
      .mockReturnValue({ remove: jest.fn() });
    const scope = await deriveAuthenticatedVaultScope(
      "account-provider-test",
      HOUSEHOLD_ID
    );
    const repository = new MemoryWorkspaceRepository(scope);
    await repository.initialize();
    await repository.commit({
      expectedRevision: 0,
      nextRevision: 1,
      snapshot: createWorkspace("personal", NOW, {
        householdId: HOUSEHOLD_ID,
        ownerMemberId:
          "00000000-0000-4000-8000-000000000805",
        deviceId: "00000000-0000-4000-8000-000000000806"
      }),
      operations: []
    });
    const transport = new ProviderTestTransport();
    transport.denyAccess = true;
    const screen = await render(
      <WorkspaceProvider
        repositoryOverride={repository}
        attachmentStoreOverride={
          new MemoryPreviewAttachmentStore(scope)
        }
        vaultAccess={{
          kind: "authenticated",
          accountId: "account-provider-test",
          householdId: HOUSEHOLD_ID,
          role: "owner"
        }}
        syncTransport={transport}
      >
        <Probe />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(latest?.bootstrap.status).toBe("access-revoked");
      expect(latest?.workspace).toBeNull();
    });
    // The encrypted snapshot is preserved for an administrator-corrected
    // retry, but it is no longer exposed through React state or data routes.
    expect((await repository.load()).snapshot).not.toBeNull();
    await screen.unmount();
    appStateSpy.mockRestore();
  });
});
