import type {
  ContractError,
  SyncChange,
  SyncCursor,
  SyncTransport,
  WorkspaceBootstrapDescriptor
} from "@alyr/contracts";

import type {
  AttachmentStore,
  VerifiedAttachmentSink
} from "@/data/attachmentStore";
import type { EvidenceDownloadPort } from "@/data/evidenceDownload";
import { reconcileForeground } from "@/data/foregroundSync";
import { MemoryWorkspaceRepository } from "@/data/memoryRepository";
import type { NativeWorkspace } from "@/domain/model";

const NOW = "2026-07-27T16:00:00.000Z";
const HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000701";
const ACCOUNT_ID = "00000000-0000-4000-8000-000000000702";
const MEMBERSHIP_ID = "00000000-0000-4000-8000-000000000703";
const DEVICE_ID = "00000000-0000-4000-8000-000000000704";
const ASSET_ID = "00000000-0000-4000-8000-000000000705";
const EVIDENCE_ID = "00000000-0000-4000-8000-000000000706";
const VERSION_ID = "00000000-0000-4000-8000-000000000707";
const BLOB_ID = "00000000-0000-4000-8000-000000000708";
const CHECKSUM = "c".repeat(64);
const CLOUD_BYTES = new Uint8Array([65, 76, 89, 82]);
const PROTECTED_URI =
  `file:///document/alyr-auth-vault/${CHECKSUM}.alyrblob`;
const NEXT_VERSION_ID = "00000000-0000-4000-8000-000000000709";
const NEXT_BLOB_ID = "00000000-0000-4000-8000-000000000710";
const NEXT_CHECKSUM = "d".repeat(64);
const NEXT_CLOUD_BYTES = new Uint8Array([82, 89, 76, 65]);
const NEXT_PROTECTED_URI =
  `file:///document/alyr-auth-vault/${NEXT_CHECKSUM}.alyrblob`;
const PLACE_ID = "00000000-0000-4000-8000-000000000711";
const PLACE_DOCUMENT_ID =
  "00000000-0000-4000-8000-000000000712";
const PLACE_DOCUMENT_VERSION_ID =
  "00000000-0000-4000-8000-000000000713";
const PLACE_DOCUMENT_BLOB_ID =
  "00000000-0000-4000-8000-000000000714";

function cursor(value: number): SyncCursor {
  return {
    cursorVersion: 1,
    value: String(value),
    issuedAt: NOW
  };
}

function bootstrap(): WorkspaceBootstrapDescriptor {
  return {
    householdId: HOUSEHOLD_ID,
    householdName: "Evidence household",
    householdVersion: 1,
    householdCreatedAt: NOW,
    membershipId: MEMBERSHIP_ID,
    accountId: ACCOUNT_ID,
    role: "owner",
    membershipVersion: 1
  };
}

function change(
  sequence: number,
  entityType: string,
  entityId: string,
  version: number,
  command: string,
  payload: Record<string, string | number | null>,
  result: Record<string, string | number | null> = {}
): SyncChange {
  return {
    sequence,
    entityType,
    entityId,
    householdId: HOUSEHOLD_ID,
    version,
    tombstoned: false,
    body: {
      operationId: `00000000-0000-4000-8000-0000000008${String(
        sequence
      ).padStart(2, "0")}`,
      command,
      payload,
      result
    },
    changedAt: NOW
  };
}

const changes: readonly SyncChange[] = [
  change(1, "asset", ASSET_ID, 1, "asset.create", {
    name: "Family title",
    categoryId: "documents.legal"
  }),
  change(2, "evidence", EVIDENCE_ID, 1, "evidence.create", {
    assetId: ASSET_ID,
    kind: "paper",
    relation: "ownership",
    title: "ownership.pdf"
  }),
  change(3, "evidence", VERSION_ID, 2, "evidence.version.add", {
    evidenceId: EVIDENCE_ID,
    blobObjectId: BLOB_ID,
    fileName: "ownership.pdf",
    mimeType: "application/pdf",
    byteSize: CLOUD_BYTES.byteLength,
    checksumSha256: CHECKSUM
  })
];

function transport(
  ledger: readonly SyncChange[] = changes
): SyncTransport {
  return {
    push: async () => {
      throw new Error("A clean Evidence restore must not push.");
    },
    pull: async (_householdId, after) => {
      const afterSequence = Number(after.value ?? "0");
      const page = ledger.filter(
        (candidate) => candidate.sequence > afterSequence
      );
      return {
        ok: true,
        value: {
          workspace: bootstrap(),
          changes: page,
          cursor: cursor(page.at(-1)?.sequence ?? afterSequence)
        }
      };
    }
  };
}

