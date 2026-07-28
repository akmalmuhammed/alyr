import {
  CONTRACT_API_VERSION,
  type ContractError,
  type EvidenceDownloadRequest,
  type ProviderRequestContext,
  type Result
} from "@alyr/contracts";

import {
  AttachmentReadError,
  isVerifiedAttachmentSink,
  type AttachmentStore
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
  runSyncProviderBoundary,
  type SyncExecutionControl
} from "@/data/syncExecution";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CHECKSUM_PATTERN = /^[a-f0-9]{64}$/u;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type EvidenceDownloadDescriptor = EvidenceDownloadRequest;

/**
 * User-authenticated, provider-neutral byte boundary. The implementation may
 * resolve any cloud provider behind the reviewed API, but the domain receives
 * only the immutable bytes or a versioned ContractError.
 */
export interface EvidenceDownloadPort {
  download(
    descriptor: EvidenceDownloadDescriptor,
    context?: ProviderRequestContext
  ): Promise<Result<Uint8Array>>;
}

export type EvidenceDownloadReconcileResult =
  | {
      readonly ok: true;
      readonly workspace: NativeWorkspace;
      readonly hydratedEvidenceIds: readonly string[];
    }
  | {
      readonly ok: false;
      readonly workspace: NativeWorkspace;
      readonly hydratedEvidenceIds: readonly string[];
      readonly error: ContractError;
    };

export interface ReconcileEvidenceDownloadsRequest {
  readonly workspace: NativeWorkspace;
  readonly attachmentStore: AttachmentStore;
  readonly downloadPort: EvidenceDownloadPort;
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
  evidence: NativeEvidence | NativePlaceDocument
): EvidenceDownloadDescriptor | ContractError {
  if (
    evidence.householdId !== workspace.household.id ||
    !UUID_PATTERN.test(evidence.householdId) ||
    !UUID_PATTERN.test(evidence.id) ||
    !UUID_PATTERN.test(evidence.versionId) ||
    !UUID_PATTERN.test(evidence.blobObjectId) ||
    !evidence.fileName.trim() ||
    evidence.fileName.length > 255 ||
    /[\/\\\u0000-\u001f]/u.test(evidence.fileName) ||
    !evidence.mimeType.trim() ||
    evidence.mimeType.length > 160 ||
    !Number.isSafeInteger(evidence.byteSize) ||
    evidence.byteSize < 1 ||
    evidence.byteSize > MAX_ATTACHMENT_BYTES ||
    typeof evidence.checksumSha256 !== "string" ||
    !CHECKSUM_PATTERN.test(evidence.checksumSha256)
  ) {
    return failure(
      "INVALID_FILE",
      "The cloud Evidence record has invalid immutable file metadata.",
      false
    );
  }

  return {
    apiVersion: CONTRACT_API_VERSION,
    householdId: evidence.householdId,
    evidenceId: evidence.id,
    evidenceVersionId: evidence.versionId,
    blobId: evidence.blobObjectId,
    fileName: evidence.fileName,
    mimeType: evidence.mimeType,
    byteSize: evidence.byteSize,
    checksumSha256: evidence.checksumSha256
  };
}

function attachmentFailure(caught: unknown): ContractError {
  if (caught instanceof AttachmentReadError) {
    if (
      caught.code === "CHECKSUM_MISMATCH" ||
      caught.code === "SIZE_MISMATCH" ||
      caught.code === "INVALID_REFERENCE"
    ) {
      return failure("INVALID_FILE", caught.message, false);
    }
    return failure("STORAGE_UNAVAILABLE", caught.message, true);
  }
  return failure(
    "STORAGE_UNAVAILABLE",
    "The verified Evidence bytes could not be protected in this device vault.",
    true
  );
}

/**
 * Hydrates every cloud-acknowledged EvidenceVersion missing from this device.
 * Each byte buffer is verified by the HTTP adapter, verified again by the
 * encrypted attachment vault, and only then attached to the workspace that the
 * sync coordinator commits atomically with its cursor.
 */
