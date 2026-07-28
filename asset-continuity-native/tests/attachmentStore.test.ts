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
import {
  SIGNED_OUT_SAMPLE_VAULT_SCOPE,
  vaultScopeFromOpaqueId
} from "@/data/vaultScope";
import { createWorkspace } from "@/domain/sample";

interface MockFileSystemModule {
  readonly __files: Map<string, Uint8Array>;
}

interface MockCryptoModule {
  readonly digest: jest.Mock<Promise<ArrayBuffer>, [string, Uint8Array]>;
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

function statefulSecureStore(
  initial: Uint8Array | null
): SecureKeyStore & {
  readonly values: Map<string, Uint8Array>;
  readonly get: jest.Mock;
  readonly set: jest.Mock;
  readonly remove: jest.Mock;
} {
  const values = new Map<string, Uint8Array>();
  if (initial) values.set(ATTACHMENT_KEY_NAME, new Uint8Array(initial));
  return {
    values,
    get: jest.fn(async (name: string) => {
      const value = values.get(name);
      return value ? new Uint8Array(value) : null;
    }),
    set: jest.fn(async (name: string, value: Uint8Array) => {
      values.set(name, new Uint8Array(value));
    }),
    remove: jest.fn(async (name: string) => {
      values.delete(name);
    })
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

async function stageSingleRecoveryAttachment(input: {
  readonly keyStore: SecureKeyStore;
  readonly importedKey: Uint8Array;
  readonly kitId: string;
  readonly protectedBytes?: Uint8Array;
}) {
  const store = new EncryptedFileAttachmentStore(input.keyStore);
  const protectedBytes =
    input.protectedBytes ?? new Uint8Array([13, 21, 34, 55]);
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
    kitId: input.kitId,
    createdAt: "2026-07-28T10:00:00.000Z",
    workspaceSchemaVersion: workspace.schemaVersion,
    attachmentCount: 1
  });
  await transaction.stageAttachmentVaultKey(input.importedKey);
  await transaction.stageProtectedAttachment({
    id: originalEvidence.blobObjectId,
    evidenceId: originalEvidence.id,
    fileName: originalEvidence.fileName,
    mimeType: originalEvidence.mimeType,
    plaintextByteSize: originalEvidence.byteSize,
    plaintextChecksumSha256: originalEvidence.checksumSha256,
    protectedFormat: "expo-aes-gcm-combined-v1",
    protectedBytes,
    protectedSha256: await checksumFor(protectedBytes)
  });
  const stagedWorkspace = (await transaction.stageWorkspace(
    workspace,
    workspace.schemaVersion
  )) as typeof workspace;
  const journal = await transaction.createRecoveryRestoreJournalState();
  return {
    journal,
    protectedBytes,
    restoredUri: stagedWorkspace.evidence[0]!.localUri!,
    store,
    transaction
  };
}

describe("encrypted attachment ingestion contract", () => {
  it("encrypts signed-out sample attachments in a scope rejected by authenticated stores", async () => {
    const authenticatedScope = vaultScopeFromOpaqueId(
      `auth-v1-${"9".repeat(64)}`
    );
    const keyStore = secureStoreWith(new Uint8Array(32).fill(21));
    const sampleStore = new EncryptedFileAttachmentStore(
      keyStore,
      SIGNED_OUT_SAMPLE_VAULT_SCOPE
    );
    const authenticatedStore = new EncryptedFileAttachmentStore(
      keyStore,
      authenticatedScope
    );
    const sourceUri = "file:///cache/signed-sample-photo.jpg";
    const sourceBytes = new Uint8Array([83, 65, 77, 80, 76, 69]);
    mockFileSystem.__files.set(sourceUri, sourceBytes);

    const ingested = await sampleStore.ingest({
      localUri: sourceUri,
      fileName: "signed-sample-photo.jpg",
      mimeType: "image/jpeg",
      byteSize: sourceBytes.byteLength,
      protectedUri: null,
      checksumSha256: null,
      encryptedAtRest: false
    });

    expect(sampleStore.kind).toBe("encrypted-files");
    expect(sampleStore.encryptedAtRest).toBe(true);
    expect(sampleStore.scopeId).toBe(
      SIGNED_OUT_SAMPLE_VAULT_SCOPE.scopeId
    );
    expect(ingested.encryptedAtRest).toBe(true);
    expect(ingested.protectedUri).toContain(
      `/${SIGNED_OUT_SAMPLE_VAULT_SCOPE.protectedAttachmentDirectoryName}/`
    );
    expect(keyStore.get).toHaveBeenCalledWith(
      SIGNED_OUT_SAMPLE_VAULT_SCOPE.attachmentKeyName
    );
    await expect(authenticatedStore.ingest(ingested)).rejects.toThrow(
      "does not belong to this local vault"
    );
  });

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

describe("protected capture-draft staging", () => {
  it("encrypts cache bytes durably, reopens them after restart, and promotes them on save", async () => {
    const keyStore = secureStoreWith(new Uint8Array(32).fill(17));
    const scope = vaultScopeFromOpaqueId(
      `auth-v1-${"d".repeat(64)}`
    );
    const store = new EncryptedFileAttachmentStore(keyStore, scope);
    const sourceUri = "file:///cache/process-death-photo.jpg";
    const sourceBytes = new Uint8Array([65, 76, 89, 82]);
    mockFileSystem.__files.set(sourceUri, sourceBytes);
    mockCrypto.__setPlaintext(sourceBytes);

    const staged = await store.stageForDraft({
      localUri: sourceUri,
      fileName: "process-death-photo.jpg",
      mimeType: "image/jpeg",
      byteSize: sourceBytes.byteLength
    });

    expect(staged).toMatchObject({
      encryptedAtRest: true,
      checksumSha256: expect.stringMatching(/^[a-f0-9]{64}$/u)
    });
    expect(staged.protectedUri).toContain("-attachments-drafts/");
    expect(staged.protectedUri).toMatch(/\.alyrdraft$/u);
    expect(mockFileSystem.__files.has(sourceUri)).toBe(true);

    const reopened = new EncryptedFileAttachmentStore(keyStore, scope);
    await expect(reopened.verifyDraftFile(staged)).resolves.toBe(true);
    await expect(
      reopened.materializeDraftForViewing(staged)
    ).resolves.toMatchObject({
      byteSize: sourceBytes.byteLength,
      checksumSha256: staged.checksumSha256,
      integrity: "aes-gcm-and-sha256",
      temporary: true
    });

    const promoted = await reopened.ingest(staged);
    expect(promoted.protectedUri).toContain("-attachments/");
    expect(promoted.protectedUri).toMatch(/\.alyrblob$/u);
    expect(promoted.protectedUri).not.toBe(staged.protectedUri);
    expect(mockFileSystem.__files.has(staged.protectedUri!)).toBe(true);
  });

  it("fails closed for missing or corrupt staged bytes and deletes only draft-owned files", async () => {
    const keyStore = secureStoreWith(new Uint8Array(32).fill(19));
    const scope = vaultScopeFromOpaqueId(
      `auth-v1-${"e".repeat(64)}`
    );
    const store = new EncryptedFileAttachmentStore(keyStore, scope);
    const sourceUri = "file:///cache/receipt.pdf";
    const sourceBytes = new Uint8Array([65, 76, 89, 82]);
    mockFileSystem.__files.set(sourceUri, sourceBytes);
    mockCrypto.__setPlaintext(sourceBytes);
    const staged = await store.stageForDraft({
      localUri: sourceUri,
      fileName: "receipt.pdf",
      mimeType: "application/pdf",
      byteSize: sourceBytes.byteLength
    });

    mockCrypto.__setDecryptFailure(true);
    await expect(store.verifyDraftFile(staged)).resolves.toBe(false);
    mockCrypto.__setDecryptFailure(false);
    mockFileSystem.__files.delete(staged.protectedUri!);
    await expect(store.verifyDraftFile(staged)).resolves.toBe(false);

    const canonicalUri = `file:///document/${scope.protectedAttachmentDirectoryName}/${"f".repeat(64)}.alyrblob`;
    mockFileSystem.__files.set(canonicalUri, new Uint8Array([1, 2, 3]));
    await store.discardDraftFile({
      ...staged,
      protectedUri: canonicalUri
    });
    expect(mockFileSystem.__files.has(canonicalUri)).toBe(true);
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
    const keyStore = statefulSecureStore(null);
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
    expect(keyStore.values.has(ATTACHMENT_KEY_NAME)).toBe(false);
    expect(
      [...mockFileSystem.__files.keys()].some((uri) =>
        uri.includes("alyr-recovery-stage-")
      )
    ).toBe(false);
  });

  it("rejects an ungated key introduced after staging without deleting it", async () => {
    const importedKey = new Uint8Array(32).fill(7);
    const replacementKey = new Uint8Array(32).fill(8);
    const keyStore = statefulSecureStore(null);
    const staged = await stageSingleRecoveryAttachment({
      keyStore,
      importedKey,
      kitId: "6".repeat(32)
    });
    keyStore.values.set(
      ATTACHMENT_KEY_NAME,
      new Uint8Array(replacementKey)
    );

    await expect(staged.transaction.commit()).rejects.toMatchObject({
      code: "RESTORE_REJECTED"
    });
    expect(keyStore.values.get(ATTACHMENT_KEY_NAME)).toEqual(
      replacementKey
    );
    expect(keyStore.remove).not.toHaveBeenCalled();
    expect(mockFileSystem.__files.has(staged.restoredUri)).toBe(false);
    expect(
      [...mockFileSystem.__files.keys()].some((uri) =>
        uri.includes("alyr-recovery-stage-")
      )
    ).toBe(false);
  });

  it("rejects an ungated replacement of the preserved key before finalization", async () => {
    const importedKey = new Uint8Array(32).fill(3);
    const replacementKey = new Uint8Array(32).fill(4);
    const keyStore = statefulSecureStore(importedKey);
    const staged = await stageSingleRecoveryAttachment({
      keyStore,
      importedKey,
      kitId: "7".repeat(32)
    });
    keyStore.values.set(
      ATTACHMENT_KEY_NAME,
      new Uint8Array(replacementKey)
    );

    await expect(staged.transaction.commit()).rejects.toMatchObject({
      code: "RESTORE_REJECTED"
    });
    expect(keyStore.values.get(ATTACHMENT_KEY_NAME)).toEqual(
      replacementKey
    );
    expect(keyStore.remove).not.toHaveBeenCalled();
    expect(mockFileSystem.__files.has(staged.restoredUri)).toBe(false);
  });

  it("verifies a newly installed key and preserves an ungated replacement", async () => {
    const importedKey = new Uint8Array(32).fill(5);
    const replacementKey = new Uint8Array(32).fill(6);
    const keyStore = statefulSecureStore(null);
    keyStore.set.mockImplementation(
      async (name: string, _value: Uint8Array) => {
        keyStore.values.set(name, new Uint8Array(replacementKey));
      }
    );
    const staged = await stageSingleRecoveryAttachment({
      keyStore,
      importedKey,
      kitId: "8".repeat(32)
    });

    await expect(staged.transaction.commit()).rejects.toMatchObject({
      code: "RESTORE_REJECTED"
    });
    expect(keyStore.values.get(ATTACHMENT_KEY_NAME)).toEqual(
      replacementKey
    );
    expect(keyStore.remove).not.toHaveBeenCalled();
    expect(mockFileSystem.__files.has(staged.restoredUri)).toBe(false);
  });

  it("cleans a moved destination after post-move verification fails while preserving the existing key", async () => {
    const importedKey = new Uint8Array(32).fill(11);
    const keyStore = statefulSecureStore(importedKey);
    const staged = await stageSingleRecoveryAttachment({
      keyStore,
      importedKey,
      kitId: "9".repeat(32)
    });
    const [journalFile] = staged.journal.files;
    expect(journalFile).toBeDefined();
    mockCrypto.digest.mockImplementationOnce(async () =>
      new Uint8Array(32).fill(255).buffer
    );

    await expect(staged.transaction.commit()).rejects.toMatchObject({
      code: "STORAGE_FAILED"
    });
    expect(
      mockFileSystem.__files.has(journalFile!.destinationReference)
    ).toBe(false);
    expect(
      mockFileSystem.__files.has(journalFile!.stagedReference)
    ).toBe(false);
    expect(
      [...mockFileSystem.__files.keys()].some((uri) =>
        uri.includes("alyr-recovery-stage-")
      )
    ).toBe(false);
    expect(keyStore.values.get(ATTACHMENT_KEY_NAME)).toEqual(
      importedKey
    );
    expect(keyStore.remove).not.toHaveBeenCalled();
  });

  it("removes only its exact introduced key during live rollback", async () => {
    const importedKey = new Uint8Array(32).fill(12);
    const replacementKey = new Uint8Array(32).fill(13);
    const keyStore = statefulSecureStore(null);
    const staged = await stageSingleRecoveryAttachment({
      keyStore,
      importedKey,
      kitId: "a".repeat(32)
    });
    await staged.transaction.commit();
    keyStore.get.mockImplementationOnce(async (name: string) => {
      const value = keyStore.values.get(name);
      keyStore.values.set(name, new Uint8Array(replacementKey));
      return value ? new Uint8Array(value) : null;
    });

    await staged.transaction.rollback();
    expect(keyStore.values.get(ATTACHMENT_KEY_NAME)).toEqual(
      replacementKey
    );
    expect(keyStore.remove).not.toHaveBeenCalled();
    expect(mockFileSystem.__files.has(staged.restoredUri)).toBe(false);
  });

  it("finalizes transaction secrets idempotently after durable commit", async () => {
    const importedKey = new Uint8Array(32).fill(14);
    const keyStore = statefulSecureStore(null);
    const staged = await stageSingleRecoveryAttachment({
      keyStore,
      importedKey,
      kitId: "b".repeat(32)
    });
    await staged.transaction.commit();

    await expect(staged.transaction.finalize()).resolves.toBeUndefined();
    await expect(staged.transaction.finalize()).resolves.toBeUndefined();
    await expect(staged.transaction.rollback()).resolves.toBeUndefined();
    expect(keyStore.values.get(ATTACHMENT_KEY_NAME)).toEqual(
      importedKey
    );
    expect(mockFileSystem.__files.get(staged.restoredUri)).toEqual(
      staged.protectedBytes
    );
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

  it("finishes a staged key and protected file idempotently after restart", async () => {
    const keyStore = statefulSecureStore(null);
    const store = new EncryptedFileAttachmentStore(keyStore);
    const protectedBytes = new Uint8Array([2, 7, 1, 8, 2, 8]);
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
      kitId: "d".repeat(32),
      createdAt: "2026-07-28T10:00:00.000Z",
      workspaceSchemaVersion: workspace.schemaVersion,
      attachmentCount: 1
    });
    await transaction.stageAttachmentVaultKey(
      new Uint8Array(32).fill(9)
    );
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
    await transaction.stageWorkspace(
      workspace,
      workspace.schemaVersion
    );
    const journal =
      await transaction.createRecoveryRestoreJournalState();
    const [file] = journal.files;
    expect(file).toBeDefined();

    const reopened = new EncryptedFileAttachmentStore(keyStore);
    await reopened.resolveInterruptedRecoveryAttachmentRestore(
      journal,
      "complete"
    );
    expect(mockFileSystem.__files.get(file!.destinationReference)).toEqual(
      protectedBytes
    );
    expect(mockFileSystem.__files.has(file!.stagedReference)).toBe(false);
    expect(keyStore.values.get(ATTACHMENT_KEY_NAME)).toEqual(
      new Uint8Array(32).fill(9)
    );

    await reopened.resolveInterruptedRecoveryAttachmentRestore(
      journal,
      "complete"
    );
    expect(mockFileSystem.__files.get(file!.destinationReference)).toEqual(
      protectedBytes
    );
  });

  it("rejects a replacement of the exact preserved key during restart completion", async () => {
    const importedKey = new Uint8Array(32).fill(15);
    const replacementKey = new Uint8Array(32).fill(16);
    const keyStore = statefulSecureStore(importedKey);
    const staged = await stageSingleRecoveryAttachment({
      keyStore,
      importedKey,
      kitId: "c".repeat(32)
    });
    const [journalFile] = staged.journal.files;
    keyStore.values.set(
      ATTACHMENT_KEY_NAME,
      new Uint8Array(replacementKey)
    );

    const reopened = new EncryptedFileAttachmentStore(keyStore);
    await expect(
      reopened.resolveInterruptedRecoveryAttachmentRestore(
        staged.journal,
        "complete"
      )
    ).rejects.toMatchObject({ code: "RESTORE_REJECTED" });
    expect(keyStore.values.get(ATTACHMENT_KEY_NAME)).toEqual(
      replacementKey
    );
    expect(
      mockFileSystem.__files.has(journalFile!.stagedReference)
    ).toBe(true);
    expect(
      mockFileSystem.__files.has(journalFile!.destinationReference)
    ).toBe(false);
  });

  it("removes a partially installed file and only the matching introduced key after restart", async () => {
    const pendingKey = new Uint8Array(32).fill(5);
    const keyStore = statefulSecureStore(pendingKey);
    const store = new EncryptedFileAttachmentStore(keyStore);
    const stagedReference =
      `file:///cache/alyr-recovery-stage-${"e".repeat(32)}/${"f".repeat(
        64
      )}.alyrblob`;
    const destinationReference =
      `file:///document/alyr-attachments/${"f".repeat(64)}.alyrblob`;
    const bytes = new Uint8Array([1, 6, 1, 8]);
    mockFileSystem.__files.set(destinationReference, bytes);

    await store.resolveInterruptedRecoveryAttachmentRestore(
      {
        journalVersion: 1,
        vaultScopeId: store.scopeId,
        stagingDirectoryReference:
          `file:///cache/alyr-recovery-stage-${"e".repeat(32)}`,
        vaultKeyDisposition: "install",
        pendingVaultKeyHex: "05".repeat(32),
        expectedVaultKeyHex: "05".repeat(32),
        files: [
          {
            stagedReference,
            destinationReference,
            protectedByteSize: bytes.byteLength,
            protectedSha256: await checksumFor(bytes)
          }
        ]
      },
      "rollback"
    );

    expect(mockFileSystem.__files.has(destinationReference)).toBe(false);
    expect(keyStore.values.has(ATTACHMENT_KEY_NAME)).toBe(false);
    expect(keyStore.remove).toHaveBeenCalledWith(ATTACHMENT_KEY_NAME);
  });

  it("rejects same-size staged corruption before restart completion moves or clears it", async () => {
    const keyStore = statefulSecureStore(new Uint8Array(32).fill(4));
    const store = new EncryptedFileAttachmentStore(keyStore);
    const expectedBytes = new Uint8Array([1, 2, 3, 4]);
    const corruptBytes = new Uint8Array([4, 3, 2, 1]);
    const stagingDirectoryReference =
      `file:///cache/alyr-recovery-stage-${"1".repeat(32)}`;
    const stagedReference =
      `${stagingDirectoryReference}/${"2".repeat(64)}.alyrblob`;
    const destinationReference =
      `file:///document/alyr-attachments/${"2".repeat(64)}.alyrblob`;
    mockFileSystem.__files.set(stagedReference, corruptBytes);

    await expect(
      store.resolveInterruptedRecoveryAttachmentRestore(
        {
          journalVersion: 1,
          vaultScopeId: store.scopeId,
          stagingDirectoryReference,
          vaultKeyDisposition: "preserve",
          pendingVaultKeyHex: null,
          expectedVaultKeyHex: "04".repeat(32),
          files: [
            {
              stagedReference,
              destinationReference,
              protectedByteSize: expectedBytes.byteLength,
              protectedSha256: await checksumFor(expectedBytes)
            }
          ]
        },
        "complete"
      )
    ).rejects.toMatchObject({ code: "STORAGE_FAILED" });
    expect(mockFileSystem.__files.get(stagedReference)).toEqual(
      corruptBytes
    );
    expect(mockFileSystem.__files.has(destinationReference)).toBe(false);
  });

  it.each(["complete", "rollback"] as const)(
    "retains a same-size corrupt destination during interrupted %s resolution",
    async (outcome) => {
      const keyStore = statefulSecureStore(
        new Uint8Array(32).fill(4)
      );
      const store = new EncryptedFileAttachmentStore(keyStore);
      const expectedBytes = new Uint8Array([9, 8, 7, 6]);
      const corruptBytes = new Uint8Array([6, 7, 8, 9]);
      const stagingDirectoryReference =
        `file:///cache/alyr-recovery-stage-${"3".repeat(32)}`;
      const stagedReference =
        `${stagingDirectoryReference}/${"4".repeat(64)}.alyrblob`;
      const destinationReference =
        `file:///document/alyr-attachments/${"4".repeat(64)}.alyrblob`;
      mockFileSystem.__files.set(destinationReference, corruptBytes);

      await expect(
        store.resolveInterruptedRecoveryAttachmentRestore(
          {
            journalVersion: 1,
            vaultScopeId: store.scopeId,
            stagingDirectoryReference,
            vaultKeyDisposition: "preserve",
            pendingVaultKeyHex: null,
            expectedVaultKeyHex: "04".repeat(32),
            files: [
              {
                stagedReference,
                destinationReference,
                protectedByteSize: expectedBytes.byteLength,
                protectedSha256: await checksumFor(expectedBytes)
              }
            ]
          },
          outcome
        )
      ).rejects.toMatchObject({ code: "STORAGE_FAILED" });
      expect(mockFileSystem.__files.get(destinationReference)).toEqual(
        corruptBytes
      );
    }
  );
});
