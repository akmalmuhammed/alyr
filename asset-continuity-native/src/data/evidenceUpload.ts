import type {
  ContractError,
  ProviderRequestContext,
  Result,
  SyncOperation,
  UploadCompletionResponse,
  UploadIntentRequest,
  UploadIntentResponse
} from "@alyr/contracts";

import type {
  AttachmentStore,
  MaterializedAttachment
} from "@/data/attachmentStore";
import type {
  NativeEvidence,
  NativePlaceDocument,
  NativeWorkspace
} from "@/domain/model";
import {
  assertSyncExecutionActive,
  isSyncExecutionCancelled,
  runSyncLocalBoundary,
  runSyncLocalCleanupBoundary,
  runSyncProviderBoundary,
  type SyncExecutionControl
} from "@/data/syncExecution";

const CHECKSUM_PATTERN = /^[a-f0-9]{64}$/u;
const EXPIRY_SAFETY_WINDOW_MS = 5_000;

export type EvidenceUploadDescriptor = UploadIntentRequest;

export interface EvidenceUploadTransfer {
  readonly outcome: "uploaded" | "already-present";
}

/**
 * User-scoped upload boundary. Implementations obtain a fresh account bearer
 * for the API calls and use only the short-lived signed storage target for the
 * byte transfer. A service-role credential is never part of this interface.
 */
export interface EvidenceUploadPort {
  createIntent(
    descriptor: EvidenceUploadDescriptor,
    context?: ProviderRequestContext
  ): Promise<Result<UploadIntentResponse>>;
  upload(
    descriptor: EvidenceUploadDescriptor,
    intent: UploadIntentResponse,
    attachment: MaterializedAttachment,
    context?: ProviderRequestContext
  ): Promise<Result<EvidenceUploadTransfer>>;
  complete(
    descriptor: EvidenceUploadDescriptor,
    uploadId: string,
    context?: ProviderRequestContext
  ): Promise<Result<UploadCompletionResponse>>;
}

export type EvidenceUploadReconcileResult =
  | {
      readonly ok: true;
      readonly storedBlobObjectIds: ReadonlySet<string>;
      readonly attemptedBlobObjectIds: readonly string[];
    }
  | {
      readonly ok: false;
      readonly error: ContractError;
      readonly storedBlobObjectIds: ReadonlySet<string>;
      readonly attemptedBlobObjectIds: readonly string[];
    };

export interface ReconcileEvidenceUploadsRequest {
  readonly workspace: NativeWorkspace;
  readonly operations: readonly SyncOperation[];
  readonly attachmentStore: AttachmentStore;
  readonly uploadPort: EvidenceUploadPort;
  /**
   * Last-moment background-task gate. It is checked synchronously immediately
   * before protected bytes are decrypted into a temporary file.
   */
  readonly canMaterializeProtectedAttachment?: () => boolean;
  readonly now?: () => string;
  readonly execution?: SyncExecutionControl;
}

function failure(
  code: ContractError["code"],
  message: string,
  retryable: boolean
): ContractError {
  return {
    errorVersion: 1,
    code,
    message,
    retryable
  };
}

function descriptorFor(
  workspace: NativeWorkspace,
  operation: SyncOperation,
  blobObjectId: string
):
  | {
      readonly descriptor: EvidenceUploadDescriptor;
      readonly attachment: NativeEvidence | NativePlaceDocument;
    }
  | ContractError {
  const payload = operation.command.payload;
  const isAssetEvidence =
    operation.command.type === "evidence.version.add";
  const isPlaceDocument =
    operation.command.type === "place-document.version.add";
  const evidenceId = isAssetEvidence
    ? payload.evidenceId
    : payload.placeDocumentId;
  const payloadBlobObjectId = payload.blobObjectId;
  const fileName = payload.fileName;
  const mimeType = payload.mimeType;
  const byteSize = payload.byteSize;
  const checksumSha256 = payload.checksumSha256;
  const evidenceVersionId = operation.command.aggregateId;
  if (
    (!isAssetEvidence && !isPlaceDocument) ||
    operation.householdId !== workspace.household.id ||
    operation.command.householdId !== workspace.household.id ||
    typeof evidenceId !== "string" ||
    typeof payloadBlobObjectId !== "string" ||
    payloadBlobObjectId !== blobObjectId ||
    typeof evidenceVersionId !== "string" ||
    typeof fileName !== "string" ||
    !fileName.trim() ||
    typeof mimeType !== "string" ||
    !mimeType.trim() ||
    typeof byteSize !== "number" ||
    !Number.isSafeInteger(byteSize) ||
    byteSize < 1 ||
    byteSize > 10 * 1024 * 1024 ||
    typeof checksumSha256 !== "string" ||
    !CHECKSUM_PATTERN.test(checksumSha256)
  ) {
    return failure(
      "INVALID_FILE",
      "A queued protected attachment has invalid or mismatched metadata.",
      false
    );
  }

  const attachment: NativeEvidence | NativePlaceDocument | undefined =
    isAssetEvidence
      ? workspace.evidence.find(
          (candidate) => candidate.id === evidenceId
        )
      : (workspace.placeDocuments ?? []).find(
          (candidate) => candidate.id === evidenceId
        );
  if (
    !attachment ||
    attachment.householdId !== workspace.household.id ||
    attachment.versionId !== evidenceVersionId ||
    attachment.blobObjectId !== blobObjectId ||
    attachment.fileName !== fileName ||
    attachment.mimeType !== mimeType ||
    attachment.byteSize !== byteSize ||
    attachment.checksumSha256 !== checksumSha256 ||
    !attachment.localUri
  ) {
    return failure(
      "INVALID_FILE",
      "The queued upload does not match its protected local record.",
      false
    );
  }

  return {
    attachment,
    descriptor: {
      apiVersion: 1,
      householdId: workspace.household.id,
      evidenceId,
      evidenceVersionId,
      blobId: blobObjectId,
      fileName,
      mimeType,
      byteSize,
      checksumSha256
    }
  };
}

