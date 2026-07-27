import type {
  SyncChange,
  SyncOperation,
  SyncTransport
} from "@alyr/contracts";

import type { AttachmentStore } from "@/data/attachmentStore";
import type { EvidenceUploadPort } from "@/data/evidenceUpload";
import { reconcileForeground } from "@/data/foregroundSync";
import { MemoryWorkspaceRepository } from "@/data/memoryRepository";
import { createLocalOperation } from "@/data/sync";
import type {
  NativeEvidence,
  NativePlaceDocument,
  NativeWorkspace
} from "@/domain/model";
import { createWorkspace } from "@/domain/sample";

const NOW = "2026-07-27T14:00:00.000Z";
const HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000301";
const EVIDENCE_ID = "00000000-0000-4000-8000-000000000302";
const VERSION_ID = "00000000-0000-4000-8000-000000000303";
const BLOB_ID = "00000000-0000-4000-8000-000000000304";
const CHECKSUM = "e".repeat(64);

function fixture(): {
  readonly workspace: NativeWorkspace;
  readonly operation: SyncOperation;
} {
  const base = createWorkspace("personal", NOW, {
    householdId: HOUSEHOLD_ID,
    ownerMemberId: "00000000-0000-4000-8000-000000000305",
    deviceId: "00000000-0000-4000-8000-000000000306"
  });
  const evidence: NativeEvidence = {
    id: EVIDENCE_ID,
    version: 1,
    versionId: VERSION_ID,
    blobObjectId: BLOB_ID,
    householdId: HOUSEHOLD_ID,
    assetId: "00000000-0000-4000-8000-000000000307",
    kind: "paper",
    relation: "ownership",
    fileName: "title.pdf",
    mimeType: "application/pdf",
    byteSize: 4,
    localUri: "file:///vault/title.alyrblob",
    checksumSha256: CHECKSUM,
    reviewStatus: "pending",
    reviewedAt: null,
    storageState: "on-device",
    capturedAt: NOW,
    updatedAt: NOW
  };
  const workspace: NativeWorkspace = {
    ...base,
    evidence: [evidence]
  };
  return {
    workspace,
    operation: createLocalOperation(workspace, {
      type: "evidence.version.add",
      aggregateId: VERSION_ID,
      payload: {
        evidenceId: EVIDENCE_ID,
        blobObjectId: BLOB_ID,
        fileName: "title.pdf",
        mimeType: "application/pdf",
        byteSize: 4,
        checksumSha256: CHECKSUM
      },
      operationId: "00000000-0000-4000-8000-000000000308",
      idempotencyKey: "00000000-0000-4000-8000-000000000309",
      observedVersion: 0,
      occurredAt: NOW,
      prerequisites: [{ kind: "blob-stored", blobObjectId: BLOB_ID }]
    })
  };
}

