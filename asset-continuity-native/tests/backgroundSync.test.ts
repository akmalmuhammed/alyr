import type {
  Result,
  SyncCursor,
  SyncOperation,
  SyncTransport,
  UploadCompletionResponse
} from "@alyr/contracts";

import {
  createBackgroundSyncTask,
  type BackgroundSyncLogEvent
} from "@/background/backgroundSyncTask";
import {
  ALYR_BACKGROUND_SYNC_TASK_NAME,
  registerBackgroundSync,
  type BackgroundSyncScheduler
} from "@/background/registerBackgroundSync";
import {
  runBackgroundSync,
  type BackgroundSyncRuntimeState
} from "@/background/runBackgroundSync";
import type {
  AttachmentStore,
  MaterializedAttachment,
  VerifiedAttachmentSink
} from "@/data/attachmentStore";
import type { EvidenceDownloadPort } from "@/data/evidenceDownload";
import type { EvidenceUploadPort } from "@/data/evidenceUpload";
import { MemoryWorkspaceRepository } from "@/data/memoryRepository";
import { createLocalOperation } from "@/data/sync";
import type {
  NativeEvidence,
  NativeWorkspace
} from "@/domain/model";
import { createWorkspace } from "@/domain/sample";

const NOW = "2026-07-28T08:00:00.000Z";
const NOW_MS = Date.parse(NOW);
const HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000701";
const ACCOUNT_ID = "00000000-0000-4000-8000-000000000702";
const MEMBER_ID = "00000000-0000-4000-8000-000000000703";
const DEVICE_ID = "00000000-0000-4000-8000-000000000704";

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function pullCursor(): SyncCursor {
  return {
    cursorVersion: 1,
    value: null,
    issuedAt: NOW
  };
}

function successfulTransport(): {
  readonly transport: SyncTransport;
  readonly push: jest.Mock;
  readonly pull: jest.Mock;
} {
  const push = jest.fn(
    async (operations: readonly SyncOperation[]) => ({
      ok: true as const,
      value: {
        acknowledgedOperationIds: operations.map(
          (operation) => operation.operationId
        ),
        conflicts: [],
        cursor: pullCursor()
      }
    })
  );
  const pull = jest.fn(async () => ({
    ok: true as const,
    value: {
      workspace: {
        householdId: HOUSEHOLD_ID,
        householdName: "Background household",
        householdVersion: 1,
        householdCreatedAt: NOW,
        membershipId: MEMBER_ID,
        accountId: ACCOUNT_ID,
        role: "owner" as const,
        membershipVersion: 1
      },
      changes: [],
      cursor: pullCursor()
    }
  }));
  return {
    push,
    pull,
    transport: { push, pull }
  };
}

function encryptedAttachmentStore(): AttachmentStore {
  return {
    kind: "encrypted-files",
    encryptedAtRest: true,
    ingest: async (file) => file,
    materializeForViewing: jest.fn(
      async (request): Promise<MaterializedAttachment> => ({
        uri: `file:///temporary/${request.fileName}`,
        fileName: request.fileName,
        mimeType: request.mimeType,
        byteSize: request.byteSize,
        checksumSha256:
          request.storage === "encrypted"
            ? request.checksumSha256
            : null,
        integrity: "aes-gcm-and-sha256",
        temporary: true
      })
    ),
    cleanupMaterialized: jest.fn(async () => undefined)
  };
}

function verifiedAttachmentStore():
  AttachmentStore & VerifiedAttachmentSink {
  return {
    ...encryptedAttachmentStore(),
    ingestVerifiedBytes: jest.fn(async (request) => {
      const protectedUri =
        `file:///vault/${request.checksumSha256}.alyrblob`;
      return {
        localUri: protectedUri,
        protectedUri,
        fileName: request.fileName,
        mimeType: request.mimeType,
        byteSize: request.byteSize,
        checksumSha256: request.checksumSha256,
        encryptedAtRest: true
      };
    })
  };
}

function unusedUploadPort(): EvidenceUploadPort {
  return {
    complete: jest.fn(),
    createIntent: jest.fn(),
    upload: jest.fn()
  };
}

