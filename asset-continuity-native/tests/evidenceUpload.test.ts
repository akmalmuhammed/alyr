import type {
  ContractError,
  Result,
  UploadCompletionResponse,
  UploadIntentResponse
} from "@alyr/contracts";

import type {
  AttachmentStore,
  MaterializedAttachment
} from "@/data/attachmentStore";
import {
  reconcileEvidenceUploads,
  type EvidenceUploadPort
} from "@/data/evidenceUpload";
import { createLocalOperation } from "@/data/sync";
import type {
  NativeEvidence,
  NativeWorkspace
} from "@/domain/model";
import { createWorkspace } from "@/domain/sample";

const NOW = "2026-07-27T10:00:00.000Z";
const HOUSEHOLD_ID = "00000000-0000-4000-8000-000000000101";
const ASSET_ID = "00000000-0000-4000-8000-000000000102";
const EVIDENCE_ID = "00000000-0000-4000-8000-000000000103";
const VERSION_ID = "00000000-0000-4000-8000-000000000104";
const BLOB_ID = "00000000-0000-4000-8000-000000000105";
const CHECKSUM = "a".repeat(64);
const PROTECTED_URI = "file:///vault/proof.alyrblob";
const TEMPORARY_URI = "file:///cache/alyr-view-proof.pdf";

function errorResult<T>(
  code: ContractError["code"],
  retryable: boolean
): Result<T> {
  return {
    ok: false,
    error: {
      errorVersion: 1,
      code,
      message: `Test ${code}`,
      retryable
    }
  };
}

function completed(): Result<UploadCompletionResponse> {
  return {
    ok: true,
    value: {
      upload: {
        id: BLOB_ID,
        objectKey: `${HOUSEHOLD_ID}/${BLOB_ID}/${VERSION_ID}`,
        status: "stored"
      },
      note: "Verified."
    }
  };
}

function intent(expiresAt = "2026-07-27T10:02:00.000Z"): UploadIntentResponse {
  const objectKey = `${HOUSEHOLD_ID}/${BLOB_ID}/${VERSION_ID}`;
  return {
    uploadId: BLOB_ID,
    blobObjectId: BLOB_ID,
    expiresAt,
    uploadTarget: {
      provider: "supabase-storage",
      bucket: "evidence",
      objectKey,
      path: objectKey,
      token: "signed-upload-token-with-entropy"
    }
  };
}

