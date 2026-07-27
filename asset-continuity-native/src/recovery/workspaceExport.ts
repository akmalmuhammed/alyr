import type { ScopedAttachmentStore } from "@/data/attachmentStore";
import type {
  RecoveryAttachmentRestoreAdapter,
  RecoveryAttachmentRestoreSession
} from "./atomicRestore";
import type {
  NativeEvidence,
  NativePlaceDocument,
  NativeWorkspace
} from "@/domain/model";
import { RECOVERY_KIT_LIMITS } from "./container";
import {
  type CreateRecoveryKitRequest,
  type RecoveryAttachmentSource,
  type RecoveryProtectedAttachmentReadPort,
  RecoveryKitError
} from "./types";
import type { RecoveryRestoreMetadata } from "./types";

export interface RecoveryCapableAttachmentStore
  extends ScopedAttachmentStore,
    RecoveryProtectedAttachmentReadPort {
  protectedAttachmentByteSize(reference: string): Promise<number>;
  readAttachmentVaultKeyForRecovery(): Promise<Uint8Array | null>;
}

export interface RecoveryRestorableAttachmentStore
  extends RecoveryCapableAttachmentStore {
  beginRecoveryAttachmentRestore(
    metadata: RecoveryRestoreMetadata
  ): Promise<RecoveryAttachmentRestoreSession>;
}

export function isRecoveryCapableAttachmentStore(
  store: ScopedAttachmentStore | null
): store is RecoveryCapableAttachmentStore {
  if (!store || !store.encryptedAtRest) return false;
  const candidate = store as Partial<RecoveryCapableAttachmentStore>;
  return (
    typeof candidate.readProtectedAttachment === "function" &&
    typeof candidate.protectedAttachmentByteSize === "function" &&
    typeof candidate.readAttachmentVaultKeyForRecovery === "function"
  );
}

export function asRecoveryAttachmentRestoreAdapter(
  store: RecoveryCapableAttachmentStore
): RecoveryAttachmentRestoreAdapter | null {
  const candidate = store as Partial<RecoveryRestorableAttachmentStore>;
  if (typeof candidate.beginRecoveryAttachmentRestore !== "function") {
    return null;
  }
  return {
    begin: (metadata) =>
      candidate.beginRecoveryAttachmentRestore!(metadata)
  };
}

function evidenceSource(
  evidence: NativeEvidence,
  protectedByteSize: number
): RecoveryAttachmentSource {
  if (
    !evidence.localUri ||
    !evidence.checksumSha256 ||
    evidence.byteSize < 0
  ) {
    throw new RecoveryKitError(
      "RESTORE_REJECTED",
      `Proof “${evidence.fileName}” is not fully available on this device.`
    );
  }
  return {
    id: evidence.blobObjectId,
    evidenceId: evidence.id,
    protectedReference: evidence.localUri,
    protectedByteSize,
    fileName: evidence.fileName,
    mimeType: evidence.mimeType,
    plaintextByteSize: evidence.byteSize,
    plaintextChecksumSha256: evidence.checksumSha256
  };
}

function placeDocumentSource(
  document: NativePlaceDocument,
  protectedByteSize: number
): RecoveryAttachmentSource {
  if (!document.localUri || !document.checksumSha256) {
    throw new RecoveryKitError(
      "RESTORE_REJECTED",
      `Place document “${document.fileName}” is not fully available on this device.`
    );
  }
  return {
    id: document.blobObjectId,
    evidenceId: `place-document:${document.id}`,
    protectedReference: document.localUri,
    protectedByteSize,
    fileName: document.fileName,
    mimeType: document.mimeType,
    plaintextByteSize: document.byteSize,
    plaintextChecksumSha256: document.checksumSha256
  };
}

function assertNoConflictingDuplicate(
  previous: RecoveryAttachmentSource,
  next: RecoveryAttachmentSource
): void {
  if (
    previous.protectedReference !== next.protectedReference ||
    previous.protectedByteSize !== next.protectedByteSize ||
    previous.plaintextByteSize !== next.plaintextByteSize ||
    previous.plaintextChecksumSha256 !== next.plaintextChecksumSha256
  ) {
    throw new RecoveryKitError(
      "CORRUPT_CONTAINER",
      "Two proof records disagree about the same protected blob."
    );
  }
}

/**
 * Builds a complete portable snapshot or fails closed. A Recovery Kit never
 * silently omits an on-device proof record while leaving its metadata behind.
 */
export async function buildRecoveryKitRequest(
  workspace: NativeWorkspace,
  createdAt: string,
  store: RecoveryCapableAttachmentStore
): Promise<CreateRecoveryKitRequest> {
  const byBlob = new Map<string, RecoveryAttachmentSource>();
  for (const evidence of workspace.evidence) {
    if (!evidence.localUri) {
      throw new RecoveryKitError(
        "RESTORE_REJECTED",
        `Proof “${evidence.fileName}” must be downloaded before creating a complete Recovery Kit.`
      );
    }
    const protectedByteSize =
      await store.protectedAttachmentByteSize(evidence.localUri);
    const source = evidenceSource(evidence, protectedByteSize);
    const previous = byBlob.get(source.id);
    if (previous) assertNoConflictingDuplicate(previous, source);
    else byBlob.set(source.id, source);
  }
  for (const document of workspace.placeDocuments ?? []) {
    if (!document.localUri) {
      throw new RecoveryKitError(
        "RESTORE_REJECTED",
        `Place document “${document.fileName}” must be downloaded before creating a complete Recovery Kit.`
      );
    }
    const protectedByteSize =
      await store.protectedAttachmentByteSize(document.localUri);
    const source = placeDocumentSource(document, protectedByteSize);
    const previous = byBlob.get(source.id);
    if (previous) assertNoConflictingDuplicate(previous, source);
    else byBlob.set(source.id, source);
  }
  const attachments = [...byBlob.values()];
  if (attachments.length > RECOVERY_KIT_LIMITS.maxAttachmentCount) {
    throw new RecoveryKitError(
      "LIMIT_EXCEEDED",
      "This household has more protected files than one pilot Recovery Kit can contain."
    );
  }

  const attachmentVaultKey =
    attachments.length > 0
      ? await store.readAttachmentVaultKeyForRecovery()
      : null;
  if (attachments.length > 0 && !attachmentVaultKey) {
    throw new RecoveryKitError(
      "RESTORE_REJECTED",
      "The attachment vault key is unavailable, so a portable kit was not created."
    );
  }

  return {
    workspace,
    workspaceSchemaVersion: workspace.schemaVersion,
    createdAt,
    attachmentVaultKey,
    attachments
  };
}
