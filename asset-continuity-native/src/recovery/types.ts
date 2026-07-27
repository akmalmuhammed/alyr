/**
 * Recovery Kit cryptography is deliberately expressed as a port. Expo Crypto
 * supplies AES-GCM, secure random bytes, and SHA-256, but it does not currently
 * expose a password KDF. A signed native build must inject an audited Argon2id
 * implementation; the core never substitutes a fast hash for a password KDF.
 */
export interface RecoveryKdfParameters {
  readonly algorithm: "argon2id";
  readonly salt: Uint8Array;
  readonly memoryKiB: number;
  readonly iterations: number;
  readonly parallelism: number;
  readonly keyBytes: 32;
}

export interface RecoveryCryptoPort {
  randomBytes(length: number): Promise<Uint8Array>;
  sha256(value: Uint8Array): Promise<Uint8Array>;
  deriveKey(
    passphraseUtf8: Uint8Array,
    parameters: RecoveryKdfParameters
  ): Promise<Uint8Array>;
  sealAes256Gcm(input: {
    readonly plaintext: Uint8Array;
    readonly key: Uint8Array;
    readonly nonce: Uint8Array;
    readonly additionalData: Uint8Array;
  }): Promise<Uint8Array>;
  openAes256Gcm(input: {
    readonly ciphertextAndTag: Uint8Array;
    readonly key: Uint8Array;
    readonly nonce: Uint8Array;
    readonly additionalData: Uint8Array;
  }): Promise<Uint8Array>;
}

export interface RecoveryAttachmentSource {
  /** Stable Evidence or Blob identifier. It is never used as a file path. */
  readonly id: string;
  readonly evidenceId: string;
  readonly protectedReference: string;
  readonly protectedByteSize: number;
  readonly fileName: string;
  readonly mimeType: string;
  /** Size of the original attachment before device-vault encryption. */
  readonly plaintextByteSize: number;
  readonly plaintextChecksumSha256: string | null;
}

export interface RecoveryProtectedAttachmentReadPort {
  /**
   * Read only device-vault encrypted `.alyrblob` bytes. The implementation must
   * reject a source larger than `maxBytes` before allocating it when possible,
   * and return a caller-owned buffer that the core may zero after copying.
   */
  readProtectedAttachment(
    reference: string,
    maxBytes: number
  ): Promise<Uint8Array>;
}

export interface CreateRecoveryKitRequest {
  readonly workspace: unknown;
  readonly workspaceSchemaVersion: number;
  readonly createdAt: string;
  /**
   * The 32-byte key used by the current attachment vault. It is required when
   * protected attachments are present so the kit remains recoverable on a new
   * installation. It exists only inside the passphrase-encrypted payload.
   */
  readonly attachmentVaultKey: Uint8Array | null;
  readonly attachments: readonly RecoveryAttachmentSource[];
}

export interface RecoveryKitArtifact {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly mimeType: "application/vnd.alyr.recovery-kit";
  readonly byteSize: number;
  readonly sha256: string;
  readonly attachmentCount: number;
}

export interface RecoveredAttachment {
  readonly id: string;
  readonly evidenceId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly plaintextByteSize: number;
  readonly plaintextChecksumSha256: string | null;
  readonly protectedFormat: "expo-aes-gcm-combined-v1";
  readonly protectedBytes: Uint8Array;
  readonly protectedSha256: string;
}

export interface RecoveredKit {
  readonly kitId: string;
  readonly createdAt: string;
  readonly workspaceSchemaVersion: number;
  readonly workspace: unknown;
  readonly attachmentVaultKey: Uint8Array | null;
  readonly attachments: readonly RecoveredAttachment[];
  readonly containerSha256: string;
}

export interface RecoveryKitStoredFile {
  readonly reference: string;
  readonly fileName: string;
  readonly byteSize: number;
}

export interface RecoveryKitStoragePort {
  /**
   * Write the already-encrypted container atomically. The port must not retain a
   * reference to `bytes`; it must finish/copy the write before resolving.
   */
  writeEncryptedKitAtomically(input: {
    readonly bytes: Uint8Array;
    readonly fileName: string;
    readonly mimeType: "application/vnd.alyr.recovery-kit";
  }): Promise<RecoveryKitStoredFile>;

  /**
   * Read an encrypted kit with a pre-allocation limit. Plaintext recovery data
   * must never be written to a temporary file by this port.
   */
  readEncryptedKit(
    reference: string,
    maxBytes: number
  ): Promise<Uint8Array>;
}

export interface RecoveryRestoreMetadata {
  readonly kitId: string;
  readonly createdAt: string;
  readonly workspaceSchemaVersion: number;
  readonly attachmentCount: number;
}

export interface RecoveryRestoreTransaction {
  /**
   * Ports must copy staged bytes. They must reject a different existing vault
   * key rather than silently replacing it and orphaning current attachments.
   */
  stageAttachmentVaultKey(value: Uint8Array): Promise<void>;
  /**
   * Use an opaque, implementation-generated destination name. Never use the
   * imported display file name or identifier as a filesystem path.
   */
  stageProtectedAttachment(value: RecoveredAttachment): Promise<void>;
  /**
   * The integration layer must run its current workspace schema validation and
   * migrations before committing this snapshot.
   */
  stageWorkspace(
    workspace: unknown,
    workspaceSchemaVersion: number
  ): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface RecoveryRestorePort {
  /**
   * Account/household ownership, confirmation UI, disk capacity, and key
   * conflicts must be checked before this transaction is returned.
   */
  begin(metadata: RecoveryRestoreMetadata): Promise<RecoveryRestoreTransaction>;
}

export type RecoveryKitErrorCode =
  | "INVALID_INPUT"
  | "INVALID_PASSPHRASE"
  | "LIMIT_EXCEEDED"
  | "UNSUPPORTED_VERSION"
  | "CRYPTO_UNAVAILABLE"
  | "CORRUPT_CONTAINER"
  | "AUTHENTICATION_FAILED"
  | "STORAGE_FAILED"
  | "RESTORE_REJECTED";

export class RecoveryKitError extends Error {
  readonly code: RecoveryKitErrorCode;

  constructor(code: RecoveryKitErrorCode, message: string) {
    super(message);
    this.name = "RecoveryKitError";
    this.code = code;
  }
}