function canPrepareAfter(error: ContractError): boolean {
  return (
    error.code === "NOT_FOUND" ||
    (error.code === "STORAGE_UNAVAILABLE" && error.retryable)
  );
}

function validIntent(
  descriptor: EvidenceUploadDescriptor,
  intent: UploadIntentResponse,
  now: string
): ContractError | null {
  const expectedObjectKey =
    `${descriptor.householdId}/${descriptor.blobId}/` +
    descriptor.evidenceVersionId;
  const provider = intent.uploadTarget.provider;
  const bucket = intent.uploadTarget.bucket;
  const objectKey = intent.uploadTarget.objectKey;
  const path = intent.uploadTarget.path;
  const token = intent.uploadTarget.token;
  const expiresAt = Date.parse(intent.expiresAt);
  const currentTime = Date.parse(now);
  if (
    intent.uploadId !== descriptor.blobId ||
    intent.blobObjectId !== descriptor.blobId ||
    provider !== "supabase-storage" ||
    bucket !== "evidence" ||
    objectKey !== expectedObjectKey ||
    path !== expectedObjectKey ||
    typeof token !== "string" ||
    token.length < 16 ||
    !Number.isFinite(expiresAt) ||
    !Number.isFinite(currentTime)
  ) {
    return failure(
      "VALIDATION_FAILED",
      "The upload service returned an invalid signed target.",
      false
    );
  }
  if (expiresAt - currentTime <= EXPIRY_SAFETY_WINDOW_MS) {
    return failure(
      "STORAGE_UNAVAILABLE",
      "The signed upload target expired before transfer. ALYR will request a fresh target.",
      true
    );
  }
  return null;
}

async function cleanupTemporary(
  store: AttachmentStore,
  attachment: MaterializedAttachment
): Promise<ContractError | null> {
  try {
    await store.cleanupMaterialized(attachment);
    return null;
  } catch {
    return failure(
      "STORAGE_UNAVAILABLE",
      "The temporary decrypted upload file could not be removed.",
      false
    );
  }
}

/**
 * Reconciles each unique `blob-stored` prerequisite before the command outbox
 * is pushed. The existing operation UUIDs and Blob UUIDs are the durable
 * retry/idempotency ledger:
 *
 * 1. Complete first, so a lost acknowledgement/process death never uploads a
 *    duplicate.
 * 2. Materialize only a signed-build encrypted attachment.
 * 3. Create a short-lived target, transfer, then require server checksum/size
 *    confirmation.
 * 4. Delete plaintext cache bytes in every transfer outcome.
 */
