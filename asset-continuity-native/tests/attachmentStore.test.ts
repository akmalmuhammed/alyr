import type { SecureKeyStore } from "@alyr/contracts";

jest.mock("expo-file-system", () => {
  const files = new Map<string, Uint8Array>();

  function joinUri(
    parent: string | { readonly uri: string },
    name?: string
  ): string {
    const parentUri = typeof parent === "string" ? parent : parent.uri;
    if (!name) {
      return parentUri;
    }
    return `${parentUri.endsWith("/") ? parentUri : `${parentUri}/`}${name}`;
  }

  class MockDirectory {
    readonly uri: string;

    constructor(
      parent: string | { readonly uri: string },
      name?: string
    ) {
      this.uri = joinUri(parent, name);
    }

    get exists(): boolean {
      const root = this.uri.endsWith("/") ? this.uri : `${this.uri}/`;
      return [...files.keys()].some((uri) => uri.startsWith(root));
    }

    create(): void {}

    delete(): void {
      const root = this.uri.endsWith("/") ? this.uri : `${this.uri}/`;
      [...files.keys()]
        .filter((uri) => uri.startsWith(root))
        .forEach((uri) => files.delete(uri));
    }
  }

  class MockFile {
    readonly uri: string;

    constructor(
      parent: string | { readonly uri: string },
      name?: string
    ) {
      this.uri = joinUri(parent, name);
    }

    get exists(): boolean {
      return files.has(this.uri);
    }

    get size(): number {
      return files.get(this.uri)?.byteLength ?? 0;
    }

    get name(): string {
      return this.uri.split("/").at(-1) ?? "";
    }

    create(options?: { readonly overwrite?: boolean }): void {
      if (files.has(this.uri) && !options?.overwrite) {
        throw new Error("File already exists");
      }
      files.set(this.uri, new Uint8Array());
    }

    write(value: Uint8Array): void {
      files.set(this.uri, new Uint8Array(value));
    }

    async arrayBuffer(): Promise<ArrayBuffer> {
      const value = files.get(this.uri);
      if (!value) {
        throw new Error("File does not exist");
      }
      return new Uint8Array(value).buffer;
    }

    async bytes(): Promise<Uint8Array> {
      const value = files.get(this.uri);
      if (!value) {
        throw new Error("File does not exist");
      }
      return new Uint8Array(value);
    }

    async move(
      destination: { readonly uri: string },
      options?: { readonly overwrite?: boolean }
    ): Promise<void> {
      const value = files.get(this.uri);
      if (!value) {
        throw new Error("File does not exist");
      }
      if (files.has(destination.uri) && !options?.overwrite) {
        throw new Error("Destination already exists");
      }
      files.set(destination.uri, new Uint8Array(value));
      files.delete(this.uri);
    }

    delete(): void {
      files.delete(this.uri);
    }
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: {
      cache: { uri: "file:///cache/" },
      document: { uri: "file:///document/" }
    },
    __files: files
  };
});

jest.mock("expo-crypto", () => {
  let plaintext = new Uint8Array([65, 76, 89, 82]);
  let decryptFailure = false;

  function fakeDigest(value: Uint8Array): Uint8Array {
    const output = new Uint8Array(32);
    value.forEach((byte, index) => {
      const slot = index % output.length;
      output[slot] = ((output[slot] ?? 0) + byte + index) % 256;
    });
    return output;
  }

  class MockEncryptionKey {
    static import = jest.fn(async (value: Uint8Array) => ({
      value: new Uint8Array(value)
    }));
  }

  class MockSealedData {
    static fromCombined = jest.fn((value: Uint8Array) => ({
      value: new Uint8Array(value)
    }));
  }

  const aesDecryptAsync = jest.fn(async () => {
    if (decryptFailure) {
      throw new Error("authentication failed");
    }
    return new Uint8Array(plaintext);
  });

  return {
    AESEncryptionKey: MockEncryptionKey,
    AESSealedData: MockSealedData,
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    aesDecryptAsync,
    aesEncryptAsync: jest.fn(async (value: Uint8Array) => ({
      combined: jest.fn(async () => new Uint8Array([1, ...value, 2]))
    })),
    digest: jest.fn(async (_algorithm: string, value: Uint8Array) =>
      fakeDigest(value).buffer
    ),
    getRandomBytes: jest.fn((length: number) =>
      Uint8Array.from({ length }, (_value, index) => index + 1)
    ),
    __reset(): void {
      plaintext = new Uint8Array([65, 76, 89, 82]);
      decryptFailure = false;
      aesDecryptAsync.mockClear();
      MockEncryptionKey.import.mockClear();
      MockSealedData.fromCombined.mockClear();
    },
    __setPlaintext(value: Uint8Array): void {
      plaintext = new Uint8Array(value);
    },
    __setDecryptFailure(value: boolean): void {
      decryptFailure = value;
    }
  };
});

