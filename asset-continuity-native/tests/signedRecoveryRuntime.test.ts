import type { ScopedAttachmentStore } from "@/data/attachmentStore";
import type { NativeWorkspaceRepository } from "@/data/repository";
import {
  createSignedRecoveryJourneyRuntime,
  type SignedRecoveryRuntimeDependencies
} from "@/recovery/signedRuntime";

function dependencies(
  overrides: Partial<SignedRecoveryRuntimeDependencies> = {}
): SignedRecoveryRuntimeDependencies {
  const repository = {
    kind: "sqlite-sqlcipher",
    durable: true,
    encryptedAtRest: true,
    scopeId: "test-scope",
    load: jest.fn(),
    commit: jest.fn(),
    listPendingOperations: jest.fn(),
    acknowledgeOperation: jest.fn(),
    loadSyncState: jest.fn(),
    commitSync: jest.fn(),
    loadRecoveryRestoreJournal: jest.fn(async () => null),
    createRecoveryRestoreJournal: jest.fn(),
    transitionRecoveryRestoreJournal: jest.fn(),
    clearRecoveryRestoreJournal: jest.fn(),
    close: jest.fn(),
    lock: jest.fn(),
    purge: jest.fn()
  } as unknown as NativeWorkspaceRepository;
  const attachmentStore = {
    kind: "encrypted-files",
    encryptedAtRest: true,
    scopeId: "test-scope",
    ingest: jest.fn(),
    materializeForViewing: jest.fn(),
    cleanupMaterialized: jest.fn(),
    close: jest.fn(),
    lock: jest.fn(),
    purge: jest.fn(),
    readProtectedAttachment: jest.fn(),
    protectedAttachmentByteSize: jest.fn(),
    readAttachmentVaultKeyForRecovery: jest.fn(),
    beginRecoveryAttachmentRestore: jest.fn(),
    resolveInterruptedRecoveryAttachmentRestore: jest.fn()
  } as unknown as ScopedAttachmentStore;

  return {
    profile: "native-secure",
    repository,
    attachmentStore,
    currentWorkspace: () => null,
    currentHouseholdId: () => null,
    currentDeviceId: () => null,
    runExclusive: async (work) => work(),
    onRestored: jest.fn(),
    ...overrides
  };
}

describe("signed Recovery Journey runtime gate", () => {
  it.each(["expo-go-preview", "web-preview", "test"] as const)(
    "keeps %s visibly unavailable even with secure-looking ports",
    (profile) => {
      const runtime = createSignedRecoveryJourneyRuntime(
        dependencies({ profile })
      );

      expect(runtime.capability).toMatchObject({
        kind: "unavailable"
      });
    }
  );

  it("keeps a locked or incomplete signed vault unavailable", () => {
    const runtime = createSignedRecoveryJourneyRuntime(
      dependencies({ attachmentStore: null })
    );

    expect(runtime.capability).toEqual(
      expect.objectContaining({
        kind: "unavailable",
        reason: "vault-locked"
      })
    );
  });

  it("keeps a durable vault unavailable when crash-journal recovery is incomplete", () => {
    const base = dependencies();
    const incompleteRepository = {
      ...base.repository,
      loadRecoveryRestoreJournal: undefined,
      createRecoveryRestoreJournal: undefined,
      transitionRecoveryRestoreJournal: undefined,
      clearRecoveryRestoreJournal: undefined
    } as unknown as NativeWorkspaceRepository;
    const runtime = createSignedRecoveryJourneyRuntime({
      ...base,
      repository: incompleteRepository
    });

    expect(runtime.capability).toEqual(
      expect.objectContaining({
        kind: "unavailable",
        reason: "vault-locked"
      })
    );
  });

  it("exposes Argon2id plus AES-256-GCM only for the complete signed vault", () => {
    const runtime = createSignedRecoveryJourneyRuntime(dependencies());

    expect(runtime.capability).toEqual({
      kind: "available",
      protection: "argon2id-aes-256-gcm"
    });
  });
});