function unusedDownloadPort(): EvidenceDownloadPort {
  return {
    download: jest.fn()
  };
}

function readyRuntime(
  repository: MemoryWorkspaceRepository,
  transport: SyncTransport,
  options: {
    readonly attachmentStore?: AttachmentStore;
    readonly evidenceUploadPort?: EvidenceUploadPort;
    readonly evidenceDownloadPort?: EvidenceDownloadPort;
  } = {}
): BackgroundSyncRuntimeState {
  return {
    kind: "ready",
    accountId: ACCOUNT_ID,
    householdId: HOUSEHOLD_ID,
    repository,
    transport,
    attachmentStore:
      options.attachmentStore ?? encryptedAttachmentStore(),
    evidenceUploadPort:
      options.evidenceUploadPort ?? unusedUploadPort(),
    evidenceDownloadPort:
      options.evidenceDownloadPort ?? unusedDownloadPort()
  };
}

async function repositoryWith(
  workspace: NativeWorkspace,
  operations: readonly SyncOperation[] = []
): Promise<MemoryWorkspaceRepository> {
  const repository = new MemoryWorkspaceRepository();
  await repository.initialize();
  await repository.commit({
    expectedRevision: 0,
    nextRevision: 1,
    snapshot: workspace,
    operations
  });
  return repository;
}

function workspace(): NativeWorkspace {
  return createWorkspace("personal", NOW, {
    householdId: HOUSEHOLD_ID,
    ownerMemberId: MEMBER_ID,
    deviceId: DEVICE_ID
  });
}

function metadataOperations(
  current: NativeWorkspace,
  count: number
): readonly SyncOperation[] {
  return Array.from({ length: count }, (_, index) =>
    createLocalOperation(current, {
      type: "place.create",
      aggregateId: uuid(1_000 + index),
      payload: {
        name: `Place ${index + 1}`,
        addressText: null,
        regionLabel: "Region",
        latitude: null,
        longitude: null,
        locationSource: "not_set",
        locationPrecision: "locality_only",
        horizontalAccuracyM: null,
        observedAt: null,
        confirmedAt: null
      },
      operationId: uuid(2_000 + index),
      idempotencyKey: uuid(3_000 + index),
      observedVersion: 0,
      occurredAt: NOW
    })
  );
}

interface EvidenceFixture {
  readonly workspace: NativeWorkspace;
  readonly operations: readonly SyncOperation[];
}

function evidenceFixture(count: number): EvidenceFixture {
  const base = workspace();
  const evidence: NativeEvidence[] = [];
  const operations: SyncOperation[] = [];
  for (let index = 0; index < count; index += 1) {
    const evidenceId = uuid(4_000 + index);
    const versionId = uuid(5_000 + index);
    const blobId = uuid(6_000 + index);
    const checksum = (index + 1).toString(16).repeat(64);
    const item: NativeEvidence = {
      id: evidenceId,
      version: 1,
      versionId,
      blobObjectId: blobId,
      householdId: HOUSEHOLD_ID,
      assetId: uuid(7_000 + index),
      kind: "paper",
      relation: "ownership",
      fileName: `proof-${index + 1}.pdf`,
      mimeType: "application/pdf",
      byteSize: 4,
      localUri: `file:///vault/${blobId}.alyrblob`,
      checksumSha256: checksum,
      reviewStatus: "pending",
      reviewedAt: null,
      storageState: "on-device",
      capturedAt: NOW,
      updatedAt: NOW
    };
    evidence.push(item);
    operations.push(
      createLocalOperation(base, {
        type: "evidence.version.add",
        aggregateId: versionId,
        payload: {
          evidenceId,
          blobObjectId: blobId,
          fileName: item.fileName,
          mimeType: item.mimeType,
          byteSize: item.byteSize,
          checksumSha256: checksum
        },
        operationId: uuid(8_000 + index),
        idempotencyKey: uuid(9_000 + index),
        observedVersion: 0,
        occurredAt: NOW,
        prerequisites: [
          {
            kind: "blob-stored",
            blobObjectId: blobId
          }
        ]
      })
    );
  }
  return {
    workspace: { ...base, evidence },
    operations
  };
}

