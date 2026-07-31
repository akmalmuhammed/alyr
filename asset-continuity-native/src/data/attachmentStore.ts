import {
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
  CryptoDigestAlgorithm,
  digest,
  getRandomBytes
} from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

import type { SecureKeyStore } from "@alyr/contracts";

import {
  isNativeWorkspace,
  type CapturedFile,
  type NativeWorkspace
} from "@/domain/model";
import {
  ExpoSecureKeyStore,
  getOrCreateAttachmentKey,
  removeAttachmentKey
} from "@/data/secureKeyStore";
import {
  assertValidVaultScope,
  DEVICE_PREVIEW_VAULT_SCOPE,
  isDevicePreviewVaultScope,
  type VaultScope,
  type VaultScopeId
} from "@/data/vaultScope";
import { isExpoGoPreview } from "@/runtime/environment";
import type {
  RecoveryJournaledAttachmentRestoreSession
} from "@/recovery/atomicRestore";
import type {
  RecoveredAttachment,
  RecoveryRestoreJournalAttachmentState,
  RecoveryRestoreMetadata
} from "@/recovery/types";
import { RecoveryKitError } from "@/recovery/types";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_PROTECTED_ATTACHMENT_BYTES = MAX_ATTACHMENT_BYTES + 128;
const MATERIALIZED_FILE_PATTERN =
  /^alyr-view-[a-f0-9]{32}\.[a-z0-9]{1,10}$/u;
const PROTECTED_FILE_PATTERN = /^[a-f0-9]{64}\.alyrblob$/u;
const DRAFT_PROTECTED_FILE_PATTERN = /^[a-f0-9]{64}\.alyrdraft$/u;
const RECOVERY_STAGING_DIRECTORY_PATTERN =
  /^alyr-recovery-stage-[a-f0-9]{32}$/u;

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

/**
 * A deliberately explicit read request. Persistent signed-build records must
 * use `storage: "encrypted"` and point at their `.alyrblob`. Expo Go and web
 * previews may use `storage: "plaintext-preview"`; that branch is labeled as
 * unverified and is never accepted by the signed-build store.
 */
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
  /** Ephemeral URI for a viewer, image component, or share sheet. Never persist. */
  readonly uri: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  /** SHA-256 calculated from the decrypted bytes; null for preview passthroughs. */
  readonly checksumSha256: string | null;
  readonly integrity:
    | "aes-gcm-and-sha256"
    | "aes-gcm-authenticated"
    | "unverified-preview";
  /** True only when plaintext was written into the app cache. */
  readonly temporary: boolean;
}

export interface AttachmentStore {
  readonly kind: "encrypted-files" | "memory-preview";
  readonly encryptedAtRest: boolean;
  ingest(file: CapturedFile): Promise<CapturedFile>;

  /**
   * Decrypts one protected attachment on demand and returns a verified cache
   * file. Callers must not persist the returned URI and must call
   * `cleanupMaterialized` in a `finally` block after the viewer/share action
   * finishes (or when an image preview unmounts).
   */
  materializeForViewing(
    request: AttachmentReadRequest
  ): Promise<MaterializedAttachment>;

  /**
   * Deletes only cache files issued by `materializeForViewing`. Preview
   * passthroughs are intentionally left untouched.
   */
  cleanupMaterialized(attachment: MaterializedAttachment): Promise<void>;
}

export interface DraftAttachmentStore extends AttachmentStore {
  /**
   * Copies picker/cache bytes into the vault's durable draft area before a
   * process-restorable draft points at them. Signed builds encrypt these bytes.
   */
  stageForDraft(file: CapturedFile): Promise<CapturedFile>;
  /** Authenticates staged bytes without exposing plaintext to the caller. */
  verifyDraftFile(file: CapturedFile): Promise<boolean>;
  /** Returns an authenticated cache copy for an in-progress draft preview. */
  materializeDraftForViewing(
    file: CapturedFile
  ): Promise<MaterializedAttachment>;
  /** Deletes only a file owned by this scope's draft staging directory. */
  discardDraftFile(file: CapturedFile): Promise<void>;
}

export function isDraftAttachmentStore(
  store: AttachmentStore | null | undefined
): store is DraftAttachmentStore {
  const candidate = store as Partial<DraftAttachmentStore> | null | undefined;
  return Boolean(
    candidate &&
      candidate.encryptedAtRest &&
      typeof candidate.stageForDraft === "function" &&
      typeof candidate.verifyDraftFile === "function" &&
      typeof candidate.materializeDraftForViewing === "function" &&
      typeof candidate.discardDraftFile === "function"
  );
}

export interface VerifiedAttachmentBytesRequest {
  /**
   * Ownership of this buffer transfers to the vault. Implementations overwrite
   * it after checksum verification/encryption so plaintext does not linger.
   */
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly checksumSha256: string;
}

/**
 * Signed-vault capability used for cloud restores. It stays separate from the
 * preview-compatible AttachmentStore contract so previews never acquire a
 * plaintext persistence path by accident.
 */
export interface VerifiedAttachmentSink {
  ingestVerifiedBytes(
    request: VerifiedAttachmentBytesRequest
  ): Promise<CapturedFile>;
}

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

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array {
  if (!/^[a-f0-9]+$/u.test(value) || value.length % 2 !== 0) {
    throw new RecoveryKitError(
      "RESTORE_REJECTED",
      "Recovery attachment key journal data is invalid."
    );
  }
  return Uint8Array.from(
    { length: value.length / 2 },
    (_unused, index) =>
      Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  );
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const checksumBuffer = await digest(
    CryptoDigestAlgorithm.SHA256,
    new Uint8Array(bytes)
  );
  return bytesToHex(new Uint8Array(checksumBuffer));
}

async function protectedFileMatches(
  file: File,
  expectedByteSize: number,
  expectedSha256: string
): Promise<boolean> {
  if (!file.exists || file.size !== expectedByteSize) return false;
  const bytes = await file.bytes();
  try {
    return timingSafeHexEqual(
      await sha256Hex(bytes),
      expectedSha256
    );
  } finally {
    bytes.fill(0);
  }
}

function timingSafeHexEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function normalizeExpectedChecksum(checksum: string | null): string | null {
  if (checksum === null) {
    return null;
  }
  if (!/^[a-f0-9]{64}$/iu.test(checksum)) {
    throw new AttachmentReadError(
      "INVALID_REFERENCE",
      "The attachment checksum metadata is invalid."
    );
  }
  return checksum.toLowerCase();
}