import {
  AttachmentReadError,
  EncryptedFileAttachmentStore,
  MemoryPreviewAttachmentStore,
  type AttachmentReadRequest,
  type MaterializedAttachment
} from "@/data/attachmentStore";
import {
  ATTACHMENT_KEY_NAME,
  getOrCreateAttachmentKey
} from "@/data/secureKeyStore";
import { vaultScopeFromOpaqueId } from "@/data/vaultScope";
import { createWorkspace } from "@/domain/sample";

interface MockFileSystemModule {
  readonly __files: Map<string, Uint8Array>;
}

interface MockCryptoModule {
  readonly digest: (
    algorithm: string,
    value: Uint8Array
  ) => Promise<ArrayBuffer>;
  readonly CryptoDigestAlgorithm: { readonly SHA256: string };
  readonly aesDecryptAsync: jest.Mock;
  readonly __reset: () => void;
  readonly __setPlaintext: (value: Uint8Array) => void;
  readonly __setDecryptFailure: (value: boolean) => void;
}

const mockFileSystem =
  jest.requireMock<MockFileSystemModule>("expo-file-system");
const mockCrypto = jest.requireMock<MockCryptoModule>("expo-crypto");

function secureStoreWith(
  key: Uint8Array | null
): SecureKeyStore & {
  readonly get: jest.Mock;
  readonly set: jest.Mock;
} {
  return {
    get: jest.fn(async () => key),
    set: jest.fn(async () => undefined),
    remove: jest.fn(async () => undefined)
  };
}