function missingUpload(): Result<UploadCompletionResponse> {
  return {
    ok: false,
    error: {
      errorVersion: 1,
      code: "NOT_FOUND",
      message: "No completed upload exists.",
      retryable: true
    }
  };
}

function uploadingPort(options: {
  readonly onUpload?: () => void;
} = {}): {
  readonly port: EvidenceUploadPort;
  readonly complete: jest.Mock;
  readonly createIntent: jest.Mock;
  readonly upload: jest.Mock;
} {
  const stored = new Set<string>();
  const complete = jest.fn(async (descriptor) => {
    if (!stored.has(descriptor.blobId)) return missingUpload();
    return {
      ok: true as const,
      value: {
        upload: {
          id: descriptor.blobId,
          objectKey:
            `${descriptor.householdId}/${descriptor.blobId}/` +
            descriptor.evidenceVersionId,
          status: "stored" as const
        },
        note: "Verified."
      }
    };
  });
  const createIntent = jest.fn(async (descriptor) => ({
    ok: true as const,
    value: {
      uploadId: descriptor.blobId,
      blobObjectId: descriptor.blobId,
      expiresAt: "2026-07-28T08:05:00.000Z",
      uploadTarget: {
        provider: "supabase-storage",
        bucket: "evidence",
        objectKey:
          `${descriptor.householdId}/${descriptor.blobId}/` +
          descriptor.evidenceVersionId,
        path:
          `${descriptor.householdId}/${descriptor.blobId}/` +
          descriptor.evidenceVersionId,
        token: "background-token-safe"
      }
    }
  }));
  const upload = jest.fn(async (descriptor) => {
    stored.add(descriptor.blobId);
    options.onUpload?.();
    return {
      ok: true as const,
      value: { outcome: "uploaded" as const }
    };
  });
  return {
    complete,
    createIntent,
    upload,
    port: { complete, createIntent, upload }
  };
}