export async function reconcileEvidenceDownloads(
  request: ReconcileEvidenceDownloadsRequest
): Promise<EvidenceDownloadReconcileResult> {
  const pending: readonly (
    | { readonly kind: "asset-evidence"; readonly id: string }
    | { readonly kind: "place-document"; readonly id: string }
  )[] = [
    ...request.workspace.evidence
      .filter(
        (evidence) =>
          evidence.storageState === "synced" &&
          evidence.localUri === null
      )
      .map((evidence) => ({
        kind: "asset-evidence" as const,
        id: evidence.id
      })),
    ...(request.workspace.placeDocuments ?? [])
      .filter(
        (document) =>
          document.storageState === "synced" &&
          document.localUri === null
      )
      .map((document) => ({
        kind: "place-document" as const,
        id: document.id
      }))
  ];
  if (pending.length === 0) {
    return {
      ok: true,
      workspace: request.workspace,
      hydratedEvidenceIds: []
    };
  }
  if (!isVerifiedAttachmentSink(request.attachmentStore)) {
    return {
      ok: false,
      workspace: request.workspace,
      hydratedEvidenceIds: [],
      error: failure(
        "STORAGE_UNAVAILABLE",
        "The encrypted Evidence download vault is not available.",
        true
      )
    };
  }
  const attachmentSink = request.attachmentStore;

  let workspace = request.workspace;
  const hydratedEvidenceIds: string[] = [];
  for (const pendingAttachment of pending) {
    assertSyncExecutionActive(request.execution);
    const current:
      | NativeEvidence
      | NativePlaceDocument
      | undefined =
      pendingAttachment.kind === "asset-evidence"
        ? workspace.evidence.find(
            (evidence) => evidence.id === pendingAttachment.id
          )
        : (workspace.placeDocuments ?? []).find(
            (document) => document.id === pendingAttachment.id
          );
    if (!current || current.localUri !== null) continue;

    const descriptor = descriptorFor(workspace, current);
    if ("errorVersion" in descriptor) {
      return {
        ok: false,
        workspace,
        hydratedEvidenceIds,
        error: descriptor
      };
    }

    const downloaded = await runSyncProviderBoundary(
      request.execution,
      (context) => request.downloadPort.download(descriptor, context)
    );
    if (!downloaded.ok) {
      return {
        ok: false,
        workspace,
        hydratedEvidenceIds,
        error: downloaded.error
      };
    }

    const plaintext = downloaded.value;
    try {
      assertSyncExecutionActive(request.execution);
      const protectedFile = await runSyncLocalBoundary(
        request.execution,
        () =>
          attachmentSink.ingestVerifiedBytes({
            bytes: plaintext,
            fileName: descriptor.fileName,
            mimeType: descriptor.mimeType,
            byteSize: descriptor.byteSize,
            checksumSha256: descriptor.checksumSha256
          })
      );
      const protectedUri = protectedFile.protectedUri;
      if (
        !protectedFile.encryptedAtRest ||
        !protectedUri ||
        protectedFile.localUri !== protectedUri ||
        protectedFile.byteSize !== descriptor.byteSize ||
        protectedFile.checksumSha256?.toLowerCase() !==
          descriptor.checksumSha256
      ) {
        return {
          ok: false,
          workspace,
          hydratedEvidenceIds,
          error: failure(
            "STORAGE_UNAVAILABLE",
            "The device vault did not confirm the protected Evidence file.",
            true
          )
        };
      }

      workspace = {
        ...workspace,
        ...(pendingAttachment.kind === "asset-evidence"
          ? {
              evidence: workspace.evidence.map((evidence) =>
                evidence.id === current.id
                  ? { ...evidence, localUri: protectedUri }
                  : evidence
              ),
              assets: workspace.assets.map((asset) =>
                asset.photoEvidenceId === current.id
                  ? {
                      ...asset,
                      photoUri: protectedUri,
                      photoProtectedUri: protectedUri,
                      photoChecksumSha256:
                        descriptor.checksumSha256
                    }
                  : asset
              )
            }
          : {
              placeDocuments: (workspace.placeDocuments ?? []).map(
                (document) =>
                  document.id === current.id
                    ? {
                        ...document,
                        localUri: protectedUri,
                        encryptedAtRest: true
                      }
                    : document
              )
            })
      };
      hydratedEvidenceIds.push(current.id);
    } catch (caught) {
      if (isSyncExecutionCancelled(caught)) throw caught;
      return {
        ok: false,
        workspace,
        hydratedEvidenceIds,
        error: attachmentFailure(caught)
      };
    } finally {
      plaintext.fill(0);
    }
  }

  return {
    ok: true,
    workspace,
    hydratedEvidenceIds
  };
}
