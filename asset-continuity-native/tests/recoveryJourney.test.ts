import {
  createCoordinatedRecoveryRestorePort,
  createUnavailableRecoveryRuntime,
  RecoveryJourneyController,
  RecoveryKitError,
  restoreRecoveryKitAtomically,
  type CreateRecoveryKitRequest,
  type RecoveryKitStoragePort
} from "@/recovery";
import { createWorkspace } from "@/domain/sample";
import { RecoveryTestCrypto } from "./helpers/recoveryTestCrypto";

const PASSPHRASE = "a careful recovery phrase";
const CREATED_AT = "2026-07-27T10:00:00.000Z";

function request(
  householdId = "household-current"
): CreateRecoveryKitRequest {
  const workspace = createWorkspace("personal", CREATED_AT, {
    deviceId: "device-recovery",
    householdId,
    ownerMemberId: "member-recovery"
  });
  return {
    workspace,
    workspaceSchemaVersion: workspace.schemaVersion,
    createdAt: CREATED_AT,
    attachmentVaultKey: null,
    attachments: []
  };
}

function memoryStorage(): {
  readonly port: RecoveryKitStoragePort;
  readonly files: Map<string, Uint8Array>;
} {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    port: {
      async writeEncryptedKitAtomically(input) {
        const reference = `memory://${input.fileName}`;
        files.set(reference, input.bytes.slice());
        return {
          reference,
          fileName: input.fileName,
          byteSize: input.bytes.byteLength
        };
      },
      async readEncryptedKit(reference, maxBytes) {
        const value = files.get(reference);
        if (!value || value.byteLength > maxBytes) throw new Error("missing");
        return value.slice();
      }
    }
  };
}