export async function reconcileEvidenceUploads(
  request: ReconcileEvidenceUploadsRequest
): Promise<EvidenceUploadReconcileResult> {
  const storedBlobObjectIds = new Set<string>();
  const attemptedBlobObjectIds: string[] = [];
  const versionOperations = new Map<string, SyncOperation>();

  for (const operation of request.operations) {
    if (
      operation.command.type !== "evidence.version.add" &&
      operation.command.type !== "place-document.version.add"
    ) {
      continue;
    }
    for (const prerequisite of operation.prerequisites) {
      if (
        prerequisite.kind === "blob-stored" &&
        !versionOperations.has(prerequisite.blobObjectId)
      ) {
        versionOperations.set(prerequisite.blobObjectId, operation);
      }
    }
  }

  for (const [blobObjectId, operation] of versionOperations) {
    assertSyncExecutionActive(request.execution);
    attemptedBlobObjectIds.push(blobObjectId);
    const resolved = descriptorFor(
      request.workspace,
      operation,
      blobObjectId
    );
    if ("code" in resolved) {
      return {
        ok: false,
        error: resolved,
        storedBlobObjectIds,
        attemptedBlobObjectIds
      };
    }
    const { descriptor, attachment: protectedRecord } = resolved;

    // Completion is idempotent and authoritative. This probe reconciles a
    // previous transfer whose response was lost or whose process was killed.
    const existing = await runSyncProviderBoundary(
      request.execution,
      (context) =>
        request.uploadPort.complete(
          descriptor,
          descriptor.blobId,
          context
        )
    );
    if (existing.ok) {
      storedBlobObjectIds.add(blobObjectId);
      continue;
    }
    if (!canPrepareAfter(existing.error)) {
      return {
        ok: false,
        error: existing.error,
        storedBlobObjectIds,
        attemptedBlobObjectIds
      };
    }

    if (
      request.attachmentStore.kind !== "encrypted-files" ||
      !request.attachmentStore.encryptedAtRest
    ) {
      return {
        ok: false,
        error: failure(
          "INVALID_FILE",
          "Cloud Evidence upload requires the signed encrypted attachment vault.",
          false
        ),
        storedBlobObjectIds,
        attemptedBlobObjectIds
      };
    }

    let materializationAllowed = true;
    try {
      materializationAllowed =
        request.canMaterializeProtectedAttachment?.() ?? true;
    } catch {
      materializationAllowed = false;
    }
    if (!materializationAllowed) {
      return {
        ok: false,
        error: failure(
          "OFFLINE",
          "The background execution window ended before protected Evidence could be prepared.",
          true
        ),
        storedBlobObjectIds,
        attemptedBlobObjectIds
      };
    }

    let attachment: MaterializedAttachment;
    try {
      attachment = await runSyncLocalBoundary(
        request.execution,
        () =>
          request.attachmentStore.materializeForViewing({
            storage: "encrypted",
            protectedUri: protectedRecord.localUri!,
            fileName: descriptor.fileName,
            mimeType: descriptor.mimeType,
            byteSize: descriptor.byteSize,
            checksumSha256: descriptor.checksumSha256
          })
      );
    } catch (caught) {
      if (isSyncExecutionCancelled(caught)) throw caught;
      return {
        ok: false,
        error: failure(
          "INVALID_FILE",
          "The protected Evidence file failed local integrity verification.",
          false
        ),
        storedBlobObjectIds,
        attemptedBlobObjectIds
      };
    }

    let transferError: ContractError | null = null;
    try {
      if (
        !attachment.temporary ||
        attachment.integrity !== "aes-gcm-and-sha256" ||
        attachment.byteSize !== descriptor.byteSize ||
        attachment.checksumSha256 !== descriptor.checksumSha256
      ) {
        transferError = failure(
          "INVALID_FILE",
          "The decrypted Evidence bytes do not match their capture record.",
          false
        );
      } else {
        const intent = await runSyncProviderBoundary(
          request.execution,
          (context) =>
            request.uploadPort.createIntent(descriptor, context)
        );
        if (!intent.ok) {
          transferError = intent.error;
        } else {
          const intentError = validIntent(
            descriptor,
            intent.value,
            request.now?.() ?? new Date().toISOString()
          );
          if (intentError) {
            transferError = intentError;
          } else {
            const uploaded = await runSyncProviderBoundary(
              request.execution,
              (context) =>
                request.uploadPort.upload(
                  descriptor,
                  intent.value,
                  attachment,
                  context
                )
            );
            if (!uploaded.ok) {
              transferError = uploaded.error;
            } else {
              const completed = await runSyncProviderBoundary(
                request.execution,
                (context) =>
                  request.uploadPort.complete(
                    descriptor,
                    intent.value.uploadId,
                    context
                  )
              );
              if (!completed.ok) {
                transferError = completed.error;
              }
            }
          }
        }
      }
    } finally {
      const cleanupError = await runSyncLocalCleanupBoundary(
        request.execution,
        () =>
          cleanupTemporary(
            request.attachmentStore,
            attachment
          )
      );
      if (cleanupError) transferError = cleanupError;
    }

    if (transferError) {
      return {
        ok: false,
        error: transferError,
        storedBlobObjectIds,
        attemptedBlobObjectIds
      };
    }
    storedBlobObjectIds.add(blobObjectId);
  }

  return {
    ok: true,
    storedBlobObjectIds,
    attemptedBlobObjectIds
  };
}