function fixture() {
  const base = createWorkspace("personal", NOW, {
    householdId: HOUSEHOLD_ID,
    ownerMemberId: "00000000-0000-4000-8000-000000000106",
    deviceId: "00000000-0000-4000-8000-000000000107"
  });
  const evidence: NativeEvidence = {
    id: EVIDENCE_ID,
    version: 1,
    versionId: VERSION_ID,
    blobObjectId: BLOB_ID,
    householdId: HOUSEHOLD_ID,
    assetId: ASSET_ID,
    kind: "paper",
    relation: "ownership",
    fileName: "proof.pdf",
    mimeType: "application/pdf",
    byteSize: 4,
    localUri: PROTECTED_URI,
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
  const operation = createLocalOperation(workspace, {
    type: "evidence.version.add",
    aggregateId: VERSION_ID,
    payload: {
      evidenceId: EVIDENCE_ID,
      blobObjectId: BLOB_ID,
      fileName: "proof.pdf",
      mimeType: "application/pdf",
      byteSize: 4,
      checksumSha256: CHECKSUM
    },
    operationId: "00000000-0000-4000-8000-000000000108",
    idempotencyKey: "00000000-0000-4000-8000-000000000109",
    observedVersion: 0,
    occurredAt: NOW,
    prerequisites: [{ kind: "blob-stored", blobObjectId: BLOB_ID }]
  });
  return { workspace, operation };
}

function attachment(
  overrides: Partial<MaterializedAttachment> = {}
): MaterializedAttachment {
  return {
    uri: TEMPORARY_URI,
    fileName: "proof.pdf",
    mimeType: "application/pdf",
    byteSize: 4,
    checksumSha256: CHECKSUM,
    integrity: "aes-gcm-and-sha256",
    temporary: true,
    ...overrides
  };
}

function store(materialized = attachment()) {
  const materializeForViewing = jest.fn(async () => materialized);
  const cleanupMaterialized = jest.fn(async () => undefined);
  const value: AttachmentStore = {
    kind: "encrypted-files",
    encryptedAtRest: true,
    ingest: jest.fn(async (file) => file),
    materializeForViewing,
    cleanupMaterialized
  };
  return { value, materializeForViewing, cleanupMaterialized };
}

function port(options?: {
  readonly complete?: EvidenceUploadPort["complete"];
  readonly createIntent?: EvidenceUploadPort["createIntent"];
  readonly upload?: EvidenceUploadPort["upload"];
}) {
  const complete = jest.fn(
    options?.complete ??
      (async () => completed())
  );
  const createIntent = jest.fn(
    options?.createIntent ??
      (async () => ({ ok: true as const, value: intent() }))
  );
  const upload = jest.fn(
    options?.upload ??
      (async () => ({
        ok: true as const,
        value: { outcome: "uploaded" as const }
      }))
  );
  const value: EvidenceUploadPort = {
    complete,
    createIntent,
    upload
  };
  return { value, complete, createIntent, upload };
}

describe("durable Evidence upload reconciliation", () => {
  it("materializes, uploads, confirms, and cleans a protected attachment", async () => {
    const { workspace, operation } = fixture();
    const localStore = store();
    let completionCall = 0;
    const cloud = port({
      complete: async () =>
        completionCall++ === 0
          ? errorResult("NOT_FOUND", false)
          : completed()
    });

    const result = await reconcileEvidenceUploads({
      workspace,
      operations: [operation],
      attachmentStore: localStore.value,
      uploadPort: cloud.value,
      now: () => NOW
    });

    expect(result.ok).toBe(true);
    expect([...result.storedBlobObjectIds]).toEqual([BLOB_ID]);
    expect(cloud.createIntent).toHaveBeenCalledTimes(1);
    expect(cloud.upload).toHaveBeenCalledTimes(1);
    expect(cloud.complete).toHaveBeenCalledTimes(2);
    expect(localStore.cleanupMaterialized).toHaveBeenCalledWith(
      expect.objectContaining({ uri: TEMPORARY_URI })
    );
  });

  it("retries with the same durable Blob identity after an offline failure", async () => {
    const { workspace, operation } = fixture();
    const localStore = store();
    let completionCall = 0;
    let intentCall = 0;
    const cloud = port({
      complete: async () => {
        completionCall += 1;
        return completionCall < 3
          ? errorResult("NOT_FOUND", false)
          : completed();
      },
      createIntent: async (descriptor) => {
        intentCall += 1;
        return intentCall === 1
          ? errorResult("OFFLINE", true)
          : { ok: true, value: intent() };
      }
    });

    const first = await reconcileEvidenceUploads({
      workspace,
      operations: [operation],
      attachmentStore: localStore.value,
      uploadPort: cloud.value,
      now: () => NOW
    });
    const second = await reconcileEvidenceUploads({
      workspace,
      operations: [operation],
      attachmentStore: localStore.value,
      uploadPort: cloud.value,
      now: () => NOW
    });

    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.error.code).toBe("OFFLINE");
    expect(second.ok).toBe(true);
    expect(cloud.createIntent.mock.calls.map(([value]) => value.blobId)).toEqual([
      BLOB_ID,
      BLOB_ID
    ]);
    expect(localStore.cleanupMaterialized).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["size", { byteSize: 3 }],
    ["checksum", { checksumSha256: "b".repeat(64) }]
  ] as const)(
    "blocks a local %s mismatch before requesting an upload target",
    async (_label, override) => {
      const { workspace, operation } = fixture();
      const localStore = store(attachment(override));
      const cloud = port({
        complete: async () => errorResult("NOT_FOUND", false)
      });

      const result = await reconcileEvidenceUploads({
        workspace,
        operations: [operation],
        attachmentStore: localStore.value,
        uploadPort: cloud.value,
        now: () => NOW
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_FILE");
      expect(cloud.createIntent).not.toHaveBeenCalled();
      expect(cloud.upload).not.toHaveBeenCalled();
      expect(localStore.cleanupMaterialized).toHaveBeenCalledTimes(1);
    }
  );

  it("rejects an expired signed target without sending plaintext bytes", async () => {
    const { workspace, operation } = fixture();
    const localStore = store();
    const cloud = port({
      complete: async () => errorResult("NOT_FOUND", false),
      createIntent: async () => ({
        ok: true,
        value: intent("2026-07-27T10:00:01.000Z")
      })
    });

    const result = await reconcileEvidenceUploads({
      workspace,
      operations: [operation],
      attachmentStore: localStore.value,
      uploadPort: cloud.value,
      now: () => NOW
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("STORAGE_UNAVAILABLE");
      expect(result.error.retryable).toBe(true);
    }
    expect(cloud.upload).not.toHaveBeenCalled();
    expect(localStore.cleanupMaterialized).toHaveBeenCalledTimes(1);
  });

  it("reconciles an already stored Blob without decrypting or uploading again", async () => {
    const { workspace, operation } = fixture();
    const duplicateOperation = {
      ...operation,
      operationId: "00000000-0000-4000-8000-000000000110"
    };
    const localStore = store();
    const cloud = port();

    const result = await reconcileEvidenceUploads({
      workspace,
      operations: [operation, duplicateOperation],
      attachmentStore: localStore.value,
      uploadPort: cloud.value,
      now: () => NOW
    });

    expect(result.ok).toBe(true);
    expect(cloud.complete).toHaveBeenCalledTimes(1);
    expect(cloud.createIntent).not.toHaveBeenCalled();
    expect(cloud.upload).not.toHaveBeenCalled();
    expect(localStore.materializeForViewing).not.toHaveBeenCalled();
  });

  it("always cleans temporary plaintext after a transfer failure", async () => {
    const { workspace, operation } = fixture();
    const localStore = store();
    const cloud = port({
      complete: async () => errorResult("NOT_FOUND", false),
      upload: async () => errorResult("OFFLINE", true)
    });

    const result = await reconcileEvidenceUploads({
      workspace,
      operations: [operation],
      attachmentStore: localStore.value,
      uploadPort: cloud.value,
      now: () => NOW
    });

    expect(result.ok).toBe(false);
    expect(localStore.cleanupMaterialized).toHaveBeenCalledTimes(1);
  });
});