describe("foreground Evidence prerequisite integration", () => {
  it("pushes a version command only after authoritative Blob completion", async () => {
    const { workspace, operation } = fixture();
    const repository = new MemoryWorkspaceRepository();
    await repository.initialize();
    await repository.commit({
      expectedRevision: 0,
      nextRevision: 1,
      snapshot: workspace,
      operations: [operation]
    });
    const pushed: SyncOperation[] = [];
    const transport: SyncTransport = {
      push: async (operations) => {
        pushed.push(...operations);
        return {
          ok: true,
          value: {
            acknowledgedOperationIds: operations.map(
              (candidate) => candidate.operationId
            ),
            conflicts: [],
            cursor: {
              cursorVersion: 1,
              value: null,
              issuedAt: NOW
            }
          }
        };
      },
      pull: async () => ({
        ok: true,
        value: {
          workspace: {
            householdId: HOUSEHOLD_ID,
            householdName: "Evidence household",
            householdVersion: 1,
            householdCreatedAt: NOW,
            membershipId:
              "00000000-0000-4000-8000-000000000310",
            accountId:
              "00000000-0000-4000-8000-000000000311",
            role: "owner",
            membershipVersion: 1
          },
          changes: [],
          cursor: {
            cursorVersion: 1,
            value: null,
            issuedAt: NOW
          }
        }
      })
    };
    const uploadPort: EvidenceUploadPort = {
      complete: async () => ({
        ok: true,
        value: {
          upload: {
            id: BLOB_ID,
            objectKey: `${HOUSEHOLD_ID}/${BLOB_ID}/${VERSION_ID}`,
            status: "stored"
          },
          note: "Verified."
        }
      }),
      createIntent: jest.fn(),
      upload: jest.fn()
    };
    const attachmentStore: AttachmentStore = {
      kind: "encrypted-files",
      encryptedAtRest: true,
      ingest: async (file) => file,
      materializeForViewing: jest.fn(),
      cleanupMaterialized: jest.fn()
    };

    const result = await reconcileForeground({
      repository,
      transport,
      attachmentStore,
      evidenceUploadPort: uploadPort,
      householdId: HOUSEHOLD_ID,
      now: () => NOW
    });

    expect(result.kind).toBe("synced");
    expect(pushed.map((candidate) => candidate.command.type)).toEqual([
      "evidence.version.add"
    ]);
    expect(await repository.listPendingOperations(10)).toEqual([]);
    expect(uploadPort.createIntent).not.toHaveBeenCalled();
    expect(uploadPort.upload).not.toHaveBeenCalled();
  });

  it("reuses the verified Blob upload gate before pushing Place-document metadata and version commands", async () => {
    const base = createWorkspace("personal", NOW, {
      householdId: HOUSEHOLD_ID,
      ownerMemberId:
        "00000000-0000-4000-8000-000000000305",
      deviceId: "00000000-0000-4000-8000-000000000306"
    });
    const placeDocument: NativePlaceDocument = {
      id: EVIDENCE_ID,
      version: 1,
      documentVersionNumber: 0,
      versionId: VERSION_ID,
      blobObjectId: BLOB_ID,
      householdId: HOUSEHOLD_ID,
      placeId: "00000000-0000-4000-8000-000000000312",
      kind: "paper",
      relation: "other",
      fileName: "property-title.pdf",
      mimeType: "application/pdf",
      byteSize: 4,
      localUri: "file:///vault/property-title.alyrblob",
      checksumSha256: CHECKSUM,
      encryptedAtRest: true,
      storageState: "on-device",
      capturedAt: NOW,
      updatedAt: NOW
    };
    const workspace: NativeWorkspace = {
      ...base,
      places: [
        {
          ...createWorkspace("sample").places[0]!,
          id: placeDocument.placeId,
          householdId: HOUSEHOLD_ID
        }
      ],
      placeDocuments: [placeDocument]
    };
    const createOperation = createLocalOperation(workspace, {
      type: "place-document.create",
      aggregateId: EVIDENCE_ID,
      payload: {
        placeId: placeDocument.placeId,
        kind: "paper",
        relation: "other",
        title: placeDocument.fileName
      },
      operationId:
        "00000000-0000-4000-8000-000000000313",
      idempotencyKey:
        "00000000-0000-4000-8000-000000000314",
      observedVersion: 0,
      occurredAt: NOW
    });
    const versionOperation = createLocalOperation(workspace, {
      type: "place-document.version.add",
      aggregateId: VERSION_ID,
      payload: {
        placeDocumentId: EVIDENCE_ID,
        blobObjectId: BLOB_ID,
        fileName: placeDocument.fileName,
        mimeType: placeDocument.mimeType,
        byteSize: placeDocument.byteSize,
        checksumSha256: CHECKSUM
      },
      operationId:
        "00000000-0000-4000-8000-000000000315",
      idempotencyKey:
        "00000000-0000-4000-8000-000000000316",
      observedVersion: 0,
      occurredAt: NOW,
      prerequisites: [{ kind: "blob-stored", blobObjectId: BLOB_ID }]
    });
    const repository = new MemoryWorkspaceRepository();
    await repository.initialize();
    await repository.commit({
      expectedRevision: 0,
      nextRevision: 1,
      snapshot: workspace,
      operations: [createOperation, versionOperation]
    });
    const pushed: SyncOperation[] = [];
    const pulledChanges: readonly SyncChange[] = [
      {
        sequence: 1,
        entityType: "place-document",
        entityId: EVIDENCE_ID,
        householdId: HOUSEHOLD_ID,
        version: 1,
        tombstoned: false,
        body: {
          operationId: createOperation.operationId,
          command: "place-document.create",
          payload: createOperation.command.payload,
          result: {
            entityId: EVIDENCE_ID,
            entityVersion: 1
          }
        },
        changedAt: NOW
      },
      {
        sequence: 2,
        entityType: "place-document",
        entityId: VERSION_ID,
        householdId: HOUSEHOLD_ID,
        version: 2,
        tombstoned: false,
        body: {
          operationId: versionOperation.operationId,
          command: "place-document.version.add",
          payload: versionOperation.command.payload,
          result: {
            entityId: VERSION_ID,
            entityVersion: 2,
            documentVersionNumber: 1
          }
        },
        changedAt: NOW
      }
    ];
    const transport: SyncTransport = {
      push: async (operations) => {
        pushed.push(...operations);
        return {
          ok: true,
          value: {
            acknowledgedOperationIds: operations.map(
              (operation) => operation.operationId
            ),
            conflicts: [],
            cursor: {
              cursorVersion: 1,
              value: null,
              issuedAt: NOW
            }
          }
        };
      },
      pull: async () => ({
        ok: true,
        value: {
          workspace: {
            householdId: HOUSEHOLD_ID,
            householdName: "Place document household",
            householdVersion: 1,
            householdCreatedAt: NOW,
            membershipId:
              "00000000-0000-4000-8000-000000000310",
            accountId:
              "00000000-0000-4000-8000-000000000311",
            role: "owner",
            membershipVersion: 1
          },
          changes: pulledChanges,
          cursor: {
            cursorVersion: 1,
            value: "2",
            issuedAt: NOW
          }
        }
      })
    };
    const complete = jest.fn(async () => ({
      ok: true as const,
      value: {
        upload: {
          id: BLOB_ID,
          objectKey: `${HOUSEHOLD_ID}/${BLOB_ID}/${VERSION_ID}`,
          status: "stored" as const
        },
        note: "Verified."
      }
    }));
    const uploadPort: EvidenceUploadPort = {
      complete,
      createIntent: jest.fn(),
      upload: jest.fn()
    };

    const result = await reconcileForeground({
      repository,
      transport,
      attachmentStore: {
        kind: "encrypted-files",
        encryptedAtRest: true,
        ingest: async (file) => file,
        materializeForViewing: jest.fn(),
        cleanupMaterialized: jest.fn()
      },
      evidenceUploadPort: uploadPort,
      householdId: HOUSEHOLD_ID,
      now: () => NOW
    });

    expect(result.kind).toBe("synced");
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        evidenceId: EVIDENCE_ID,
        evidenceVersionId: VERSION_ID,
        blobId: BLOB_ID
      }),
      BLOB_ID
    );
    expect(pushed.map((operation) => operation.command.type)).toEqual([
      "place-document.create",
      "place-document.version.add"
    ]);
    expect(await repository.listPendingOperations(10)).toEqual([]);
    expect(
      ((await repository.load()).snapshot as NativeWorkspace)
        .placeDocuments?.[0]
    ).toMatchObject({
      version: 2,
      documentVersionNumber: 1,
      localUri: placeDocument.localUri,
      encryptedAtRest: true,
      storageState: "synced"
    });
  });
});