function isProtectedBlobUri(uri: string): boolean {
  const path = uri.split(/[?#]/u, 1)[0] ?? "";
  return path.toLowerCase().endsWith(".alyrblob");
}

const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "text/plain": "txt"
};

function safeExtension(fileName: string, mimeType: string): string {
  const knownExtension = MIME_EXTENSIONS[mimeType.toLowerCase()];
  if (knownExtension) {
    return knownExtension;
  }

  const match = /\.([a-z0-9]{1,10})$/iu.exec(fileName);
  const extension = match?.[1]?.toLowerCase();
  if (!extension || extension === "alyrblob") {
    return "bin";
  }
  return extension;
}

function materializedDirectory(scope: VaultScope): Directory {
  return new Directory(
    Paths.cache,
    scope.materializedAttachmentDirectoryName
  );
}

function protectedDirectory(scope: VaultScope): Directory {
  return new Directory(
    Paths.document,
    scope.protectedAttachmentDirectoryName
  );
}

function draftProtectedDirectory(scope: VaultScope): Directory {
  return new Directory(
    Paths.document,
    `${scope.protectedAttachmentDirectoryName}-drafts`
  );
}

function directoryUriWithTrailingSlash(directory: Directory): string {
  return directory.uri.endsWith("/") ? directory.uri : `${directory.uri}/`;
}

function directChildName(directory: Directory, uri: string): string | null {
  const rootUri = directoryUriWithTrailingSlash(directory);
  const relativeUri = uri.startsWith(rootUri)
    ? uri.slice(rootUri.length)
    : "";
  if (!relativeUri || relativeUri.includes("/") || relativeUri.includes("\\")) {
    return null;
  }
  return relativeUri;
}

function isScopedProtectedBlobUri(uri: string, scope: VaultScope): boolean {
  const path = uri.split(/[?#]/u, 1)[0] ?? "";
  const fileName = directChildName(protectedDirectory(scope), path);
  return Boolean(fileName && PROTECTED_FILE_PATTERN.test(fileName));
}

function isScopedDraftBlobUri(uri: string, scope: VaultScope): boolean {
  const path = uri.split(/[?#]/u, 1)[0] ?? "";
  const fileName = directChildName(draftProtectedDirectory(scope), path);
  return Boolean(
    fileName && DRAFT_PROTECTED_FILE_PATTERN.test(fileName)
  );
}

function deleteDirectoryIfPresent(directory: Directory): void {
  if (directory.exists) {
    directory.delete();
  }
}

function equalSecretBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

function matchesSecretAndWipe(
  actual: Uint8Array | null,
  expected: Uint8Array
): boolean {
  if (!actual) return false;
  const matches =
    actual.byteLength === expected.byteLength &&
    equalSecretBytes(actual, expected);
  if (actual !== expected) {
    actual.fill(0);
  }
  return matches;
}

export class MemoryPreviewAttachmentStore implements ScopedAttachmentStore {
  readonly kind = "memory-preview" as const;
  readonly encryptedAtRest = false;
  readonly scopeId: VaultScopeId;
  private locked = false;

  constructor(scope: VaultScope = DEVICE_PREVIEW_VAULT_SCOPE) {
    this.scopeId = assertValidVaultScope(scope).scopeId;
  }

  async ingest(file: CapturedFile): Promise<CapturedFile> {
    this.assertUnlocked();
    return {
      ...file,
      protectedUri: null,
      checksumSha256: null,
      encryptedAtRest: false
    };
  }

  async stageForDraft(file: CapturedFile): Promise<CapturedFile> {
    this.assertUnlocked();
    return {
      ...file,
      protectedUri: null,
      checksumSha256: null,
      encryptedAtRest: false
    };
  }

  async verifyDraftFile(): Promise<boolean> {
    this.assertUnlocked();
    return false;
  }

  async materializeDraftForViewing(): Promise<MaterializedAttachment> {
    this.assertUnlocked();
    throw new AttachmentReadError(
      "PROTECTED_ATTACHMENT_UNAVAILABLE",
      "Protected draft previews require an Heldat signed build."
    );
  }

  async discardDraftFile(): Promise<void> {
    this.assertUnlocked();
  }

  async materializeForViewing(
    request: AttachmentReadRequest
  ): Promise<MaterializedAttachment> {
    this.assertUnlocked();
    if (
      request.storage !== "plaintext-preview" ||
      !request.localUri ||
      isProtectedBlobUri(request.localUri)
    ) {
      throw new AttachmentReadError(
        "PROTECTED_ATTACHMENT_UNAVAILABLE",
        "Protected attachments open only in an Heldat signed build."
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
        "Preview mode does not own temporary attachment files."
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
        "The local attachment vault is locked."
      );
    }
  }
}

export class EncryptedFileAttachmentStore implements ScopedAttachmentStore {
  readonly kind = "encrypted-files" as const;
  readonly encryptedAtRest = true;
  readonly scopeId: VaultScopeId;
  private readonly vaultScope: VaultScope;
  private locked = false;

  constructor(
    private readonly secureStore: SecureKeyStore = new ExpoSecureKeyStore(),
    scope: VaultScope = DEVICE_PREVIEW_VAULT_SCOPE
  ) {
    this.vaultScope = assertValidVaultScope(scope);
    this.scopeId = this.vaultScope.scopeId;
  }

  async ingest(file: CapturedFile): Promise<CapturedFile> {
    this.assertUnlocked();
    const hasProtectedMetadata = Boolean(
      file.encryptedAtRest ||
        file.protectedUri ||
        file.checksumSha256
    );
    if (hasProtectedMetadata) {
      if (
        file.encryptedAtRest &&
        file.protectedUri &&
        file.checksumSha256 &&
        isScopedDraftBlobUri(file.protectedUri, this.vaultScope)
      ) {
        const plaintext = await this.readVerifiedDraftPlaintext(file);
        return this.persistPlaintext(file, plaintext, {
          byteSize: file.byteSize,
          checksumSha256: file.checksumSha256
        });
      }
      if (
        !file.encryptedAtRest ||
        !file.protectedUri ||
        !file.checksumSha256 ||
        !isScopedProtectedBlobUri(file.protectedUri, this.vaultScope) ||
        !/^[a-f0-9]{64}$/iu.test(file.checksumSha256)
      ) {
        throw new Error(
          "The protected attachment does not belong to this local vault."
        );
      }
      const existing = new File(file.protectedUri);
      if (!existing.exists) {
        throw new Error("The protected attachment is missing from this device.");
      }
      return {
        ...file,
        localUri: file.protectedUri,
        checksumSha256: file.checksumSha256.toLowerCase()
      };
    }

    const source = new File(file.localUri);
    if (!source.exists) {
      throw new Error("The attachment source file is missing.");
    }

    const plaintext = new Uint8Array(await source.arrayBuffer());
    const protectedFile = await this.persistPlaintext(file, plaintext);
    if (
      source.exists &&
      source.uri.startsWith(Paths.cache.uri) &&
      source.uri !== protectedFile.localUri
    ) {
      source.delete();
    }

    return protectedFile;
  }

  async stageForDraft(file: CapturedFile): Promise<CapturedFile> {
    this.assertUnlocked();
    if (
      file.encryptedAtRest === true &&
      file.protectedUri &&
      file.checksumSha256 &&
      isScopedDraftBlobUri(file.protectedUri, this.vaultScope)
    ) {
      if (!(await this.verifyDraftFile(file))) {
        throw new AttachmentReadError(
          "PROTECTED_FILE_MISSING",
          "The protected draft attachment is missing or unreadable."
        );
      }
      return {
        ...file,
        localUri: file.protectedUri,
        checksumSha256: file.checksumSha256.toLowerCase()
      };
    }

    if (
      file.encryptedAtRest ||
      file.protectedUri ||
      file.checksumSha256
    ) {
      throw new AttachmentReadError(
        "INVALID_REFERENCE",
        "Only picker bytes or this vault's staged draft bytes can enter a draft."
      );
    }

    const source = new File(file.localUri);
    if (!source.exists) {
      throw new AttachmentReadError(
        "PROTECTED_FILE_MISSING",
        "The attachment source file is missing."
      );
    }
    const plaintext = new Uint8Array(await source.arrayBuffer());
    return this.persistPlaintext(file, plaintext, undefined, true);
  }

  async verifyDraftFile(file: CapturedFile): Promise<boolean> {
    this.assertUnlocked();
    try {
      const plaintext = await this.readVerifiedDraftPlaintext(file);
      plaintext.fill(0);
      return true;
    } catch {
      return false;
    }
  }

  async materializeDraftForViewing(
    file: CapturedFile
  ): Promise<MaterializedAttachment> {
    this.assertUnlocked();
    const plaintext = await this.readVerifiedDraftPlaintext(file);
    const checksum = file.checksumSha256!.toLowerCase();
    const directory = materializedDirectory(this.vaultScope);
    directory.create({ idempotent: true, intermediates: true });
    const extension = safeExtension(file.fileName, file.mimeType);
    const destination = new File(
      directory,
      `alyr-view-${checksum.slice(0, 32)}.${extension}`
    );
    try {
      destination.create({ overwrite: true, intermediates: true });
      destination.write(plaintext);
      if (!destination.exists || destination.size !== plaintext.byteLength) {
        throw new Error("Draft preview size verification failed.");
      }
      return {
        uri: destination.uri,
        fileName: file.fileName,
        mimeType: file.mimeType,
        byteSize: plaintext.byteLength,
        checksumSha256: checksum,
        integrity: "aes-gcm-and-sha256",
        temporary: true
      };
    } catch {
      if (destination.exists) destination.delete();
      throw new AttachmentReadError(
        "TEMPORARY_FILE_FAILED",
        "A protected draft preview could not be created."
      );
    } finally {
      plaintext.fill(0);
    }
  }

  async discardDraftFile(file: CapturedFile): Promise<void> {
    this.assertUnlocked();
    const reference = file.protectedUri;
    if (!reference || !isScopedDraftBlobUri(reference, this.vaultScope)) {
      return;
    }
    const staged = new File(reference);
    if (staged.exists) {
      staged.delete();
    }
    if (
      file.checksumSha256 &&
      /^[a-f0-9]{64}$/iu.test(file.checksumSha256)
    ) {
      const preview = new File(
        materializedDirectory(this.vaultScope),
        `alyr-view-${file.checksumSha256
          .toLowerCase()
          .slice(0, 32)}.${safeExtension(file.fileName, file.mimeType)}`
      );
      if (preview.exists) preview.delete();
    }
  }

  async ingestVerifiedBytes(
    request: VerifiedAttachmentBytesRequest
  ): Promise<CapturedFile> {
    this.assertUnlocked();
    const validBytes = request.bytes instanceof Uint8Array;
    if (
      !validBytes ||
      !request.fileName.trim() ||
      request.fileName.length > 255 ||
      !request.mimeType.trim() ||
      request.mimeType.length > 160 ||
      !Number.isSafeInteger(request.byteSize) ||
      request.byteSize < 1 ||
      request.byteSize > MAX_ATTACHMENT_BYTES ||
      !/^[a-f0-9]{64}$/iu.test(request.checksumSha256)
    ) {
      if (validBytes) request.bytes.fill(0);
      throw new AttachmentReadError(
        "INVALID_REFERENCE",
        "The downloaded attachment metadata is invalid."
      );
    }

    return this.persistPlaintext(
      {
        localUri: "alyr-cloud-download://memory",
        fileName: request.fileName,
        mimeType: request.mimeType,
        byteSize: request.byteSize,
        protectedUri: null,
        checksumSha256: null,
        encryptedAtRest: false
      },
      request.bytes,
      {
        byteSize: request.byteSize,
        checksumSha256: request.checksumSha256.toLowerCase()
      }
    );
  }

  private async persistPlaintext(
    file: CapturedFile,
    plaintext: Uint8Array,
    expected?: {
      readonly byteSize: number;
      readonly checksumSha256: string;
    },
    draft = false
  ): Promise<CapturedFile> {
    try {
      const byteSize = plaintext.byteLength;
      if (byteSize > MAX_ATTACHMENT_BYTES) {
        throw new Error("Files over 10 MB are not accepted in the pilot.");
      }
      if (expected && byteSize !== expected.byteSize) {
        throw new AttachmentReadError(
          "SIZE_MISMATCH",
          "The downloaded attachment does not match its recorded size."
        );
      }

      const checksumSha256 = await sha256Hex(plaintext);
      if (
        expected &&
        !timingSafeHexEqual(
          checksumSha256,
          normalizeExpectedChecksum(expected.checksumSha256) ?? ""
        )
      ) {
        throw new AttachmentReadError(
          "CHECKSUM_MISMATCH",
          "The downloaded attachment does not match its recorded checksum."
        );
      }

      const keyBytes = await getOrCreateAttachmentKey(
        this.secureStore,
        this.vaultScope
      );
      const key = await AESEncryptionKey.import(keyBytes);
      const sealed = await aesEncryptAsync(plaintext, key);
      const encrypted = await sealed.combined();
      if (typeof encrypted === "string") {
        throw new Error(
          "Native attachment encryption returned an invalid payload."
        );
      }

      const directory = draft
        ? draftProtectedDirectory(this.vaultScope)
        : protectedDirectory(this.vaultScope);
      directory.create({ idempotent: true, intermediates: true });
      const destination = new File(
        directory,
        `${checksumSha256}.${draft ? "alyrdraft" : "alyrblob"}`
      );
      destination.create({ overwrite: true, intermediates: true });
      destination.write(encrypted);

      if (!destination.exists || destination.size !== encrypted.byteLength) {
        throw new Error(
          "The encrypted attachment could not be verified on disk."
        );
      }

      return {
        ...file,
        // Picker metadata is optional on both platforms. The encrypted record
        // must use the bytes we actually read or later integrity checks can
        // reject a valid capture (for example, a picker reporting size `0`).
        byteSize,
        localUri: destination.uri,
        protectedUri: destination.uri,
        checksumSha256,
        encryptedAtRest: true
      };
    } finally {
      // The caller transfers ownership of plaintext to the vault. Wipe it on
      // every success and failure path after verification/encryption finishes.
      plaintext.fill(0);
    }
  }

  private async readVerifiedDraftPlaintext(
    file: CapturedFile
  ): Promise<Uint8Array> {
    if (
      !file.encryptedAtRest ||
      !file.protectedUri ||
      !file.checksumSha256 ||
      !isScopedDraftBlobUri(file.protectedUri, this.vaultScope) ||
      !/^[a-f0-9]{64}$/iu.test(file.checksumSha256) ||
      !Number.isSafeInteger(file.byteSize) ||
      file.byteSize < 1 ||
      file.byteSize > MAX_ATTACHMENT_BYTES
    ) {
      throw new AttachmentReadError(
        "INVALID_REFERENCE",
        "The protected draft attachment metadata is invalid."
      );
    }

    const source = new File(file.protectedUri);
    if (
      !source.exists ||
      source.size <= 0 ||
      source.size > MAX_PROTECTED_ATTACHMENT_BYTES
    ) {
      throw new AttachmentReadError(
        "PROTECTED_FILE_MISSING",
        "The protected draft attachment is missing or unreadable."
      );
    }

    const keyBytes = await this.secureStore.get(
      this.vaultScope.attachmentKeyName
    );
    if (!keyBytes || keyBytes.byteLength !== 32) {
      keyBytes?.fill(0);
      throw new AttachmentReadError(
        "KEY_UNAVAILABLE",
        "The device attachment key is unavailable."
      );
    }

    try {
      let plaintext: Uint8Array;
      try {
        const encrypted = new Uint8Array(await source.arrayBuffer());
        const key = await AESEncryptionKey.import(keyBytes);
        const sealed = AESSealedData.fromCombined(encrypted);
        plaintext = await aesDecryptAsync(sealed, key);
      } catch {
        throw new AttachmentReadError(
          "DECRYPTION_FAILED",
          "The protected draft attachment did not pass authentication."
        );
      }

      if (plaintext.byteLength !== file.byteSize) {
        plaintext.fill(0);
        throw new AttachmentReadError(
          "SIZE_MISMATCH",
          "The protected draft attachment does not match its saved size."
        );
      }
      const checksum = await sha256Hex(plaintext);
      if (
        !timingSafeHexEqual(
          checksum,
          file.checksumSha256.toLowerCase()
        )
      ) {
        plaintext.fill(0);
        throw new AttachmentReadError(
          "CHECKSUM_MISMATCH",
          "The protected draft attachment does not match its checksum."
        );
      }
      return plaintext;
    } finally {
      keyBytes.fill(0);
    }
  }

  async materializeForViewing(
    request: AttachmentReadRequest
  ): Promise<MaterializedAttachment> {
    this.assertUnlocked();
    if (
      request.storage !== "encrypted" ||
      !request.protectedUri ||
      !isScopedProtectedBlobUri(request.protectedUri, this.vaultScope)
    ) {
      throw new AttachmentReadError(
        "INVALID_REFERENCE",
        "A signed build requires an encrypted .alyrblob reference."
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

    const expectedChecksum = normalizeExpectedChecksum(
      request.checksumSha256
    );
    const source = new File(request.protectedUri);
    if (
      !source.exists ||
      source.size <= 0 ||
      source.size > MAX_PROTECTED_ATTACHMENT_BYTES
    ) {
      throw new AttachmentReadError(
        "PROTECTED_FILE_MISSING",
        "The protected attachment is missing or unreadable on this device."
      );
    }

    let keyBytes: Uint8Array | null;
    try {
      keyBytes = await this.secureStore.get(
        this.vaultScope.attachmentKeyName
      );
    } catch {
      throw new AttachmentReadError(
        "KEY_UNAVAILABLE",
        "The device attachment key is unavailable."
      );
    }
    if (!keyBytes || keyBytes.length !== 32) {
      throw new AttachmentReadError(
        "KEY_UNAVAILABLE",
        "The device attachment key is unavailable."
      );
    }

    let plaintext: Uint8Array;
    try {
      const encrypted = new Uint8Array(await source.arrayBuffer());
      const key = await AESEncryptionKey.import(keyBytes);
      const sealed = AESSealedData.fromCombined(encrypted);
      plaintext = await aesDecryptAsync(sealed, key);
    } catch {
      throw new AttachmentReadError(
        "DECRYPTION_FAILED",
        "The protected attachment did not pass AES-GCM authentication."
      );
    }

    if (plaintext.byteLength > MAX_ATTACHMENT_BYTES) {
      plaintext.fill(0);
      throw new AttachmentReadError(
        "DECRYPTION_FAILED",
        "The decrypted attachment exceeds the allowed size."
      );
    }
    if (plaintext.byteLength !== request.byteSize) {
      plaintext.fill(0);
      throw new AttachmentReadError(
        "SIZE_MISMATCH",
        "The protected attachment does not match its saved size."
      );
    }

    const checksumSha256 = await sha256Hex(plaintext);
    if (
      expectedChecksum &&
      !timingSafeHexEqual(checksumSha256, expectedChecksum)
    ) {
      plaintext.fill(0);
      throw new AttachmentReadError(
        "CHECKSUM_MISMATCH",
        "The protected attachment does not match its saved checksum."
      );
    }

    const directory = materializedDirectory(this.vaultScope);
    directory.create({ idempotent: true, intermediates: true });
    const token = bytesToHex(getRandomBytes(16));
    const extension = safeExtension(request.fileName, request.mimeType);
    const destination = new File(
      directory,
      `alyr-view-${token}.${extension}`
    );

    try {
      destination.create({ overwrite: false, intermediates: true });
      destination.write(plaintext);
      if (!destination.exists || destination.size !== plaintext.byteLength) {
        throw new Error("Temporary attachment size verification failed.");
      }

      const persisted = new Uint8Array(await destination.arrayBuffer());
      const persistedChecksum = await sha256Hex(persisted);
      persisted.fill(0);
      if (!timingSafeHexEqual(persistedChecksum, checksumSha256)) {
        throw new Error("Temporary attachment checksum verification failed.");
      }
    } catch {
      plaintext.fill(0);
      if (destination.exists) {
        destination.delete();
      }
      throw new AttachmentReadError(
        "TEMPORARY_FILE_FAILED",
        "A verified temporary attachment could not be created."
      );
    }

    const byteSize = plaintext.byteLength;
    plaintext.fill(0);
    return {
      uri: destination.uri,
      fileName: request.fileName,
      mimeType: request.mimeType,
      byteSize,
      checksumSha256,
      integrity: expectedChecksum
        ? "aes-gcm-and-sha256"
        : "aes-gcm-authenticated",
      temporary: true
    };
  }

  async cleanupMaterialized(
    attachment: MaterializedAttachment
  ): Promise<void> {
    if (!attachment.temporary) {
      return;
    }

    const directory = materializedDirectory(this.vaultScope);
    const rootUri = directoryUriWithTrailingSlash(directory);
    const relativeUri = attachment.uri.startsWith(rootUri)
      ? attachment.uri.slice(rootUri.length)
      : "";
    if (
      !relativeUri ||
      relativeUri.includes("/") ||
      !MATERIALIZED_FILE_PATTERN.test(relativeUri)
    ) {
      throw new AttachmentReadError(
        "CLEANUP_REJECTED",
        "The attachment URI is outside Heldat's temporary viewing directory."
      );
    }

    const file = new File(attachment.uri);
    if (file.exists) {
      file.delete();
    }
  }

  /**
   * Recovery export reads only the existing AES-GCM protected `.alyrblob`.
   * Plaintext proof never leaves the attachment vault for this operation.
   */
  async readProtectedAttachment(
    reference: string,
    maxBytes: number
  ): Promise<Uint8Array> {
    this.assertUnlocked();
    if (
      !isScopedProtectedBlobUri(reference, this.vaultScope) ||
      !Number.isSafeInteger(maxBytes) ||
      maxBytes <= 0 ||
      maxBytes > MAX_PROTECTED_ATTACHMENT_BYTES
    ) {
      throw new AttachmentReadError(
        "INVALID_REFERENCE",
        "Recovery attachment reference is invalid."
      );
    }
    const source = new File(reference);
    if (!source.exists || source.size <= 0 || source.size > maxBytes) {
      throw new AttachmentReadError(
        "PROTECTED_FILE_MISSING",
        "A protected attachment is missing or exceeds its recorded size."
      );
    }
    return source.bytes();
  }

  async protectedAttachmentByteSize(
    reference: string
  ): Promise<number> {
    this.assertUnlocked();
    if (!isScopedProtectedBlobUri(reference, this.vaultScope)) {
      throw new AttachmentReadError(
        "INVALID_REFERENCE",
        "Recovery attachment reference is outside this household vault."
      );
    }
    const source = new File(reference);
    if (
      !source.exists ||
      source.size <= 0 ||
      source.size > MAX_PROTECTED_ATTACHMENT_BYTES
    ) {
      throw new AttachmentReadError(
        "PROTECTED_FILE_MISSING",
        "A protected attachment is missing or unreadable."
      );
    }
    return source.size;
  }

  async readAttachmentVaultKeyForRecovery(): Promise<Uint8Array | null> {
    this.assertUnlocked();
    const key = await this.secureStore.get(
      this.vaultScope.attachmentKeyName
    );
    if (!key) return null;
    if (key.byteLength !== 32) {
      key.fill(0);
      throw new AttachmentReadError(
        "KEY_UNAVAILABLE",
        "The protected attachment key is invalid."
      );
    }
    const copy = key.slice();
    key.fill(0);
    return copy;
  }

  async beginRecoveryAttachmentRestore(
    metadata: RecoveryRestoreMetadata
  ): Promise<RecoveryJournaledAttachmentRestoreSession> {
    this.assertUnlocked();
    if (
      !metadata.kitId.match(/^[a-f0-9]{32}$/u) ||
      metadata.attachmentCount < 0 ||
      metadata.attachmentCount > 256
    ) {
      throw new RecoveryKitError(
        "RESTORE_REJECTED",
        "Recovery attachment preflight metadata is invalid."
      );
    }

    const token = bytesToHex(getRandomBytes(16));
    const stagingDirectory = new Directory(
      Paths.cache,
      `alyr-recovery-stage-${token}`
    );
    stagingDirectory.create({
      idempotent: false,
      intermediates: true
    });
    const targetDirectory = protectedDirectory(this.vaultScope);
    const staged = new Map<
      string,
      {
        readonly source: File;
        readonly destination: File;
        readonly protectedByteSize: number;
        readonly protectedSha256: string;
        movedToDestination: boolean;
      }
    >();
    let expectedVaultKey: Uint8Array | null = null;
    let vaultKeyDisposition: "preserve" | "install" | null = null;
    let keyStaged = false;
    let keyWriteAttempted = false;
    let attachmentCount = 0;
    let workspaceStaged = false;
    let committed = false;
    let rolledBack = false;
    let finalized = false;

    const rollback = async (): Promise<void> => {
      if (rolledBack || finalized) return;
      let unexpectedDestination = false;
      for (const item of staged.values()) {
        if (item.destination.exists) {
          if (item.movedToDestination) {
            // This live session allocated the path, observed it absent, and
            // completed the move. Re-read its digest before removing it, but
            // still remove transaction-owned output when the commit's own
            // post-move verification detected corruption.
            await protectedFileMatches(
              item.destination,
              item.protectedByteSize,
              item.protectedSha256
            ).catch(() => false);
            item.destination.delete();
          } else {
            // A destination that appeared without a successful move is not
            // owned by this transaction and may belong to an ungated writer.
            unexpectedDestination = true;
          }
        }
        if (item.source.exists) {
          await protectedFileMatches(
            item.source,
            item.protectedByteSize,
            item.protectedSha256
          ).catch(() => false);
          item.source.delete();
        }
      }
      deleteDirectoryIfPresent(stagingDirectory);
      if (
        vaultKeyDisposition === "install" &&
        keyWriteAttempted &&
        expectedVaultKey
      ) {
        const current = await this.secureStore.get(
          this.vaultScope.attachmentKeyName
        );
        if (matchesSecretAndWipe(current, expectedVaultKey)) {
          const confirmation = await this.secureStore.get(
            this.vaultScope.attachmentKeyName
          );
          if (
            matchesSecretAndWipe(confirmation, expectedVaultKey)
          ) {
            await this.secureStore.remove(
              this.vaultScope.attachmentKeyName
            );
          }
        }
      }
      if (unexpectedDestination) {
        throw new RecoveryKitError(
          "STORAGE_FAILED",
          "A recovery destination changed before this transaction installed it."
        );
      }
      expectedVaultKey?.fill(0);
      expectedVaultKey = null;
      keyWriteAttempted = false;
      rolledBack = true;
    };

    return {
      stageAttachmentVaultKey: async (value) => {
        if (
          committed ||
          rolledBack ||
          finalized ||
          keyStaged ||
          value.byteLength !== 32
        ) {
          throw new RecoveryKitError(
            "RESTORE_REJECTED",
            "Recovery attachment key staging was rejected."
          );
        }
        keyStaged = true;
        const existing = await this.secureStore.get(
          this.vaultScope.attachmentKeyName
        );
        if (existing) {
          const matches = matchesSecretAndWipe(existing, value);
          if (!matches) {
            throw new RecoveryKitError(
              "RESTORE_REJECTED",
              "The imported attachment key conflicts with this household vault."
            );
          }
          expectedVaultKey = value.slice();
          vaultKeyDisposition = "preserve";
          return;
        }
        expectedVaultKey = value.slice();
        vaultKeyDisposition = "install";
      },
      stageProtectedAttachment: async (
        value: RecoveredAttachment
      ) => {
        if (
          committed ||
          rolledBack ||
          finalized ||
          workspaceStaged ||
          staged.has(value.id) ||
          value.protectedFormat !== "expo-aes-gcm-combined-v1" ||
          value.protectedBytes.byteLength <= 0 ||
          value.protectedBytes.byteLength >
            MAX_PROTECTED_ATTACHMENT_BYTES ||
          !/^[a-f0-9]{64}$/u.test(value.protectedSha256)
        ) {
          throw new RecoveryKitError(
            "RESTORE_REJECTED",
            "A protected Recovery Kit attachment was rejected."
          );
        }
        const checksum = await sha256Hex(value.protectedBytes);
        if (!timingSafeHexEqual(checksum, value.protectedSha256)) {
          throw new RecoveryKitError(
            "RESTORE_REJECTED",
            "A protected Recovery Kit attachment failed verification."
          );
        }
        const destinationName = `${bytesToHex(
          getRandomBytes(32)
        )}.alyrblob`;
        const source = new File(stagingDirectory, destinationName);
        const destination = new File(targetDirectory, destinationName);
        if (source.exists || destination.exists) {
          throw new RecoveryKitError(
            "RESTORE_REJECTED",
            "A protected attachment destination could not be allocated."
          );
        }
        source.create({ overwrite: false, intermediates: true });
        source.write(value.protectedBytes);
        if (
          !(await protectedFileMatches(
            source,
            value.protectedBytes.byteLength,
            value.protectedSha256
          ))
        ) {
          if (source.exists) source.delete();
          throw new RecoveryKitError(
            "STORAGE_FAILED",
            "A protected attachment could not be staged."
          );
        }
        staged.set(value.id, {
          source,
          destination,
          protectedByteSize: value.protectedBytes.byteLength,
          protectedSha256: value.protectedSha256,
          movedToDestination: false
        });
        attachmentCount += 1;
      },
      stageWorkspace: async (
        value,
        workspaceSchemaVersion
      ): Promise<NativeWorkspace> => {
        if (
          committed ||
          rolledBack ||
          finalized ||
          workspaceStaged ||
          !isNativeWorkspace(value) ||
          value.schemaVersion !== workspaceSchemaVersion ||
          attachmentCount !== metadata.attachmentCount
        ) {
          throw new RecoveryKitError(
            "RESTORE_REJECTED",
            "Recovery workspace staging was rejected."
          );
        }

        const evidence = value.evidence.map((item) => {
          const restored = staged.get(item.blobObjectId);
          if (!restored) {
            throw new RecoveryKitError(
              "RESTORE_REJECTED",
              `Recovery Kit is missing protected proof “${item.fileName}”.`
            );
          }
          return {
            ...item,
            localUri: restored.destination.uri,
            storageState: "on-device" as const
          };
        });
        const usedBlobIds = new Set(
          evidence.map((item) => item.blobObjectId)
        );
        const placeDocuments = (value.placeDocuments ?? []).map(
          (document) => {
            const restored = staged.get(document.blobObjectId);
            if (!restored) {
              throw new RecoveryKitError(
                "RESTORE_REJECTED",
                `Recovery Kit is missing protected document “${document.fileName}”.`
              );
            }
            usedBlobIds.add(document.blobObjectId);
            return {
              ...document,
              localUri: restored.destination.uri,
              storageState: "on-device" as const
            };
          }
        );
        if (usedBlobIds.size !== staged.size) {
          throw new RecoveryKitError(
            "RESTORE_REJECTED",
            "Recovery Kit contains a protected file that is not referenced by this workspace."
          );
        }
        const evidenceById = new Map(
          evidence.map((item) => [item.id, item])
        );
        const assets = value.assets.map((asset) => {
          if (!asset.photoEvidenceId) {
            return {
              ...asset,
              photoUri: null,
              photoProtectedUri: null,
              photoChecksumSha256: null
            };
          }
          const photoEvidence = evidenceById.get(asset.photoEvidenceId);
          if (!photoEvidence?.localUri) {
            throw new RecoveryKitError(
              "RESTORE_REJECTED",
              `Recovery Kit is missing the primary image for “${asset.name}”.`
            );
          }
          return {
            ...asset,
            photoUri: photoEvidence.localUri,
            photoProtectedUri: photoEvidence.localUri,
            photoChecksumSha256: photoEvidence.checksumSha256
          };
        });
        workspaceStaged = true;
        return {
          ...value,
          evidence,
          placeDocuments,
          assets,
          syncStatus: "local-only",
          lastSyncedAt: null
        };
      },
      createRecoveryRestoreJournalState: async () => {
        if (
          committed ||
          rolledBack ||
          finalized ||
          !workspaceStaged ||
          attachmentCount !== metadata.attachmentCount ||
          (metadata.attachmentCount > 0 &&
            (!keyStaged ||
              !expectedVaultKey ||
              vaultKeyDisposition === null))
        ) {
          throw new RecoveryKitError(
            "RESTORE_REJECTED",
            "Recovery attachment journal staging order is invalid."
          );
        }
        return {
          journalVersion: 1,
          vaultScopeId: this.vaultScope.scopeId,
          stagingDirectoryReference: stagingDirectory.uri,
          vaultKeyDisposition: vaultKeyDisposition ?? "preserve",
          pendingVaultKeyHex:
            vaultKeyDisposition === "install" && expectedVaultKey
              ? bytesToHex(expectedVaultKey)
              : null,
          expectedVaultKeyHex: expectedVaultKey
            ? bytesToHex(expectedVaultKey)
            : null,
          files: [...staged.values()].map((item) => ({
            stagedReference: item.source.uri,
            destinationReference: item.destination.uri,
            protectedByteSize: item.protectedByteSize,
            protectedSha256: item.protectedSha256
          }))
        };
      },
      commit: async () => {
        if (
          committed ||
          rolledBack ||
          finalized ||
          !workspaceStaged ||
          attachmentCount !== metadata.attachmentCount ||
          (metadata.attachmentCount > 0 &&
            (!keyStaged ||
              !expectedVaultKey ||
              vaultKeyDisposition === null))
        ) {
          throw new RecoveryKitError(
            "RESTORE_REJECTED",
            "Recovery attachment commit order is invalid."
          );
        }
        try {
          if (expectedVaultKey && vaultKeyDisposition) {
            const beforeFinalization = await this.secureStore.get(
              this.vaultScope.attachmentKeyName
            );
            const keyWasPresent = beforeFinalization !== null;
            const keyMatched = matchesSecretAndWipe(
              beforeFinalization,
              expectedVaultKey
            );
            if (vaultKeyDisposition === "install") {
              if (keyWasPresent) {
                throw new RecoveryKitError(
                  "RESTORE_REJECTED",
                  "The attachment vault key changed before recovery installation."
                );
              }
              keyWriteAttempted = true;
              await this.secureStore.set(
                this.vaultScope.attachmentKeyName,
                expectedVaultKey
              );
              const installedKey = await this.secureStore.get(
                this.vaultScope.attachmentKeyName
              );
              if (
                !matchesSecretAndWipe(
                  installedKey,
                  expectedVaultKey
                )
              ) {
                throw new RecoveryKitError(
                  "RESTORE_REJECTED",
                  "The attachment vault key did not verify after recovery installation."
                );
              }
            } else if (!keyMatched) {
              throw new RecoveryKitError(
                "RESTORE_REJECTED",
                "The preserved attachment vault key changed before recovery installation."
              );
            }
          }
          targetDirectory.create({
            idempotent: true,
            intermediates: true
          });
          for (const item of staged.values()) {
            await item.source.move(item.destination, {
              overwrite: false
            });
            item.movedToDestination = true;
            if (
              !(await protectedFileMatches(
                item.destination,
                item.protectedByteSize,
                item.protectedSha256
              ))
            ) {
              throw new RecoveryKitError(
                "STORAGE_FAILED",
                "A restored protected attachment did not verify on disk."
              );
            }
          }
          if (expectedVaultKey) {
            const finalizedKey = await this.secureStore.get(
              this.vaultScope.attachmentKeyName
            );
            if (
              !matchesSecretAndWipe(finalizedKey, expectedVaultKey)
            ) {
              throw new RecoveryKitError(
                "RESTORE_REJECTED",
                "The attachment vault key changed during recovery finalization."
              );
            }
          }
          deleteDirectoryIfPresent(stagingDirectory);
          committed = true;
        } catch (error) {
          await rollback();
          throw error;
        }
      },
      rollback,
      finalize: async () => {
        if (finalized) return;
        if (!committed && !rolledBack) {
          throw new RecoveryKitError(
            "RESTORE_REJECTED",
            "Recovery attachment finalization was requested before commit."
          );
        }
        expectedVaultKey?.fill(0);
        expectedVaultKey = null;
        keyWriteAttempted = false;
        finalized = true;
      }
    };
  }

  async resolveInterruptedRecoveryAttachmentRestore(
    state: RecoveryRestoreJournalAttachmentState,
    outcome: "rollback" | "complete"
  ): Promise<void> {
    this.assertUnlocked();
    const cacheRoot = new Directory(Paths.cache);
    const stagingName = directChildName(
      cacheRoot,
      state.stagingDirectoryReference
    );
    if (
      state.journalVersion !== 1 ||
      state.vaultScopeId !== this.vaultScope.scopeId ||
      !stagingName ||
      !RECOVERY_STAGING_DIRECTORY_PATTERN.test(stagingName) ||
      !Array.isArray(state.files) ||
      state.files.length > 256 ||
      (state.files.length > 0
        ? !state.expectedVaultKeyHex ||
          !/^[a-f0-9]{64}$/u.test(state.expectedVaultKeyHex)
        : state.expectedVaultKeyHex !== null) ||
      (state.vaultKeyDisposition === "install"
        ? state.files.length === 0 ||
          !state.pendingVaultKeyHex ||
          !/^[a-f0-9]{64}$/u.test(state.pendingVaultKeyHex) ||
          state.pendingVaultKeyHex !== state.expectedVaultKeyHex
        : state.vaultKeyDisposition !== "preserve" ||
          state.pendingVaultKeyHex !== null)
    ) {
      throw new RecoveryKitError(
        "RESTORE_REJECTED",
        "Recovery attachment journal does not match this vault."
      );
    }

    const stagingDirectory = new Directory(Paths.cache, stagingName);
    const seenStaged = new Set<string>();
    const seenDestinations = new Set<string>();
    const files = state.files.map((item) => {
      const stagedName = directChildName(
        stagingDirectory,
        item.stagedReference
      );
      if (
        !stagedName ||
        !PROTECTED_FILE_PATTERN.test(stagedName) ||
        !isScopedProtectedBlobUri(
          item.destinationReference,
          this.vaultScope
        ) ||
        !Number.isSafeInteger(item.protectedByteSize) ||
        item.protectedByteSize <= 0 ||
        item.protectedByteSize > MAX_PROTECTED_ATTACHMENT_BYTES ||
        typeof item.protectedSha256 !== "string" ||
        !/^[a-f0-9]{64}$/u.test(item.protectedSha256) ||
        seenStaged.has(item.stagedReference) ||
        seenDestinations.has(item.destinationReference)
      ) {
        throw new RecoveryKitError(
          "RESTORE_REJECTED",
          "Recovery attachment journal contains an invalid file boundary."
        );
      }
      seenStaged.add(item.stagedReference);
      seenDestinations.add(item.destinationReference);
      return {
        source: new File(item.stagedReference),
        destination: new File(item.destinationReference),
        protectedByteSize: item.protectedByteSize,
        protectedSha256: item.protectedSha256
      };
    });

    let expectedVaultKey: Uint8Array | null = state.expectedVaultKeyHex
      ? hexToBytes(state.expectedVaultKeyHex)
      : null;
    try {
      if (outcome === "rollback") {
        if (expectedVaultKey) {
          const installed = await this.secureStore.get(
            this.vaultScope.attachmentKeyName
          );
          const keyIsPresent = installed !== null;
          const keyMatches = matchesSecretAndWipe(
            installed,
            expectedVaultKey
          );
          if (state.vaultKeyDisposition === "preserve") {
            if (!keyMatches) {
              throw new RecoveryKitError(
                "RESTORE_REJECTED",
                "The preserved attachment key changed during interrupted restore recovery."
              );
            }
          } else if (keyIsPresent) {
            if (!keyMatches) {
              throw new RecoveryKitError(
                "RESTORE_REJECTED",
                "The attachment key changed during interrupted restore recovery."
              );
            }
            await this.secureStore.remove(
              this.vaultScope.attachmentKeyName
            );
          }
        }
        for (const item of files) {
          if (item.destination.exists) {
            if (
              !(await protectedFileMatches(
                item.destination,
                item.protectedByteSize,
                item.protectedSha256
              ))
            ) {
              throw new RecoveryKitError(
                "STORAGE_FAILED",
                "An interrupted restored attachment failed digest verification before rollback."
              );
            }
            item.destination.delete();
          }
          if (item.source.exists) {
            if (
              !(await protectedFileMatches(
                item.source,
                item.protectedByteSize,
                item.protectedSha256
              ))
            ) {
              throw new RecoveryKitError(
                "STORAGE_FAILED",
                "A staged attachment failed digest verification before rollback."
              );
            }
            item.source.delete();
          }
        }
        deleteDirectoryIfPresent(stagingDirectory);
        return;
      }

      if (expectedVaultKey) {
        const installed = await this.secureStore.get(
          this.vaultScope.attachmentKeyName
        );
        const keyIsPresent = installed !== null;
        const keyMatches = matchesSecretAndWipe(
          installed,
          expectedVaultKey
        );
        if (state.vaultKeyDisposition === "install") {
          if (keyIsPresent && !keyMatches) {
            throw new RecoveryKitError(
              "RESTORE_REJECTED",
              "The attachment key changed during interrupted restore recovery."
            );
          }
          if (!keyIsPresent) {
            await this.secureStore.set(
              this.vaultScope.attachmentKeyName,
              expectedVaultKey
            );
            const installedAfterWrite = await this.secureStore.get(
              this.vaultScope.attachmentKeyName
            );
            if (
              !matchesSecretAndWipe(
                installedAfterWrite,
                expectedVaultKey
              )
            ) {
              throw new RecoveryKitError(
                "RESTORE_REJECTED",
                "The attachment key did not verify after interrupted restore installation."
              );
            }
          }
        } else if (!keyMatches) {
          throw new RecoveryKitError(
            "RESTORE_REJECTED",
            "The preserved attachment key changed after restart."
          );
        }
      }
      const targetDirectory = protectedDirectory(this.vaultScope);
      targetDirectory.create({
        idempotent: true,
        intermediates: true
      });
      for (const item of files) {
        if (item.destination.exists) {
          if (
            !(await protectedFileMatches(
              item.destination,
              item.protectedByteSize,
              item.protectedSha256
            ))
          ) {
            throw new RecoveryKitError(
              "STORAGE_FAILED",
              "A restored protected attachment failed digest verification."
            );
          }
          if (item.source.exists) {
            if (
              !(await protectedFileMatches(
                item.source,
                item.protectedByteSize,
                item.protectedSha256
              ))
            ) {
              throw new RecoveryKitError(
                "STORAGE_FAILED",
                "A staged protected attachment failed digest verification."
              );
            }
            item.source.delete();
          }
          continue;
        }
        if (
          !(await protectedFileMatches(
            item.source,
            item.protectedByteSize,
            item.protectedSha256
          ))
        ) {
          throw new RecoveryKitError(
            "STORAGE_FAILED",
            "A staged protected attachment is missing or corrupt after restart."
          );
        }
        await item.source.move(item.destination, {
          overwrite: false
        });
        if (
          !(await protectedFileMatches(
            item.destination,
            item.protectedByteSize,
            item.protectedSha256
          ))
        ) {
          throw new RecoveryKitError(
            "STORAGE_FAILED",
            "A restored protected attachment did not verify after restart."
          );
        }
      }
      if (expectedVaultKey) {
        const finalizedKey = await this.secureStore.get(
          this.vaultScope.attachmentKeyName
        );
        if (
          !matchesSecretAndWipe(finalizedKey, expectedVaultKey)
        ) {
          throw new RecoveryKitError(
            "RESTORE_REJECTED",
            "The attachment key changed while interrupted recovery was completing."
          );
        }
      }
      deleteDirectoryIfPresent(stagingDirectory);
    } finally {
      expectedVaultKey?.fill(0);
      expectedVaultKey = null;
    }
  }

  async close(): Promise<void> {
    deleteDirectoryIfPresent(materializedDirectory(this.vaultScope));
  }

  async lock(): Promise<void> {
    this.locked = true;
    await this.close();
  }

  async purge(): Promise<void> {
    await this.lock();
    const results = await Promise.allSettled([
      Promise.resolve().then(() =>
        deleteDirectoryIfPresent(protectedDirectory(this.vaultScope))
      ),
      Promise.resolve().then(() =>
        deleteDirectoryIfPresent(draftProtectedDirectory(this.vaultScope))
      ),
      removeAttachmentKey(this.secureStore, this.vaultScope)
    ]);
    if (results.some((result) => result.status === "rejected")) {
      throw new Error("The local attachment vault could not be fully purged.");
    }
  }

  private assertUnlocked(): void {
    if (this.locked) {
      throw new AttachmentReadError(
        "VAULT_LOCKED",
        "The local attachment vault is locked."
      );
    }
  }
}

export function createDefaultAttachmentStore(
  requestedScope: VaultScope = DEVICE_PREVIEW_VAULT_SCOPE
): ScopedAttachmentStore {
  const scope = assertValidVaultScope(requestedScope);
  if (
    Platform.OS === "web" ||
    process.env.NODE_ENV === "test" ||
    isExpoGoPreview
  ) {
    return new MemoryPreviewAttachmentStore(scope);
  }
  if (isDevicePreviewVaultScope(scope)) {
    const locked = new MemoryPreviewAttachmentStore(scope);
    void locked.lock();
    return locked;
  }
  // The remaining validated native layouts are the isolated signed sample and
  // authenticated household scopes. Both use their own AES key and protected
  // directory; neither can materialize or ingest files from the other.
  return new EncryptedFileAttachmentStore(
    new ExpoSecureKeyStore(),
    scope
  );
}
