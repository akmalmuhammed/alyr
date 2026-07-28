const mockInitializeRepository = jest.fn(async () => undefined);

jest.mock("@/runtime/environment", () => ({
  isExpoGoPreview: false
}));

jest.mock("@/data/sqliteRepository", () => ({
  SQLiteWorkspaceRepository: class MockSQLiteWorkspaceRepository {
    readonly kind = "sqlite-sqlcipher" as const;
    readonly durable = true;
    readonly encryptedAtRest = true;
    readonly scopeId: string;

    constructor(
      _keyStore: unknown,
      scope: { readonly scopeId: string }
    ) {
      this.scopeId = scope.scopeId;
    }

    initialize = mockInitializeRepository;
  }
}));

import {
  createDefaultAttachmentStore,
  EncryptedFileAttachmentStore
} from "@/data/attachmentStore";
import { createDefaultRepository } from "@/data/createRepository.native";
import {
  DEVICE_PREVIEW_VAULT_SCOPE,
  SIGNED_OUT_SAMPLE_VAULT_SCOPE,
  vaultScopeFromOpaqueId
} from "@/data/vaultScope";

describe("native-secure signed-out sample resource policy", () => {
  const authenticatedScope = vaultScopeFromOpaqueId(
    `auth-v1-${"a".repeat(64)}`
  );

  beforeEach(() => {
    mockInitializeRepository.mockClear();
  });

  it("opens SQLCipher for the isolated sample and authenticated scopes but rejects the legacy preview scope", async () => {
    const sampleRepository = await createDefaultRepository(
      SIGNED_OUT_SAMPLE_VAULT_SCOPE
    );
    const authenticatedRepository = await createDefaultRepository(
      authenticatedScope
    );

    expect(sampleRepository).toMatchObject({
      kind: "sqlite-sqlcipher",
      durable: true,
      encryptedAtRest: true,
      scopeId: SIGNED_OUT_SAMPLE_VAULT_SCOPE.scopeId
    });
    expect(authenticatedRepository).toMatchObject({
      kind: "sqlite-sqlcipher",
      durable: true,
      encryptedAtRest: true,
      scopeId: authenticatedScope.scopeId
    });
    expect(sampleRepository.scopeId).not.toBe(
      authenticatedRepository.scopeId
    );
    expect(mockInitializeRepository).toHaveBeenCalledTimes(2);
    await expect(
      createDefaultRepository(DEVICE_PREVIEW_VAULT_SCOPE)
    ).rejects.toThrow("isolated sample scope");
  });

  it("selects an encrypted attachment store for the same two native scopes without unlocking device preview", async () => {
    const previousNodeEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const sampleStore = createDefaultAttachmentStore(
        SIGNED_OUT_SAMPLE_VAULT_SCOPE
      );
      const authenticatedStore =
        createDefaultAttachmentStore(authenticatedScope);
      const lockedPreviewStore = createDefaultAttachmentStore(
        DEVICE_PREVIEW_VAULT_SCOPE
      );

      expect(sampleStore).toBeInstanceOf(
        EncryptedFileAttachmentStore
      );
      expect(sampleStore).toMatchObject({
        kind: "encrypted-files",
        encryptedAtRest: true,
        scopeId: SIGNED_OUT_SAMPLE_VAULT_SCOPE.scopeId
      });
      expect(authenticatedStore).toMatchObject({
        kind: "encrypted-files",
        encryptedAtRest: true,
        scopeId: authenticatedScope.scopeId
      });
      expect(sampleStore.scopeId).not.toBe(
        authenticatedStore.scopeId
      );
      expect(lockedPreviewStore).toMatchObject({
        kind: "memory-preview",
        encryptedAtRest: false,
        scopeId: DEVICE_PREVIEW_VAULT_SCOPE.scopeId
      });
      await expect(
        lockedPreviewStore.ingest({
          localUri: "file:///cache/blocked.jpg",
          fileName: "blocked.jpg",
          mimeType: "image/jpeg",
          byteSize: 1,
          protectedUri: null,
          checksumSha256: null,
          encryptedAtRest: false
        })
      ).rejects.toThrow("locked");
    } finally {
      if (previousNodeEnvironment === undefined) {
        Reflect.deleteProperty(process.env, "NODE_ENV");
      } else {
        process.env.NODE_ENV = previousNodeEnvironment;
      }
    }
  });
});
