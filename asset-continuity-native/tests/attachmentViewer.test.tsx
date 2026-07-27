import {
  createAttachmentReadRequest,
  openAttachmentViewSession,
  resolveAttachmentStoreForViewing,
  shareEvidenceAttachment,
} from "@/components/AttachmentViewer";
import {
  AttachmentReadError,
  type AttachmentReadRequest,
  type AttachmentStore,
  type MaterializedAttachment
} from "@/data/attachmentStore";
import type { NativeEvidence } from "@/domain/model";

const evidence: NativeEvidence = {
  id: "evidence-1",
  version: 1,
  versionId: "version-1",
  blobObjectId: "blob-1",
  householdId: "household-1",
  assetId: "asset-1",
  kind: "paper",
  relation: "identity",
  fileName: "ownership-record.pdf",
  mimeType: "application/pdf",
  byteSize: 240,
  localUri: "file:///document/ownership-record.alyrblob",
  checksumSha256: "a".repeat(64),
  reviewStatus: "pending",
  reviewedAt: null,
  storageState: "on-device",
  capturedAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z"
};

function attachment(
  uri: string,
  temporary: boolean
): MaterializedAttachment {
  return {
    uri,
    fileName: evidence.fileName,
    mimeType: evidence.mimeType,
    byteSize: evidence.byteSize,
    checksumSha256: temporary ? evidence.checksumSha256 : null,
    integrity: temporary
      ? "aes-gcm-and-sha256"
      : "unverified-preview",
    temporary
  };
}

function attachmentStore(
  result: MaterializedAttachment,
  encryptedAtRest: boolean
): AttachmentStore & {
  readonly materializeForViewing: jest.Mock<
    Promise<MaterializedAttachment>,
    [AttachmentReadRequest]
  >;
  readonly cleanupMaterialized: jest.Mock<
    Promise<void>,
    [MaterializedAttachment]
  >;
} {
  return {
    kind: encryptedAtRest ? "encrypted-files" : "memory-preview",
    encryptedAtRest,
    ingest: jest.fn(async (file) => file),
    materializeForViewing: jest.fn(
      async (_request: AttachmentReadRequest) => result
    ),
    cleanupMaterialized: jest.fn(
      async (_attachment: MaterializedAttachment) => undefined
    )
  };
}

describe("Asset Passport attachment viewer", () => {
  it("treats explicit null as a locked vault and preserves an injected scoped store", () => {
    const scopedStore = attachmentStore(
      attachment("file:///scoped/verified-proof.pdf", true),
      true
    );

    expect(resolveAttachmentStoreForViewing(scopedStore)).toBe(scopedStore);

    try {
      resolveAttachmentStoreForViewing(null);
      throw new Error("Expected the locked attachment vault to reject access.");
    } catch (error) {
      expect(error).toBeInstanceOf(AttachmentReadError);
      expect((error as AttachmentReadError).code).toBe("VAULT_LOCKED");
    }
  });

  it("uses Evidence metadata and repository encryption state for read requests", () => {
    expect(
      createAttachmentReadRequest({
        evidence,
        encryptedAtRest: true,
        encryptedUri: "file:///document/primary-photo.alyrblob"
      })
    ).toEqual({
      storage: "encrypted",
      protectedUri: "file:///document/primary-photo.alyrblob",
      fileName: evidence.fileName,
      mimeType: evidence.mimeType,
      byteSize: evidence.byteSize,
      checksumSha256: evidence.checksumSha256
    });

    expect(
      createAttachmentReadRequest({
        evidence: {
          ...evidence,
          localUri: "file:///preview/ownership-record.pdf"
        },
        encryptedAtRest: false
      })
    ).toEqual({
      storage: "plaintext-preview",
      localUri: "file:///preview/ownership-record.pdf",
      fileName: evidence.fileName,
      mimeType: evidence.mimeType,
      byteSize: evidence.byteSize
    });
  });

  it("opens a signed-build photo session and cleans it when the view closes", async () => {
    const materialized = attachment(
      "file:///cache/alyr-materialized/alyr-view-photo.jpg",
      true
    );
    const store = attachmentStore(materialized, true);
    const session = await openAttachmentViewSession(
      {
        encryptedAtRest: true,
        encryptedUri:
          "file:///document/alyr-attachments/primary-photo.alyrblob",
        evidence: {
          ...evidence,
          fileName: "primary-photo.jpg",
          mimeType: "image/jpeg"
        }
      },
      store
    );

    expect(session.attachment.uri).toBe(materialized.uri);
    expect(store.materializeForViewing).toHaveBeenCalledWith(
      expect.objectContaining({
        storage: "encrypted",
        protectedUri:
          "file:///document/alyr-attachments/primary-photo.alyrblob",
        checksumSha256: evidence.checksumSha256
      })
    );

    await session.close();
    await session.close();
    expect(store.cleanupMaterialized).toHaveBeenCalledTimes(1);
    expect(store.cleanupMaterialized).toHaveBeenCalledWith(materialized);
  });

  it("opens an Expo Go plaintext photo without inventing encryption", async () => {
    const materialized = attachment("file:///preview/primary-photo.jpg", false);
    const store = attachmentStore(materialized, false);
    const session = await openAttachmentViewSession(
      {
        encryptedAtRest: false,
        evidence: {
          ...evidence,
          fileName: "primary-photo.jpg",
          mimeType: "image/jpeg",
          localUri: materialized.uri,
          checksumSha256: null
        },
        previewUri: materialized.uri
      },
      store
    );

    expect(session.attachment.uri).toBe(materialized.uri);
    expect(store.materializeForViewing).toHaveBeenCalledWith(
      expect.objectContaining({
        storage: "plaintext-preview",
        localUri: materialized.uri
      })
    );

    await session.close();
    expect(store.cleanupMaterialized).toHaveBeenCalledWith(materialized);
  });

  it("always cleans a materialized proof when the share action fails", async () => {
    const materialized = attachment(
      "file:///cache/alyr-materialized/alyr-view-proof.pdf",
      true
    );
    const store = attachmentStore(materialized, true);
    const share = jest.fn(async () => {
      throw new Error("share interrupted");
    });

    await expect(
      shareEvidenceAttachment(evidence, true, {
        store,
        isSharingAvailable: jest.fn(async () => true),
        share
      })
    ).rejects.toThrow("share interrupted");

    expect(share).toHaveBeenCalledWith(materialized.uri, {
      dialogTitle: `Open ${evidence.fileName}`,
      mimeType: evidence.mimeType
    });
    expect(store.cleanupMaterialized).toHaveBeenCalledWith(materialized);
  });
});
