jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  CryptoEncoding: { HEX: "hex" },
  digestStringAsync: jest.fn(async () => "a".repeat(64)),
  randomUUID: jest.fn(
    () => "00000000-0000-4000-8000-000000000999"
  ),
  getRandomBytes: jest.fn(
    (length: number) => new Uint8Array(length).fill(7)
  )
}));

import { render, waitFor } from "@testing-library/react-native";
import { AppState, Text } from "react-native";

import type {
  SyncCursor,
  SyncOperation,
  SyncTransport
} from "@alyr/contracts";

import type { BackgroundSyncTask } from "@/background/backgroundSyncTask";
import { ALYR_BACKGROUND_SYNC_TASK_NAME } from "@/background/registerBackgroundSync";
import { MemoryPreviewAttachmentStore } from "@/data/attachmentStore";
import type { EvidenceDownloadPort } from "@/data/evidenceDownload";
import type { EvidenceUploadPort } from "@/data/evidenceUpload";
import { MemoryWorkspaceRepository } from "@/data/memoryRepository";
import { deriveAuthenticatedVaultScope } from "@/data/vaultScope";
import { runVaultOperationExclusive } from "@/data/vaultOperationGate";
import { createWorkspace } from "@/domain/sample";
import {
  WorkspaceProvider,
  useWorkspace
} from "@/state/WorkspaceProvider";

const ACCOUNT_ID = "account-background-provider";
const HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000901";
const DEVICE_ID = "00000000-0000-4000-8000-000000000902";
const NOW = "2026-07-28T10:00:00.000Z";

let latest: ReturnType<typeof useWorkspace> | null = null;

function Probe() {
  latest = useWorkspace();
  return <Text>{latest.bootstrap.status}</Text>;
}

class BackgroundProviderTransport implements SyncTransport {
  pushCalls = 0;
  pullCalls = 0;

