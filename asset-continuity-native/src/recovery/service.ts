import {
  createRecoveryKit,
  openRecoveryKit,
  RECOVERY_KIT_LIMITS
} from "./container";
import type {
  CreateRecoveryKitRequest,
  RecoveredKit,
  RecoveryCryptoPort,
  RecoveryKitStoragePort,
  RecoveryKitStoredFile,
  RecoveryProtectedAttachmentReadPort,
  RecoveryRestorePort
} from "./types";
import { RecoveryKitError } from "./types";

export interface StoredRecoveryKit extends RecoveryKitStoredFile {
  readonly sha256: string;
  readonly attachmentCount: number;
}

export async function createAndStoreRecoveryKit(
  request: CreateRecoveryKitRequest,
  passphrase: string,
  ports: {
    readonly crypto: RecoveryCryptoPort;
    readonly attachments: RecoveryProtectedAttachmentReadPort;
    readonly storage: RecoveryKitStoragePort;
  }
): Promise<StoredRecoveryKit> {
  const artifact = await createRecoveryKit(
    request,
    passphrase,
    ports.crypto,
    ports.attachments
  );
  try {
    let stored: RecoveryKitStoredFile;
    try {
      stored = await ports.storage.writeEncryptedKitAtomically({
        bytes: artifact.bytes,
        fileName: artifact.fileName,
        mimeType: artifact.mimeType
      });
    } catch {
      throw new RecoveryKitError(
        "STORAGE_FAILED",
        "Encrypted Recovery Kit could not be written atomically."
      );
    }
    if (
      !stored.reference ||
      stored.fileName !== artifact.fileName ||
      stored.byteSize !== artifact.byteSize
    ) {
      throw new RecoveryKitError(
        "STORAGE_FAILED",
        "Stored Recovery Kit did not match the encrypted artifact."
      );
    }
    return {
      ...stored,
      sha256: artifact.sha256,
      attachmentCount: artifact.attachmentCount
    };
  } finally {
    artifact.bytes.fill(0);
  }
}

export async function readAndOpenRecoveryKit(
  reference: string,
  passphrase: string,
  ports: {
    readonly crypto: RecoveryCryptoPort;
    readonly storage: RecoveryKitStoragePort;
  }
): Promise<RecoveredKit> {
  let bytes: Uint8Array;
  try {
    bytes = await ports.storage.readEncryptedKit(
      reference,
      RECOVERY_KIT_LIMITS.maxEncryptedKitBytes
    );
  } catch {
    throw new RecoveryKitError(
      "STORAGE_FAILED",
      "Encrypted Recovery Kit could not be read."
    );
  }
  if (!(bytes instanceof Uint8Array)) {
    throw new RecoveryKitError(
      "STORAGE_FAILED",
      "Recovery Kit storage returned invalid bytes."
    );
  }
  try {
    return await openRecoveryKit(bytes, passphrase, ports.crypto);
  } finally {
    bytes.fill(0);
  }
}

/**
 * Applies a fully verified kit through an integration-supplied transaction.
 * Workspace replacement is staged last and becomes visible only on `commit`.
 */
export async function restoreRecoveryKitAtomically(
  recovered: RecoveredKit,
  port: RecoveryRestorePort
): Promise<void> {
  let transaction;
  try {
    transaction = await port.begin({
      kitId: recovered.kitId,
      createdAt: recovered.createdAt,
      workspaceSchemaVersion: recovered.workspaceSchemaVersion,
      attachmentCount: recovered.attachments.length
    });
  } catch {
    throw new RecoveryKitError(
      "RESTORE_REJECTED",
      "Recovery Kit restore preflight was rejected."
    );
  }

  try {
    if (recovered.attachmentVaultKey) {
      await transaction.stageAttachmentVaultKey(
        recovered.attachmentVaultKey
      );
    }
    for (const attachment of recovered.attachments) {
      await transaction.stageProtectedAttachment(attachment);
    }
    await transaction.stageWorkspace(
      recovered.workspace,
      recovered.workspaceSchemaVersion
    );
    await transaction.commit();
  } catch {
    try {
      await transaction.rollback();
    } catch {
      // The integration must make rollback idempotent. Avoid replacing the
      // primary failure with implementation details from a second exception.
    }
    throw new RecoveryKitError(
      "RESTORE_REJECTED",
      "Recovery Kit restore did not commit."
    );
  }
}

/** Zeroes recovered secret/binary buffers after the integration has copied them. */
export function disposeRecoveredKit(recovered: RecoveredKit): void {
  recovered.attachmentVaultKey?.fill(0);
  recovered.attachments.forEach((attachment) =>
    attachment.protectedBytes.fill(0)
  );
}
