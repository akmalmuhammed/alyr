import type { CapturedFile } from "@/domain/model";
import {
  assertValidVaultScope,
  DEVICE_PREVIEW_VAULT_SCOPE,
  type VaultScope,
  type VaultScopeId
} from "@/data/vaultScope";
import { File } from "expo-file-system";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type AttachmentReadErrorCode =
  | "INVALID_REFERENCE"
  | "PROTECTED_ATTACHMENT_UNAVAILABLE"
  | "PROTECTED_FILE_MISSING"
  | "KEY_UNAVAILABLE"
  | "DECRYPTION_FAILED"
  | "SIZE_MISMATCH"
  | "CHECKSUM_MISMATCH"
  | "TEMPORARY_FILE_FAILED"
  | "CLEANUP_REJECTED"
  | "VAULT_LOCKED";

export class AttachmentReadError extends Error {
  readonly code: AttachmentReadErrorCode;

  constructor(code: AttachmentReadErrorCode, message: string) {
    super(message);
    this.name = "AttachmentReadError";
    this.code = code;
  }
}

export type AttachmentReadRequest =
  | {
      readonly storage: "encrypted";
      readonly protectedUri: string;
      readonly fileName: string;
      readonly mimeType: string;
      readonly byteSize: number;
      readonly checksumSha256: string | null;
    }
  | {
      readonly storage: "plaintext-preview";
      readonly localUri: string;
      readonly fileName: string;
      readonly mimeType: string;
      readonly byteSize: number;
    };

export interface MaterializedAttachment {
  readonly uri: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly checksumSha256: string | null;
  readonly integrity:
    | "aes-gcm-and-sha256"
    | "aes-gcm-authenticated"
    | "unverified-preview";
  readonly temporary: boolean;
}

export interface AttachmentStore {
  readonly kind: "encrypted-files" | "memory-preview";
  readonly encryptedAtRest: boolean;
  ingest(file: CapturedFile): Promise<CapturedFile>;
  materializeForViewing(
    request: AttachmentReadRequest
  ): Promise<MaterializedAttachment>;
  cleanupMaterialized(attachment: MaterializedAttachment): Promise<void>;
}

export interface VerifiedAttachmentBytesRequest {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly checksumSha256: string;
}

export interface VerifiedAttachmentSink {
  ingestVerifiedBytes(
    request: VerifiedAttachmentBytesRequest
  ): Promise<CapturedFile>;
}

/**
 * Cloud restore is deliberately absent in Expo Go because this preview store
 * does not encrypt persisted files. Keeping the capability guard aligned with
 * the signed implementation lets shared sync code fail closed instead of
 * introducing a plaintext download path.
 */
export function isVerifiedAttachmentSink(
  store: AttachmentStore
): store is AttachmentStore & VerifiedAttachmentSink {
  return (
    store.encryptedAtRest &&
    typeof (store as Partial<VerifiedAttachmentSink>).ingestVerifiedBytes ===
      "function"
  );
}

export interface ScopedAttachmentStore extends AttachmentStore {
  readonly scopeId: VaultScopeId;
  close(): Promise<void>;
  lock(): Promise<void>;
  purge(): Promise<void>;
}

class ExpoGoAttachmentStore implements ScopedAttachmentStore {
  readonly kind = "memory-preview" as const;
  readonly encryptedAtRest = false;
  readonly scopeId: VaultScopeId;
  private locked = false;

  constructor(scope: VaultScope) {
    this.scopeId = assertValidVaultScope(scope).scopeId;
  }

  async ingest(file: CapturedFile): Promise<CapturedFile> {
    this.assertUnlocked();
    let byteSize = file.byteSize;
    try {
      const source = new File(file.localUri);
      if (source.exists) {
        byteSize = source.size;
      }
    } catch {
      // Some picker providers expose a URI that cannot be inspected through
      // expo-file-system. Keep the picker metadata rather than inventing it.
    }

    if (byteSize > MAX_ATTACHMENT_BYTES) {
      throw new Error("Files over 10 MB are not accepted in the pilot.");
    }
    return {
      ...file,
      byteSize,
      protectedUri: null,
      checksumSha256: null,
      encryptedAtRest: false
    };
  }

  async materializeForViewing(
    request: AttachmentReadRequest
  ): Promise<MaterializedAttachment> {
    this.assertUnlocked();
    if (
      request.storage !== "plaintext-preview" ||
      !request.localUri ||
      request.localUri.toLowerCase().split(/[?#]/u, 1)[0]?.endsWith(".alyrblob")
    ) {
      throw new AttachmentReadError(
        "PROTECTED_ATTACHMENT_UNAVAILABLE",
        "Protected attachments open only in an ALYR signed build."
      );
    }
    if (
      !Number.isSafeInteger(request.byteSize) ||
      request.byteSize < 0 ||
      request.byteSize > MAX_ATTACHMENT_BYTES
    ) {
      throw new AttachmentReadError(
        "INVALID_REFERENCE",
        "The attachment size metadata is invalid."
      );
    }

    return {
      uri: request.localUri,
      fileName: request.fileName,
      mimeType: request.mimeType,
      byteSize: request.byteSize,
      checksumSha256: null,
      integrity: "unverified-preview",
      temporary: false
    };
  }

  async cleanupMaterialized(
    attachment: MaterializedAttachment
  ): Promise<void> {
    if (attachment.temporary) {
      throw new AttachmentReadError(
        "CLEANUP_REJECTED",
        "Expo Go does not own temporary attachment files."
      );
    }
  }

  async close(): Promise<void> {}

  async lock(): Promise<void> {
    this.locked = true;
  }

  async purge(): Promise<void> {
    await this.lock();
  }

  private assertUnlocked(): void {
    if (this.locked) {
      throw new AttachmentReadError(
        "VAULT_LOCKED",
        "The local attachment preview is locked."
      );
    }
  }
}

export function createDefaultAttachmentStore(
  scope: VaultScope = DEVICE_PREVIEW_VAULT_SCOPE
): ScopedAttachmentStore {
  return new ExpoGoAttachmentStore(scope);
}