describe("bounded background sync", () => {
  it.each([
    ["signed-out", { kind: "signed-out" } as const],
    ["vault-locked", { kind: "vault-locked" } as const],
    ["provider-missing", { kind: "provider-missing" } as const]
  ])("treats %s runtime as a no-op", async (reason, runtime) => {
    await expect(runBackgroundSync({ runtime })).resolves.toEqual({
      kind: "skipped",
      reason,
      metadataOperationsAttempted: 0,
      evidenceTransfersAttempted: 0
    });
  });

  it("never bootstraps a clean vault in an opportunistic task", async () => {
    const repository = new MemoryWorkspaceRepository();
    await repository.initialize();
    const cloud = successfulTransport();

    await expect(
      runBackgroundSync({
        runtime: readyRuntime(repository, cloud.transport),
        clock: { nowMs: () => NOW_MS }
      })
    ).resolves.toEqual({
      kind: "skipped",
      reason: "clean-vault",
      metadataOperationsAttempted: 0,
      evidenceTransfersAttempted: 0
    });
    expect(cloud.push).not.toHaveBeenCalled();
    expect(cloud.pull).not.toHaveBeenCalled();
    expect(await repository.load()).toEqual({
      revision: 0,
      snapshot: null
    });
  });

  it("never lets a dynamic deadline relax an earlier static expiry", async () => {
    let time = NOW_MS;
    let deadlineReadCount = 0;
    const repository = await repositoryWith(workspace());
    const cloud = successfulTransport();

    const result = await runBackgroundSync({
      runtime: readyRuntime(repository, cloud.transport),
      clock: { nowMs: () => time },
      expiresAtMs: NOW_MS + 1_000,
      deadline: {
        expiresAtMs: () => {
          deadlineReadCount += 1;
          if (deadlineReadCount === 1) return NOW_MS + 2_000;
          time = NOW_MS + 1_500;
          return NOW_MS + 5_000;
        }
      }
    });

    expect(result).toMatchObject({
      kind: "skipped",
      reason: "expired"
    });
    expect(cloud.pull).not.toHaveBeenCalled();
  });

  it("remembers the tightest dynamic deadline it has observed", async () => {
    let time = NOW_MS;
    let deadlineReadCount = 0;
    const repository = await repositoryWith(workspace());
    const cloud = successfulTransport();

    const result = await runBackgroundSync({
      runtime: readyRuntime(repository, cloud.transport),
      clock: { nowMs: () => time },
      expiresAtMs: NOW_MS + 10_000,
      deadline: {
        expiresAtMs: () => {
          deadlineReadCount += 1;
          if (deadlineReadCount === 1) return NOW_MS + 1_000;
          time = NOW_MS + 1_500;
          return NOW_MS + 10_000;
        }
      }
    });

    expect(result).toMatchObject({
      kind: "skipped",
      reason: "expired"
    });
    expect(cloud.pull).not.toHaveBeenCalled();
  });

  it("pushes at most 20 metadata operations and leaves the same durable ids queued", async () => {
    const current = workspace();
    const operations = metadataOperations(current, 25);
    const repository = await repositoryWith(current, operations);
    const cloud = successfulTransport();

    const result = await runBackgroundSync({
      runtime: readyRuntime(repository, cloud.transport),
      clock: { nowMs: () => NOW_MS }
    });

    expect(result).toMatchObject({
      kind: "finished",
      outcome: "synced",
      metadataOperationsAttempted: 20,
      evidenceTransfersAttempted: 0
    });
    expect(cloud.push).toHaveBeenCalledTimes(1);
    expect(cloud.push.mock.calls[0]?.[0]).toHaveLength(20);
    expect(
      (await repository.listPendingOperations(100)).map(
        (operation) => operation.operationId
      )
    ).toEqual(
      operations.slice(20).map((operation) => operation.operationId)
    );
  });

  it("keeps the full outbox identity ledger when server echoes exceed the 20-operation send cap", async () => {
    const base = workspace();
    const operations = metadataOperations(base, 25);
    const places = operations.map((operation, index) => ({
      id: operation.command.aggregateId!,
      householdId: HOUSEHOLD_ID,
      version: 0,
      name: `Place ${index + 1}`,
      addressSummary: null,
      regionLabel: "Region",
      latitude: null,
      longitude: null,
      locationSource: "not_set" as const,
      precision: "locality_only" as const,
      horizontalAccuracyMeters: null,
      observedAt: null,
      confirmedAt: null,
      rooms: [],
      createdAt: NOW,
      updatedAt: NOW
    }));
    const repository = await repositoryWith(
      { ...base, places },
      operations
    );
    const push = jest.fn(
      async (selected: readonly SyncOperation[]) => ({
        ok: true as const,
        value: {
          acknowledgedOperationIds: selected.map(
            (operation) => operation.operationId
          ),
          conflicts: [],
          cursor: {
            cursorVersion: 1 as const,
            value: "25",
            issuedAt: NOW
          }
        }
      })
    );
    const pull = jest.fn(async () => ({
      ok: true as const,
      value: {
        workspace: {
          householdId: HOUSEHOLD_ID,
          householdName: "Background household",
          householdVersion: 1,
          householdCreatedAt: NOW,
          membershipId: MEMBER_ID,
          accountId: ACCOUNT_ID,
          role: "owner" as const,
          membershipVersion: 1
        },
        changes: operations.map((operation, index) => ({
          sequence: index + 1,
          entityType: "place",
          entityId: operation.command.aggregateId!,
          householdId: HOUSEHOLD_ID,
          version: 1,
          tombstoned: false,
          body: {
            operationId: operation.operationId,
            command: "place.create",
            payload: operation.command.payload,
            result: {}
          },
          changedAt: NOW
        })),
        cursor: {
          cursorVersion: 1 as const,
          value: "25",
          issuedAt: NOW
        }
      }
    }));

    await expect(
      runBackgroundSync({
        runtime: readyRuntime(repository, { push, pull }),
        clock: { nowMs: () => NOW_MS }
      })
    ).resolves.toMatchObject({
      kind: "finished",
      outcome: "synced",
      metadataOperationsAttempted: 20
    });
    expect(push.mock.calls[0]?.[0]).toHaveLength(20);
    expect(await repository.listPendingOperations(100)).toHaveLength(5);
  });

  it("performs at most two Evidence byte transfers in one task", async () => {
    const fixture = evidenceFixture(3);
    const repository = await repositoryWith(
      fixture.workspace,
      fixture.operations
    );
    const cloud = successfulTransport();
    const uploads = uploadingPort();

    const result = await runBackgroundSync({
      runtime: readyRuntime(repository, cloud.transport, {
        evidenceUploadPort: uploads.port
      }),
      clock: { nowMs: () => NOW_MS }
    });

    expect(result).toMatchObject({
      kind: "finished",
      outcome: "retry",
      metadataOperationsAttempted: 2,
      evidenceTransfersAttempted: 2
    });
    expect(uploads.upload).toHaveBeenCalledTimes(2);
    expect(cloud.push.mock.calls[0]?.[0]).toHaveLength(2);
    expect(await repository.listPendingOperations(100)).toHaveLength(1);
  });

  it("hydrates at most two cloud Evidence files in one task", async () => {
    const fixture = evidenceFixture(3);
    const cloudWorkspace: NativeWorkspace = {
      ...fixture.workspace,
      evidence: fixture.workspace.evidence.map((item) => ({
        ...item,
        localUri: null,
        storageState: "synced"
      }))
    };
    const repository = await repositoryWith(cloudWorkspace);
    const cloud = successfulTransport();
    const download = jest.fn(async () => ({
      ok: true as const,
      value: new Uint8Array([1, 2, 3, 4])
    }));

    const result = await runBackgroundSync({
      runtime: readyRuntime(repository, cloud.transport, {
        attachmentStore: verifiedAttachmentStore(),
        evidenceDownloadPort: { download }
      }),
      clock: { nowMs: () => NOW_MS }
    });

    expect(result).toMatchObject({
      kind: "finished",
      outcome: "retry",
      metadataOperationsAttempted: 0,
      evidenceTransfersAttempted: 2
    });
    expect(download).toHaveBeenCalledTimes(2);
    const saved = (await repository.load()).snapshot as NativeWorkspace;
    expect(
      saved.evidence.filter((item) => item.localUri !== null)
    ).toHaveLength(2);
    expect(
      saved.evidence.filter((item) => item.localUri === null)
    ).toHaveLength(1);
  });

  it("shares one two-transfer budget across uploads and downloads", async () => {
    const fixture = evidenceFixture(3);
    const mixedWorkspace: NativeWorkspace = {
      ...fixture.workspace,
      evidence: fixture.workspace.evidence.map((item, index) =>
        index === 0
          ? item
          : {
              ...item,
              localUri: null,
              storageState: "synced"
            }
      )
    };
    const repository = await repositoryWith(mixedWorkspace, [
      fixture.operations[0]!
    ]);
    const cloud = successfulTransport();
    const uploads = uploadingPort();
    const download = jest.fn(async () => ({
      ok: true as const,
      value: new Uint8Array([1, 2, 3, 4])
    }));

    const result = await runBackgroundSync({
      runtime: readyRuntime(repository, cloud.transport, {
        attachmentStore: verifiedAttachmentStore(),
        evidenceUploadPort: uploads.port,
        evidenceDownloadPort: { download }
      }),
      clock: { nowMs: () => NOW_MS }
    });

    expect(result).toMatchObject({
      kind: "finished",
      outcome: "retry",
      metadataOperationsAttempted: 1,
      evidenceTransfersAttempted: 2
    });
    expect(uploads.upload).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledTimes(1);
    const saved = (await repository.load()).snapshot as NativeWorkspace;
    expect(
      saved.evidence.filter(
        (item) =>
          item.storageState === "synced" && item.localUri === null
      )
    ).toHaveLength(1);
  });

  it("does not materialize plaintext when the deadline expires during upload preflight", async () => {
    let time = NOW_MS;
    const deadline = NOW_MS + 1_000;
    const fixture = evidenceFixture(1);
    const repository = await repositoryWith(
      fixture.workspace,
      fixture.operations
    );
    const cloud = successfulTransport();
    const attachmentStore = encryptedAttachmentStore();
    const complete = jest.fn(async () => {
      time = deadline;
      return missingUpload();
    });
    const createIntent = jest.fn();
    const upload = jest.fn();

    await expect(
      runBackgroundSync({
        runtime: readyRuntime(repository, cloud.transport, {
          attachmentStore,
          evidenceUploadPort: {
            complete,
            createIntent,
            upload
          }
        }),
        clock: { nowMs: () => time },
        expiresAtMs: deadline
      })
    ).resolves.toMatchObject({
      kind: "finished",
      outcome: "retry",
      metadataOperationsAttempted: 0,
      evidenceTransfersAttempted: 0
    });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(
      attachmentStore.materializeForViewing
    ).not.toHaveBeenCalled();
    expect(createIntent).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("rechecks the deadline at the exact protected-file materialization boundary", async () => {
    let deadlineReadCount = 0;
    const fixture = evidenceFixture(1);
    const repository = await repositoryWith(
      fixture.workspace,
      fixture.operations
    );
    const cloud = successfulTransport();
    const attachmentStore = encryptedAttachmentStore();
    const complete = jest.fn(async () => missingUpload());
    const createIntent = jest.fn();
    const upload = jest.fn();

    await expect(
      runBackgroundSync({
        runtime: readyRuntime(repository, cloud.transport, {
          attachmentStore,
          evidenceUploadPort: {
            complete,
            createIntent,
            upload
          }
        }),
        clock: { nowMs: () => NOW_MS },
        expiresAtMs: NOW_MS + 10_000,
        deadline: {
          expiresAtMs: () => {
            deadlineReadCount += 1;
            return deadlineReadCount < 5
              ? NOW_MS + 1_000
              : NOW_MS;
          }
        }
      })
    ).resolves.toMatchObject({
      kind: "finished",
      outcome: "retry",
      metadataOperationsAttempted: 0,
      evidenceTransfersAttempted: 0
    });
    expect(deadlineReadCount).toBeGreaterThanOrEqual(5);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(
      attachmentStore.materializeForViewing
    ).not.toHaveBeenCalled();
    expect(createIntent).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("finishes the active upload confirmation then stops before the next transfer when time expires", async () => {
    let time = NOW_MS;
    const deadline = NOW_MS + 1_000;
    const fixture = evidenceFixture(2);
    const repository = await repositoryWith(
      fixture.workspace,
      fixture.operations
    );
    const cloud = successfulTransport();
    const uploads = uploadingPort({
      onUpload: () => {
        time = deadline;
      }
    });

    const result = await runBackgroundSync({
      runtime: readyRuntime(repository, cloud.transport, {
        evidenceUploadPort: uploads.port
      }),
      clock: { nowMs: () => time },
      expiresAtMs: deadline
    });

    expect(result).toMatchObject({
      kind: "finished",
      outcome: "retry",
      metadataOperationsAttempted: 0,
      evidenceTransfersAttempted: 1
    });
    expect(uploads.upload).toHaveBeenCalledTimes(1);
    // Preflight + post-transfer confirmation; the second Evidence item never
    // reaches its provider after the deadline.
    expect(uploads.complete).toHaveBeenCalledTimes(2);
    expect(uploads.createIntent).toHaveBeenCalledTimes(1);
    expect(cloud.push).not.toHaveBeenCalled();

    // The next delivery probes authoritative completion for the first Blob,
    // so the lost metadata acknowledgement never causes a duplicate upload.
    time = deadline + 1_000;
    await expect(
      runBackgroundSync({
        runtime: readyRuntime(repository, cloud.transport, {
          evidenceUploadPort: uploads.port
        }),
        clock: { nowMs: () => time },
        expiresAtMs: time + 1_000
      })
    ).resolves.toMatchObject({
      kind: "finished",
      outcome: "synced",
      metadataOperationsAttempted: 2,
      evidenceTransfersAttempted: 1
    });
    expect(uploads.upload).toHaveBeenCalledTimes(2);
    expect(await repository.listPendingOperations(100)).toEqual([]);
  });
});

describe("background task hook and registration", () => {
  it("resolves the active runtime inside the shared vault gate", async () => {
    const repository = await repositoryWith(workspace());
    const cloud = successfulTransport();
    const gateEntered = deferred<void>();
    const releaseGate = deferred<void>();
    const order: string[] = [];
    let runtimeState: BackgroundSyncRuntimeState = readyRuntime(
      repository,
      cloud.transport
    );
    const task = createBackgroundSyncTask({
      runtime: {
        resolve: async () => {
          order.push("runtime-resolved");
          return runtimeState;
        }
      },
      clock: { nowMs: () => NOW_MS },
      runExclusive: async <T,>(
        work: () => Promise<T>
      ): Promise<T> => {
        order.push("gate-entered");
        gateEntered.resolve();
        await releaseGate.promise;
        return work();
      }
    });

    const pending = task();
    await gateEntered.promise;
    expect(order).toEqual(["gate-entered"]);
    runtimeState = { kind: "signed-out" };
    releaseGate.resolve();

    await expect(pending).resolves.toMatchObject({
      kind: "skipped",
      reason: "signed-out"
    });
    expect(order).toEqual(["gate-entered", "runtime-resolved"]);
    expect(cloud.pull).not.toHaveBeenCalled();
  });

  it("counts runtime resolution time against the task execution window", async () => {
    let time = NOW_MS;
    const repository = await repositoryWith(workspace());
    const cloud = successfulTransport();
    const runtime = deferred<BackgroundSyncRuntimeState>();
    const task = createBackgroundSyncTask({
      runtime: { resolve: () => runtime.promise },
      clock: { nowMs: () => time },
      executionWindowMs: 1_000
    });

    const pending = task();
    time = NOW_MS + 1_000;
    runtime.resolve(readyRuntime(repository, cloud.transport));

    await expect(pending).resolves.toEqual({
      kind: "skipped",
      reason: "expired",
      metadataOperationsAttempted: 0,
      evidenceTransfersAttempted: 0
    });
    expect(cloud.push).not.toHaveBeenCalled();
    expect(cloud.pull).not.toHaveBeenCalled();
  });

  it("applies a tighter coalesced delivery deadline to the shared task", async () => {
    let time = NOW_MS;
    const repository = await repositoryWith(workspace());
    const cloud = successfulTransport();
    const runtime = deferred<BackgroundSyncRuntimeState>();
    const task = createBackgroundSyncTask({
      runtime: { resolve: () => runtime.promise },
      clock: { nowMs: () => time },
      executionWindowMs: 25_000
    });

    const first = task();
    const second = task({ expiresAtMs: NOW_MS + 500 });
    expect(second).toBe(first);
    time = NOW_MS + 500;
    runtime.resolve(readyRuntime(repository, cloud.transport));

    await expect(first).resolves.toMatchObject({
      kind: "skipped",
      reason: "expired"
    });
    expect(cloud.pull).not.toHaveBeenCalled();
  });

  it("coalesces concurrent task delivery onto one reconciliation", async () => {
    const repository = await repositoryWith(workspace());
    const pendingPull =
      deferred<Awaited<ReturnType<SyncTransport["pull"]>>>();
    const pullStarted = deferred<void>();
    const pull = jest.fn(
      () => {
        pullStarted.resolve();
        return pendingPull.promise;
      }
    );
    const transport: SyncTransport = {
      push: jest.fn(),
      pull
    };
    const events: BackgroundSyncLogEvent[] = [];
    let exclusiveCallCount = 0;
    const runExclusive = async <T,>(
      work: () => Promise<T>
    ): Promise<T> => {
      exclusiveCallCount += 1;
      return work();
    };
    const task = createBackgroundSyncTask({
      runtime: {
        resolve: async () => readyRuntime(repository, transport)
      },
      clock: { nowMs: () => NOW_MS },
      logger: {
        record: (event) => {
          events.push(event);
        }
      },
      runExclusive
    });

    const first = task();
    await pullStarted.promise;
    expect(pull).toHaveBeenCalledTimes(1);
    const second = task();
    expect(second).toBe(first);
    pendingPull.resolve({
      ok: true,
      value: {
        workspace: {
          householdId: HOUSEHOLD_ID,
          householdName: "Background household",
          householdVersion: 1,
          householdCreatedAt: NOW,
          membershipId: MEMBER_ID,
          accountId: ACCOUNT_ID,
          role: "owner",
          membershipVersion: 1
        },
        changes: [],
        cursor: pullCursor()
      }
    });

    await expect(first).resolves.toMatchObject({
      kind: "finished",
      outcome: "synced"
    });
    await expect(second).resolves.toMatchObject({
      kind: "finished",
      outcome: "synced"
    });
    expect(events).toContainEqual({
      event: "background-sync.coalesced"
    });
    expect(exclusiveCallCount).toBe(1);
    expect(pull).toHaveBeenCalledTimes(1);
  });

  it("emits only allow-listed diagnostics when runtime resolution fails", async () => {
    const events: BackgroundSyncLogEvent[] = [];
    const secret =
      "bearer-secret household-private-id proof-filename.pdf";
    const task = createBackgroundSyncTask({
      runtime: {
        resolve: async () => {
          throw new Error(secret);
        }
      },
      logger: {
        record: async (event) => {
          events.push(event);
          throw new Error(`logger-rejection ${secret}`);
        }
      },
      clock: { nowMs: () => NOW_MS }
    });

    await expect(task()).resolves.toEqual({
      kind: "finished",
      outcome: "retry",
      metadataOperationsAttempted: 0,
      evidenceTransfersAttempted: 0
    });
    await Promise.resolve();
    expect(JSON.stringify(events)).not.toContain(secret);
    expect(events).toEqual([
      {
        event: "background-sync.finished",
        outcome: "retry",
        metadataOperationsAttempted: 0,
        evidenceTransfersAttempted: 0
      }
    ]);
  });

  it("defines and registers one scheduler hook across concurrent callers", async () => {
    let registered = false;
    const registrationCheck = deferred<boolean>();
    const defined = new Map<
      string,
      () => Promise<unknown>
    >();
    const scheduler: BackgroundSyncScheduler = {
      isTaskDefined: (taskName) => defined.has(taskName),
      defineTask: jest.fn((taskName, handler) => {
        defined.set(taskName, handler);
      }),
      isTaskRegistered: jest.fn(
        () => registrationCheck.promise
      ),
      registerTask: jest.fn(async () => {
        registered = true;
      })
    };
    const task = jest.fn(async () => ({
      kind: "skipped" as const,
      reason: "signed-out" as const,
      metadataOperationsAttempted: 0 as const,
      evidenceTransfersAttempted: 0 as const
    }));

    const first = registerBackgroundSync({ scheduler, task });
    const second = registerBackgroundSync({ scheduler, task });
    expect(first).toBe(second);
    expect(scheduler.defineTask).toHaveBeenCalledTimes(1);
    registrationCheck.resolve(false);
    await expect(first).resolves.toEqual({
      taskName: ALYR_BACKGROUND_SYNC_TASK_NAME,
      newlyRegistered: true
    });
    expect(registered).toBe(true);
    expect(scheduler.registerTask).toHaveBeenCalledTimes(1);
    expect(scheduler.registerTask).toHaveBeenCalledWith(
      ALYR_BACKGROUND_SYNC_TASK_NAME,
      { minimumIntervalMinutes: 6 * 60 }
    );
    expect(await registerBackgroundSync({ scheduler, task })).toEqual({
      taskName: ALYR_BACKGROUND_SYNC_TASK_NAME,
      newlyRegistered: true
    });
    expect(scheduler.isTaskRegistered).toHaveBeenCalledTimes(1);
  });
});