function protectedStore(
  expectedBytes = CLOUD_BYTES,
  expectedChecksum = CHECKSUM,
  protectedUri = PROTECTED_URI
): AttachmentStore & VerifiedAttachmentSink {
  return {
    kind: "encrypted-files",
    encryptedAtRest: true,
    ingest: async (file) => file,
    ingestVerifiedBytes: jest.fn(async (request) => {
      expect(request.bytes).toEqual(expectedBytes);
      expect(request.checksumSha256).toBe(expectedChecksum);
      return {
        localUri: protectedUri,
        protectedUri,
        fileName: request.fileName,
        mimeType: request.mimeType,
        byteSize: request.byteSize,
        checksumSha256: request.checksumSha256,
        encryptedAtRest: true
      };
    }),
    materializeForViewing: jest.fn(),
    cleanupMaterialized: jest.fn()
  };
}

function offlineError(): ContractError {
  return {
    errorVersion: 1,
    code: "OFFLINE",
    message: "Evidence bytes are offline.",
    retryable: true
  };
}

describe("clean-device Evidence hydration", () => {
  it("commits the encrypted local reference so restored Evidence opens after restart", async () => {
    const repository = new MemoryWorkspaceRepository();
    await repository.initialize();
    const attachmentStore = protectedStore();
    const downloadPort: EvidenceDownloadPort = {
      download: jest.fn(async () => ({
        ok: true as const,
        value: CLOUD_BYTES.slice()
      }))
    };

    const result = await reconcileForeground({
      repository,
      transport: transport(),
      attachmentStore,
      evidenceDownloadPort: downloadPort,
      householdId: HOUSEHOLD_ID,
      accountId: ACCOUNT_ID,
      deviceId: DEVICE_ID,
      now: () => NOW
    });

    expect(result.kind).toBe("synced");
    const persisted = (await repository.load())
      .snapshot as NativeWorkspace;
    expect(persisted.evidence[0]).toMatchObject({
      id: EVIDENCE_ID,
      versionId: VERSION_ID,
      blobObjectId: BLOB_ID,
      localUri: PROTECTED_URI,
      checksumSha256: CHECKSUM,
      storageState: "synced"
    });
    expect(
      (attachmentStore.ingestVerifiedBytes as jest.Mock).mock.calls
    ).toHaveLength(1);
    expect(await repository.loadSyncState()).toMatchObject({
      cursor: { value: "3" }
    });

    const reopened = (await repository.load()).snapshot as NativeWorkspace;
    expect(Boolean(reopened.evidence[0]?.localUri)).toBe(true);
  });

  it("restores, protects and persists a Place document on a second device", async () => {
    const placeDocumentChanges: readonly SyncChange[] = [
      change(1, "place", PLACE_ID, 1, "place.create", {
        name: "West Bay home",
        addressText: "West Bay, Doha",
        regionLabel: "Doha",
        kind: "property",
        tenure: "owned"
      }),
      change(
        2,
        "place-document",
        PLACE_DOCUMENT_ID,
        1,
        "place-document.create",
        {
          placeId: PLACE_ID,
          kind: "paper",
          relation: "ownership",
          title: "property-title.pdf"
        }
      ),
      change(
        3,
        "place-document",
        PLACE_DOCUMENT_VERSION_ID,
        2,
        "place-document.version.add",
        {
          placeDocumentId: PLACE_DOCUMENT_ID,
          blobObjectId: PLACE_DOCUMENT_BLOB_ID,
          fileName: "property-title.pdf",
          mimeType: "application/pdf",
          byteSize: CLOUD_BYTES.byteLength,
          checksumSha256: CHECKSUM
        },
        { documentVersionNumber: 1 }
      )
    ];
    const repository = new MemoryWorkspaceRepository();
    await repository.initialize();
    const attachmentStore = protectedStore();
    const download = jest.fn(async () => ({
      ok: true as const,
      value: CLOUD_BYTES.slice()
    }));

    const result = await reconcileForeground({
      repository,
      transport: transport(placeDocumentChanges),
      attachmentStore,
      evidenceDownloadPort: { download },
      householdId: HOUSEHOLD_ID,
      accountId: ACCOUNT_ID,
      deviceId: DEVICE_ID,
      now: () => NOW
    });

    expect(result.kind).toBe("synced");
    expect(download).toHaveBeenCalledWith(
      expect.objectContaining({
        householdId: HOUSEHOLD_ID,
        evidenceId: PLACE_DOCUMENT_ID,
        evidenceVersionId: PLACE_DOCUMENT_VERSION_ID,
        blobId: PLACE_DOCUMENT_BLOB_ID,
        checksumSha256: CHECKSUM
      }),
      expect.objectContaining({
        signal: expect.any(Object),
        deadlineAtMs: expect.any(Number)
      })
    );
    const persisted = (await repository.load())
      .snapshot as NativeWorkspace;
    expect(persisted.placeDocuments).toEqual([
      expect.objectContaining({
        id: PLACE_DOCUMENT_ID,
        placeId: PLACE_ID,
        version: 2,
        documentVersionNumber: 1,
        versionId: PLACE_DOCUMENT_VERSION_ID,
        blobObjectId: PLACE_DOCUMENT_BLOB_ID,
        localUri: PROTECTED_URI,
        encryptedAtRest: true,
        storageState: "synced"
      })
    ]);
    expect((await repository.loadSyncState()).cursor.value).toBe("3");

    const reopened = (await repository.load())
      .snapshot as NativeWorkspace;
    expect(reopened.placeDocuments?.[0]?.localUri).toBe(
      PROTECTED_URI
    );
  });

  it("commits cloud metadata after an offline byte attempt and hydrates it on foreground retry", async () => {
    const repository = new MemoryWorkspaceRepository();
    await repository.initialize();
    const attachmentStore = protectedStore();
    const download = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, error: offlineError() })
      .mockResolvedValueOnce({
        ok: true,
        value: CLOUD_BYTES.slice()
      });
    const downloadPort: EvidenceDownloadPort = { download };
    const request = {
      repository,
      transport: transport(),
      attachmentStore,
      evidenceDownloadPort: downloadPort,
      householdId: HOUSEHOLD_ID,
      accountId: ACCOUNT_ID,
      deviceId: DEVICE_ID,
      now: () => NOW
    } as const;

    const interrupted = await reconcileForeground(request);
    const afterInterruption = (await repository.load())
      .snapshot as NativeWorkspace;
    expect(interrupted.kind).toBe("offline");
    expect(afterInterruption.evidence[0]).toMatchObject({
      localUri: null,
      storageState: "synced"
    });
    expect((await repository.loadSyncState()).cursor.value).toBe("3");

    const retried = await reconcileForeground(request);
    const afterRetry = (await repository.load())
      .snapshot as NativeWorkspace;
    expect(retried.kind).toBe("synced");
    expect(afterRetry.evidence[0]?.localUri).toBe(PROTECTED_URI);
    expect(download).toHaveBeenCalledTimes(2);

    await reconcileForeground(request);
    expect(download).toHaveBeenCalledTimes(2);
  });

  it("invalidates an older local copy and hydrates a newer remote EvidenceVersion", async () => {
    const repository = new MemoryWorkspaceRepository();
    await repository.initialize();
    const firstStore = protectedStore();
    const firstDownload: EvidenceDownloadPort = {
      download: async () => ({
        ok: true,
        value: CLOUD_BYTES.slice()
      })
    };
    await reconcileForeground({
      repository,
      transport: transport(),
      attachmentStore: firstStore,
      evidenceDownloadPort: firstDownload,
      householdId: HOUSEHOLD_ID,
      accountId: ACCOUNT_ID,
      deviceId: DEVICE_ID,
      now: () => NOW
    });

    const nextVersion = change(
      4,
      "evidence",
      NEXT_VERSION_ID,
      3,
      "evidence.version.add",
      {
        evidenceId: EVIDENCE_ID,
        blobObjectId: NEXT_BLOB_ID,
        fileName: "ownership-v2.pdf",
        mimeType: "application/pdf",
        byteSize: NEXT_CLOUD_BYTES.byteLength,
        checksumSha256: NEXT_CHECKSUM
      }
    );
    const nextStore = protectedStore(
      NEXT_CLOUD_BYTES,
      NEXT_CHECKSUM,
      NEXT_PROTECTED_URI
    );
    const nextDownload = jest.fn(async () => ({
      ok: true as const,
      value: NEXT_CLOUD_BYTES.slice()
    }));

    const result = await reconcileForeground({
      repository,
      transport: transport([...changes, nextVersion]),
      attachmentStore: nextStore,
      evidenceDownloadPort: { download: nextDownload },
      householdId: HOUSEHOLD_ID,
      accountId: ACCOUNT_ID,
      deviceId: DEVICE_ID,
      now: () => NOW
    });

    expect(result.kind).toBe("synced");
    expect(nextDownload).toHaveBeenCalledTimes(1);
    expect(
      ((await repository.load()).snapshot as NativeWorkspace).evidence[0]
    ).toMatchObject({
      version: 3,
      versionId: NEXT_VERSION_ID,
      blobObjectId: NEXT_BLOB_ID,
      checksumSha256: NEXT_CHECKSUM,
      localUri: NEXT_PROTECTED_URI
    });
  });
});