  async push(operations: readonly SyncOperation[]) {
    this.pushCalls += 1;
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
    return {
      ok: true as const,
      value: {
        workspace: {
          householdId: HOUSEHOLD_ID,
          householdName: "Background fixture",
          householdVersion: 1,
          householdCreatedAt: NOW,
          membershipId:
            "00000000-0000-4000-8000-000000000903",
          accountId: ACCOUNT_ID,
          role: "owner" as const,
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

const uploadPort: EvidenceUploadPort = {
  createIntent: async () => {
    throw new Error("No upload is expected in this fixture.");
  },
  upload: async () => {
    throw new Error("No upload is expected in this fixture.");
  },
  complete: async () => {
    throw new Error("No upload is expected in this fixture.");
  }
};

const downloadPort: EvidenceDownloadPort = {
  download: async () => {
    throw new Error("No download is expected in this fixture.");
  }
};

async function signedFixture(options: {
  readonly encrypted: boolean;
}) {
  const scope = await deriveAuthenticatedVaultScope(
    ACCOUNT_ID,
    HOUSEHOLD_ID
  );
  const repository = new MemoryWorkspaceRepository(scope);
  const attachmentStore = new MemoryPreviewAttachmentStore(scope);
  if (options.encrypted) {
    Object.defineProperties(repository, {
      kind: { value: "sqlite-sqlcipher" },
      durable: { value: true },
      encryptedAtRest: { value: true }
    });
    Object.defineProperties(attachmentStore, {
      kind: { value: "encrypted-files" },
      encryptedAtRest: { value: true }
    });
  }
  await repository.initialize();
  await repository.commit({
    expectedRevision: 0,
    nextRevision: 1,
    snapshot: createWorkspace("personal", NOW, {
      householdId: HOUSEHOLD_ID,
      ownerMemberId:
        "00000000-0000-4000-8000-000000000904",
      deviceId: DEVICE_ID
    }),
    operations: []
  });
  return { repository, attachmentStore };
}

function installationFor(
  onTask: (task: BackgroundSyncTask) => void,
  dispose: () => void
) {
  return (task: BackgroundSyncTask) => {
    onTask(task);
    return {
      registration: Promise.resolve({
        kind: "process-resident",
        taskName: ALYR_BACKGROUND_SYNC_TASK_NAME,
        newlyRegistered: true
      } as const),
      dispose
    };
  };
}

describe("WorkspaceProvider native background-sync lifecycle", () => {
  beforeEach(() => {
    latest = null;
    jest
      .spyOn(AppState, "addEventListener")
      .mockReturnValue({ remove: jest.fn() });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("installs only after the signed vault opens and shares the vault-operation gate", async () => {
    const { repository, attachmentStore } = await signedFixture({
      encrypted: true
    });
    const transport = new BackgroundProviderTransport();
    let installedTask: BackgroundSyncTask | null = null;
    const dispose = jest.fn();
    const installer = jest.fn(
      installationFor(
        (task) => {
          expect(latest?.storageReady).toBe(true);
          installedTask = task;
        },
        dispose
      )
    );
    const screen = await render(
      <WorkspaceProvider
        repositoryOverride={repository}
        attachmentStoreOverride={attachmentStore}
        vaultAccess={{
          kind: "authenticated",
          accountId: ACCOUNT_ID,
          householdId: HOUSEHOLD_ID,
          role: "owner"
        }}
        syncTransport={transport}
        evidenceUploadPort={uploadPort}
        evidenceDownloadPort={downloadPort}
        backgroundSyncInstaller={installer}
        installationDeviceIdentity={{
          scope: "installation",
          getOrCreate: async () => DEVICE_ID
        }}
      >
        <Probe />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(latest?.storageReady).toBe(true);
      expect(installer).toHaveBeenCalledTimes(1);
      expect(installedTask).not.toBeNull();
    });
    await runVaultOperationExclusive(async () => undefined);
    const pullsBeforeBackground = transport.pullCalls;

    let releaseGate!: () => void;
    let markGateStarted!: () => void;
    const gateStarted = new Promise<void>((resolve) => {
      markGateStarted = resolve;
    });
    const gateRelease = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    const activeVaultOperation = runVaultOperationExclusive(async () => {
      markGateStarted();
      await gateRelease;
    });
    await gateStarted;

    const backgroundRun = installedTask!();
    await Promise.resolve();
    expect(transport.pullCalls).toBe(pullsBeforeBackground);

    releaseGate();
    await activeVaultOperation;
    await expect(backgroundRun).resolves.toMatchObject({
      kind: "finished"
    });
    expect(transport.pullCalls).toBe(pullsBeforeBackground + 1);

    await screen.rerender(
      <WorkspaceProvider
        repositoryOverride={repository}
        attachmentStoreOverride={attachmentStore}
        vaultAccess={null}
        syncTransport={null}
        evidenceUploadPort={null}
        evidenceDownloadPort={null}
        backgroundSyncInstaller={installer}
        installationDeviceIdentity={{
          scope: "installation",
          getOrCreate: async () => DEVICE_ID
        }}
      >
        <Probe />
      </WorkspaceProvider>
    );
    await waitFor(() => {
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(latest?.bootstrap.status).toBe("locked");
    });
    await expect(installedTask!()).resolves.toMatchObject({
      kind: "skipped",
      reason: "vault-locked"
    });
    await screen.unmount();
  });

  it("installs a no-op resolver when signed cloud providers are missing", async () => {
    const { repository, attachmentStore } = await signedFixture({
      encrypted: true
    });
    let installedTask: BackgroundSyncTask | null = null;
    const installer = jest.fn(
      installationFor(
        (task) => {
          installedTask = task;
        },
        jest.fn()
      )
    );
    const screen = await render(
      <WorkspaceProvider
        repositoryOverride={repository}
        attachmentStoreOverride={attachmentStore}
        vaultAccess={{
          kind: "authenticated",
          accountId: ACCOUNT_ID,
          householdId: HOUSEHOLD_ID,
          role: "owner"
        }}
        backgroundSyncInstaller={installer}
        installationDeviceIdentity={{
          scope: "installation",
          getOrCreate: async () => DEVICE_ID
        }}
      >
        <Probe />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(installer).toHaveBeenCalledTimes(1);
      expect(installedTask).not.toBeNull();
    });
    await expect(installedTask!()).resolves.toMatchObject({
      kind: "skipped",
      reason: "provider-missing"
    });
    await screen.unmount();
  });

  it("never installs protected background work on a plaintext repository", async () => {
    const { repository, attachmentStore } = await signedFixture({
      encrypted: false
    });
    const installer = jest.fn(
      installationFor(() => undefined, jest.fn())
    );
    const screen = await render(
      <WorkspaceProvider
        repositoryOverride={repository}
        attachmentStoreOverride={attachmentStore}
        vaultAccess={{
          kind: "authenticated",
          accountId: ACCOUNT_ID,
          householdId: HOUSEHOLD_ID,
          role: "owner"
        }}
        syncTransport={new BackgroundProviderTransport()}
        evidenceUploadPort={uploadPort}
        evidenceDownloadPort={downloadPort}
        backgroundSyncInstaller={installer}
        installationDeviceIdentity={{
          scope: "installation",
          getOrCreate: async () => DEVICE_ID
        }}
      >
        <Probe />
      </WorkspaceProvider>
    );

    await waitFor(() => {
      expect(latest?.storageReady).toBe(true);
    });
    await runVaultOperationExclusive(async () => undefined);
    expect(installer).not.toHaveBeenCalled();
    await screen.unmount();
  });
});