async function checksumFor(value: Uint8Array): Promise<string> {
  const buffer = await mockCrypto.digest(
    mockCrypto.CryptoDigestAlgorithm.SHA256,
    value
  );
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function encryptedRequest(
  checksumSha256: string | null,
  byteSize = 4
): AttachmentReadRequest {
  return {
    storage: "encrypted",
    protectedUri: `file:///document/alyr-attachments/${"a".repeat(
      64
    )}.alyrblob`,
    fileName: "ownership-record.pdf",
    mimeType: "application/pdf",
    byteSize,
    checksumSha256
  };
}

beforeEach(() => {
  mockFileSystem.__files.clear();
  mockCrypto.__reset();
});

describe("encrypted attachment ingestion contract", () => {
  it("persists the measured byte size when picker metadata reports zero", async () => {
    const sourceUri = "file:///cache/picker-photo.jpg";
    const sourceBytes = new Uint8Array([7, 6, 5, 4, 3, 2]);
    mockFileSystem.__files.set(sourceUri, sourceBytes);
    const store = new EncryptedFileAttachmentStore(
      secureStoreWith(new Uint8Array(32).fill(12))
    );

    const ingested = await store.ingest({
      localUri: sourceUri,
      fileName: "picker-photo.jpg",
      mimeType: "image/jpeg",
      byteSize: 0,
      protectedUri: null,
      checksumSha256: null,
      encryptedAtRest: false
    });

    expect(ingested.byteSize).toBe(sourceBytes.byteLength);
    expect(ingested.encryptedAtRest).toBe(true);
    expect(ingested.protectedUri).toMatch(/\.alyrblob$/u);
    expect(ingested.checksumSha256).toHaveLength(64);
    expect(mockFileSystem.__files.has(sourceUri)).toBe(false);
  });

  it("keeps protected paths, keys, and reads inside one opaque vault scope", async () => {
    const scopeA = vaultScopeFromOpaqueId(`auth-v1-${"1".repeat(64)}`);
    const scopeB = vaultScopeFromOpaqueId(`auth-v1-${"2".repeat(64)}`);
    const keyStore = secureStoreWith(new Uint8Array(32).fill(13));
    const storeA = new EncryptedFileAttachmentStore(keyStore, scopeA);
    const storeB = new EncryptedFileAttachmentStore(keyStore, scopeB);
    const sourceUri = "file:///cache/scoped-photo.jpg";
    const sourceBytes = new Uint8Array([65, 76, 89, 82]);
    mockFileSystem.__files.set(sourceUri, sourceBytes);

    const ingested = await storeA.ingest({
      localUri: sourceUri,
      fileName: "scoped-photo.jpg",
      mimeType: "image/jpeg",
      byteSize: sourceBytes.byteLength,
      protectedUri: null,
      checksumSha256: null,
      encryptedAtRest: false
    });

    expect(ingested.protectedUri).toContain(
      `/${scopeA.protectedAttachmentDirectoryName}/`
    );
    expect(ingested.protectedUri).not.toContain(
      scopeB.protectedAttachmentDirectoryName
    );
    expect(keyStore.get).toHaveBeenCalledWith(scopeA.attachmentKeyName);
    await expect(storeB.ingest(ingested)).rejects.toThrow(
      "does not belong to this local vault"
    );

    const readRequest: AttachmentReadRequest = {
      storage: "encrypted",
      protectedUri: ingested.protectedUri ?? "",
      fileName: ingested.fileName,
      mimeType: ingested.mimeType,
      byteSize: ingested.byteSize,
      checksumSha256: ingested.checksumSha256 ?? null
    };
    await expect(storeB.materializeForViewing(readRequest)).rejects.toMatchObject({
      code: "INVALID_REFERENCE"
    });
    const materialized = await storeA.materializeForViewing(readRequest);
    expect(materialized.uri).toContain(
      `/${scopeA.materializedAttachmentDirectoryName}/`
    );

    await storeA.lock();
    expect(mockFileSystem.__files.has(materialized.uri)).toBe(false);
    await expect(storeA.materializeForViewing(readRequest)).rejects.toMatchObject({
      code: "VAULT_LOCKED"
    });

    await storeA.purge();
    expect(mockFileSystem.__files.has(ingested.protectedUri ?? "")).toBe(false);
    expect(keyStore.remove).toHaveBeenCalledWith(scopeA.attachmentKeyName);
  });

  it("verifies downloaded bytes, encrypts them, and reopens the persisted local vault copy", async () => {
    const downloadedBytes = new Uint8Array([65, 76, 89, 82]);
    const expectedPlaintext = downloadedBytes.slice();
    const checksumSha256 = await checksumFor(expectedPlaintext);
    const store = new EncryptedFileAttachmentStore(
      secureStoreWith(new Uint8Array(32).fill(14))
    );

    const protectedFile = await store.ingestVerifiedBytes({
      bytes: downloadedBytes,
      fileName: "remote-proof.pdf",
      mimeType: "application/pdf",
      byteSize: expectedPlaintext.byteLength,
      checksumSha256
    });

    expect(downloadedBytes).toEqual(new Uint8Array(4));
    expect(protectedFile).toMatchObject({
      byteSize: expectedPlaintext.byteLength,
      checksumSha256,
      encryptedAtRest: true
    });
    expect(protectedFile.localUri).toBe(protectedFile.protectedUri);
    expect(protectedFile.localUri).toMatch(/\.alyrblob$/u);
    expect(mockFileSystem.__files.has(protectedFile.localUri)).toBe(true);

    mockCrypto.__setPlaintext(expectedPlaintext);
    const materialized = await store.materializeForViewing({
      storage: "encrypted",
      protectedUri: protectedFile.protectedUri ?? "",
      fileName: protectedFile.fileName,
      mimeType: protectedFile.mimeType,
      byteSize: protectedFile.byteSize,
      checksumSha256: protectedFile.checksumSha256 ?? null
    });
    expect(mockFileSystem.__files.get(materialized.uri)).toEqual(
      expectedPlaintext
    );
  });
});

describe("encrypted attachment viewing contract", () => {
  it("decrypts, verifies, materializes, and cleans up a protected file", async () => {
    const plaintext = new Uint8Array([9, 8, 7, 6, 5]);
    mockCrypto.__setPlaintext(plaintext);
    const request = encryptedRequest(
      await checksumFor(plaintext),
      plaintext.byteLength
    );
    mockFileSystem.__files.set(
      request.storage === "encrypted" ? request.protectedUri : "",
      new Uint8Array([101, 102, 103])
    );
    const keyStore = secureStoreWith(new Uint8Array(32).fill(7));
    const store = new EncryptedFileAttachmentStore(keyStore);

    const materialized = await store.materializeForViewing(request);

    expect(keyStore.get).toHaveBeenCalledWith(ATTACHMENT_KEY_NAME);
    expect(mockCrypto.aesDecryptAsync).toHaveBeenCalledTimes(1);
    expect(materialized).toMatchObject({
      fileName: "ownership-record.pdf",
      mimeType: "application/pdf",
      byteSize: plaintext.byteLength,
      checksumSha256: await checksumFor(plaintext),
      integrity: "aes-gcm-and-sha256",
      temporary: true
    });
    expect(materialized.uri).toMatch(
      /^file:\/\/\/cache\/alyr-materialized\/alyr-view-[a-f0-9]{32}\.pdf$/u
    );
    expect(mockFileSystem.__files.get(materialized.uri)).toEqual(plaintext);

    await store.cleanupMaterialized(materialized);
    expect(mockFileSystem.__files.has(materialized.uri)).toBe(false);
  });

  it("reports AES-GCM authentication when legacy metadata has no checksum", async () => {
    const request = encryptedRequest(null);
    mockFileSystem.__files.set(
      request.storage === "encrypted" ? request.protectedUri : "",
      new Uint8Array([11, 12, 13])
    );
    const store = new EncryptedFileAttachmentStore(
      secureStoreWith(new Uint8Array(32).fill(8))
    );

    const materialized = await store.materializeForViewing(request);

    expect(materialized.integrity).toBe("aes-gcm-authenticated");
    expect(materialized.checksumSha256).toHaveLength(64);
  });

  it("fails closed before writing plaintext when the saved checksum differs", async () => {
    const request = encryptedRequest("0".repeat(64));
    mockFileSystem.__files.set(
      request.storage === "encrypted" ? request.protectedUri : "",
      new Uint8Array([21, 22, 23])
    );
    const store = new EncryptedFileAttachmentStore(
      secureStoreWith(new Uint8Array(32).fill(9))
    );

    await expect(store.materializeForViewing(request)).rejects.toMatchObject({
      name: "AttachmentReadError",
      code: "CHECKSUM_MISMATCH"
    });
    expect(
      [...mockFileSystem.__files.keys()].some((uri) =>
        uri.includes("/alyr-materialized/")
      )
    ).toBe(false);
  });

  it("fails closed when decrypted bytes do not match the saved size", async () => {
    const request = encryptedRequest(null, 400);
    mockFileSystem.__files.set(
      request.storage === "encrypted" ? request.protectedUri : "",
      new Uint8Array([24, 25, 26])
    );
    const store = new EncryptedFileAttachmentStore(
      secureStoreWith(new Uint8Array(32).fill(9))
    );

    await expect(store.materializeForViewing(request)).rejects.toMatchObject({
      name: "AttachmentReadError",
      code: "SIZE_MISMATCH"
    });
    expect(
      [...mockFileSystem.__files.keys()].some((uri) =>
        uri.includes("/alyr-materialized/")
      )
    ).toBe(false);
  });

  it("fails closed when the device key is missing", async () => {
    const request = encryptedRequest(null);
    mockFileSystem.__files.set(
      request.storage === "encrypted" ? request.protectedUri : "",
      new Uint8Array([31, 32, 33])
    );
    const store = new EncryptedFileAttachmentStore(secureStoreWith(null));

    await expect(store.materializeForViewing(request)).rejects.toMatchObject({
      name: "AttachmentReadError",
      code: "KEY_UNAVAILABLE"
    });
    expect(mockCrypto.aesDecryptAsync).not.toHaveBeenCalled();
  });

  it("does not expose bytes when AES-GCM authentication fails", async () => {
    const request = encryptedRequest(null);
    mockFileSystem.__files.set(
      request.storage === "encrypted" ? request.protectedUri : "",
      new Uint8Array([41, 42, 43])
    );
    mockCrypto.__setDecryptFailure(true);
    const store = new EncryptedFileAttachmentStore(
      secureStoreWith(new Uint8Array(32).fill(10))
    );

    await expect(store.materializeForViewing(request)).rejects.toMatchObject({
      name: "AttachmentReadError",
      code: "DECRYPTION_FAILED"
    });
    expect(
      [...mockFileSystem.__files.keys()].some((uri) =>
        uri.includes("/alyr-materialized/")
      )
    ).toBe(false);
  });

  it("rejects cleanup outside the dedicated temporary directory", async () => {
    const store = new EncryptedFileAttachmentStore(
      secureStoreWith(new Uint8Array(32).fill(11))
    );
    const forged: MaterializedAttachment = {
      uri: "file:///cache/unrelated/user-file.pdf",
      fileName: "user-file.pdf",
      mimeType: "application/pdf",
      byteSize: 1,
      checksumSha256: null,
      integrity: "aes-gcm-authenticated",
      temporary: true
    };
    mockFileSystem.__files.set(forged.uri, new Uint8Array([1]));

    await expect(store.cleanupMaterialized(forged)).rejects.toBeInstanceOf(
      AttachmentReadError
    );
    expect(mockFileSystem.__files.has(forged.uri)).toBe(true);
  });
});

describe("preview attachment viewing contract", () => {
  it("labels a plaintext Expo Go/web passthrough as unverified and persistent", async () => {
    const store = new MemoryPreviewAttachmentStore();
    const materialized = await store.materializeForViewing({
      storage: "plaintext-preview",
      localUri: "file:///preview/photo.jpg",
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      byteSize: 128
    });

    expect(materialized).toEqual({
      uri: "file:///preview/photo.jpg",
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      byteSize: 128,
      checksumSha256: null,
      integrity: "unverified-preview",
      temporary: false
    });
    await expect(
      store.cleanupMaterialized(materialized)
    ).resolves.toBeUndefined();
  });

  it("does not pretend that preview mode can open a protected blob", async () => {
    const store = new MemoryPreviewAttachmentStore();

    await expect(
      store.materializeForViewing(encryptedRequest(null))
    ).rejects.toMatchObject({
      code: "PROTECTED_ATTACHMENT_UNAVAILABLE"
    });
  });
});

describe("attachment key lifecycle", () => {
  it("does not silently replace an existing invalid attachment key", async () => {
    const keyStore = secureStoreWith(new Uint8Array(16));

    await expect(getOrCreateAttachmentKey(keyStore)).rejects.toThrow(
      "attachment key is invalid"
    );
    expect(keyStore.set).not.toHaveBeenCalled();
  });
});

describe("Recovery Kit attachment boundary", () => {
  it("stages opaque protected bytes and removes installed files and a new key on rollback", async () => {
    const keyStore = secureStoreWith(null);
    const store = new EncryptedFileAttachmentStore(keyStore);
    const protectedBytes = new Uint8Array([31, 41, 59, 26, 53]);
    const protectedSha256 = await checksumFor(protectedBytes);
    const sample = createWorkspace("sample");
    const originalEvidence = sample.evidence[0]!;
    const originalAsset = sample.assets.find(
      (asset) => asset.id === originalEvidence.assetId
    )!;
    const workspace = {
      ...sample,
      evidence: [originalEvidence],
      assets: [originalAsset],
      placeDocuments: []
    };

    const transaction = await store.beginRecoveryAttachmentRestore({
      kitId: "a".repeat(32),
      createdAt: "2026-07-27T10:00:00.000Z",
      workspaceSchemaVersion: workspace.schemaVersion,
      attachmentCount: 1
    });
    await transaction.stageAttachmentVaultKey(new Uint8Array(32).fill(7));
    await transaction.stageProtectedAttachment({
      id: originalEvidence.blobObjectId,
      evidenceId: originalEvidence.id,
      fileName: originalEvidence.fileName,
      mimeType: originalEvidence.mimeType,
      plaintextByteSize: originalEvidence.byteSize,
      plaintextChecksumSha256: originalEvidence.checksumSha256,
      protectedFormat: "expo-aes-gcm-combined-v1",
      protectedBytes,
      protectedSha256
    });
    const staged = (await transaction.stageWorkspace(
      workspace,
      workspace.schemaVersion
    )) as typeof workspace;
    const restoredUri = staged.evidence[0]!.localUri!;

    expect(restoredUri).toMatch(
      /^file:\/\/\/document\/alyr-attachments\/[a-f0-9]{64}\.alyrblob$/u
    );
    expect(restoredUri).not.toContain(originalEvidence.id);
    expect(mockFileSystem.__files.has(restoredUri)).toBe(false);

    await transaction.commit();
    expect(mockFileSystem.__files.get(restoredUri)).toEqual(protectedBytes);
    expect(keyStore.set).toHaveBeenCalledWith(
      ATTACHMENT_KEY_NAME,
      expect.any(Uint8Array)
    );

    await transaction.rollback();
    expect(mockFileSystem.__files.has(restoredUri)).toBe(false);
    expect(keyStore.remove).toHaveBeenCalledWith(ATTACHMENT_KEY_NAME);
    expect(
      [...mockFileSystem.__files.keys()].some((uri) =>
        uri.includes("alyr-recovery-stage-")
      )
    ).toBe(false);
  });

  it("rejects a conflicting current attachment key before staging files", async () => {
    const store = new EncryptedFileAttachmentStore(
      secureStoreWith(new Uint8Array(32).fill(1))
    );
    const transaction = await store.beginRecoveryAttachmentRestore({
      kitId: "b".repeat(32),
      createdAt: "2026-07-27T10:00:00.000Z",
      workspaceSchemaVersion: 2,
      attachmentCount: 1
    });

    await expect(
      transaction.stageAttachmentVaultKey(new Uint8Array(32).fill(2))
    ).rejects.toMatchObject({ code: "RESTORE_REJECTED" });
    await transaction.rollback();
  });
});