describe("Recovery Kit journey controller", () => {
  it("verifies stored encrypted bytes and returns metadata without plaintext", async () => {
    const storage = memoryStorage();
    let selectedReference = "";
    let externalBackupConfirmedAt: string | null = null;
    const controller = new RecoveryJourneyController({
      crypto: new RecoveryTestCrypto(),
      attachments: {
        async readProtectedAttachment() {
          throw new Error("no attachments");
        }
      },
      storage: storage.port,
      restore: {
        async begin() {
          throw new Error("not used");
        }
      },
      createRequest: async () => request(),
      chooseEncryptedKit: async () => null,
      shareEncryptedKit: async (reference) => {
        selectedReference = reference;
      },
      listRecentEncryptedKits: async () => [],
      confirmEncryptedKitExternalBackup: async (
        reference,
        confirmedAt
      ) => {
        externalBackupConfirmedAt = confirmedAt;
        return {
          reference,
          fileName: "Heldat-Recovery-2026-07-27.alyrkit",
          byteSize: storage.files.get(reference)?.byteLength ?? 0,
          createdAt: CREATED_AT,
          externalBackupConfirmedAt: confirmedAt
        };
      },
      currentHouseholdId: () => "household-current",
      now: () => "2026-07-27T10:01:00.000Z"
    });

    const verification = await controller.create(PASSPHRASE);
    expect(verification.protection).toBe("Argon2id + AES-256-GCM");
    expect(verification.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(verification.verifiedAt).toBe("2026-07-27T10:01:00.000Z");
    expect(verification.externalBackupConfirmedAt).toBeNull();
    const stored = storage.files.get(verification.reference)!;
    const visible = String.fromCharCode(...stored);
    expect(visible).not.toContain("Private household");
    expect(visible).not.toContain("household-current");

    await controller.share(verification.reference);
    expect(selectedReference).toBe(verification.reference);
    expect(externalBackupConfirmedAt).toBeNull();
    const confirmed = await controller.confirmExternalBackup(
      verification.reference
    );
    expect(confirmed.externalBackupConfirmedAt).toBe(
      "2026-07-27T10:01:00.000Z"
    );
    expect(externalBackupConfirmedAt).toBe(
      "2026-07-27T10:01:00.000Z"
    );
  });

  it("previews only an authenticated same-household kit and requires REPLACE", async () => {
    const storage = memoryStorage();
    const crypto = new RecoveryTestCrypto();
    const sourceController = new RecoveryJourneyController({
      crypto,
      attachments: {
        async readProtectedAttachment() {
          throw new Error("no attachments");
        }
      },
      storage: storage.port,
      restore: {
        async begin() {
          throw new Error("not used");
        }
      },
      createRequest: async () => request(),
      chooseEncryptedKit: async () => null,
      shareEncryptedKit: async () => undefined,
      currentHouseholdId: () => "household-current"
    });
    const created = await sourceController.create(PASSPHRASE);
    const calls: string[] = [];
    const controller = new RecoveryJourneyController({
      crypto: new RecoveryTestCrypto(),
      attachments: {
        async readProtectedAttachment() {
          throw new Error("no attachments");
        }
      },
      storage: storage.port,
      restore: {
        async begin() {
          calls.push("begin");
          return {
            async stageAttachmentVaultKey() {},
            async stageProtectedAttachment() {},
            async stageWorkspace() {
              calls.push("workspace");
            },
            async commit() {
              calls.push("commit");
            },
            async rollback() {
              calls.push("rollback");
            }
          };
        }
      },
      createRequest: async () => request(),
      chooseEncryptedKit: async () => ({
        reference: created.reference,
        fileName: created.fileName
      }),
      shareEncryptedKit: async () => undefined,
      currentHouseholdId: () => "household-current"
    });

    const preview = await controller.chooseAndPreview(PASSPHRASE);
    expect(preview).toMatchObject({
      authenticated: true,
      householdName: "My household",
      itemCount: 0,
      attachmentCount: 0
    });
    await expect(
      controller.restore(preview!.previewId, "replace")
    ).rejects.toMatchObject({ code: "RESTORE_REJECTED" });
    expect(calls).toEqual([]);

    await controller.restore(preview!.previewId, "REPLACE");
    expect(calls).toEqual(["begin", "workspace", "commit"]);
    await expect(
      controller.restore(preview!.previewId, "REPLACE")
    ).rejects.toMatchObject({ code: "RESTORE_REJECTED" });
  });

  it("fails preview closed for wrong household and clears recovered buffers", async () => {
    const storage = memoryStorage();
    const source = new RecoveryJourneyController({
      crypto: new RecoveryTestCrypto(),
      attachments: {
        async readProtectedAttachment() {
          throw new Error("no attachments");
        }
      },
      storage: storage.port,
      restore: {
        async begin() {
          throw new Error("not used");
        }
      },
      createRequest: async () => request("household-other"),
      chooseEncryptedKit: async () => null,
      shareEncryptedKit: async () => undefined,
      currentHouseholdId: () => "household-other"
    });
    const created = await source.create(PASSPHRASE);
    const importing = new RecoveryJourneyController({
      crypto: new RecoveryTestCrypto(),
      attachments: {
        async readProtectedAttachment() {
          throw new Error("no attachments");
        }
      },
      storage: storage.port,
      restore: {
        async begin() {
          throw new Error("not used");
        }
      },
      createRequest: async () => request(),
      chooseEncryptedKit: async () => ({
        reference: created.reference,
        fileName: created.fileName
      }),
      shareEncryptedKit: async () => undefined,
      currentHouseholdId: () => "household-current"
    });
    await expect(
      importing.chooseAndPreview(PASSPHRASE)
    ).rejects.toMatchObject({
      code: "RESTORE_REJECTED"
    });
    await expect(
      importing.restore("made-up", "REPLACE")
    ).rejects.toMatchObject({ code: "RESTORE_REJECTED" });
  });

  it("surfaces preview mode as unavailable instead of invoking operations", async () => {
    const runtime = createUnavailableRecoveryRuntime("expo-go-preview");
    expect(runtime.capability).toMatchObject({
      kind: "unavailable",
      reason: "preview-runtime"
    });
    await expect(runtime.create(PASSPHRASE)).rejects.toMatchObject({
      code: "CRYPTO_UNAVAILABLE"
    });
    await expect(
      runtime.chooseAndPreview(PASSPHRASE)
    ).rejects.toMatchObject({ code: "CRYPTO_UNAVAILABLE" });
  });
});

describe("coordinated Recovery Kit restore", () => {
  it("rolls back installed protected files when repository replacement fails", async () => {
    const calls: string[] = [];
    const port = createCoordinatedRecoveryRestorePort({
      attachments: {
        async begin() {
          calls.push("attachments.begin");
          return {
            async stageAttachmentVaultKey() {
              calls.push("key");
            },
            async stageProtectedAttachment() {
              calls.push("attachment");
            },
            async stageWorkspace(workspace) {
              calls.push("workspace.stage");
              return workspace;
            },
            async commit() {
              calls.push("attachments.commit");
            },
            async rollback() {
              calls.push("attachments.rollback");
            },
            async finalize() {
              calls.push("attachments.finalize");
            }
          };
        }
      },
      workspace: {
        async preflight() {
          calls.push("preflight");
        },
        async replaceWorkspaceAtomically() {
          calls.push("repository.replace");
          throw new Error("disk full");
        }
      }
    });

    const recovered = {
      kitId: "1".repeat(32),
      createdAt: CREATED_AT,
      workspaceSchemaVersion: 2,
      workspace: request().workspace,
      attachmentVaultKey: null,
      attachments: [],
      containerSha256: "a".repeat(64)
    };
    await expect(
      restoreRecoveryKitAtomically(recovered, port)
    ).rejects.toBeInstanceOf(RecoveryKitError);
    expect(calls).toEqual([
      "preflight",
      "attachments.begin",
      "workspace.stage",
      "attachments.commit",
      "repository.replace",
      "attachments.rollback"
    ]);
  });
});
