import type { NativeWorkspaceRepository } from "@/data/repository";
import { createWorkspace } from "@/domain/sample";
import {
  createCoordinatedRecoveryRestorePort
} from "@/recovery/atomicRestore";
import {
  resolveInterruptedRecoveryRestore
} from "@/recovery/crashJournal";
import type {
  RecoveryRestoreCrashJournal,
  RecoveryRestoreJournalAttachmentState,
  RecoveryRestoreJournalPhase
} from "@/recovery/types";

const CREATED_AT = "2026-07-28T10:00:00.000Z";
const KIT_ID = "a".repeat(32);
const SCOPE_ID = "scope-recovery-journal";
const HOUSEHOLD_ID = "household-recovery-journal";
const DEVICE_ID = "device-recovery-journal";

const ATTACHMENT_STATE: RecoveryRestoreJournalAttachmentState = {
  journalVersion: 1,
  vaultScopeId: SCOPE_ID,
  stagingDirectoryReference:
    "file:///cache/alyr-recovery-stage-0123456789abcdef0123456789abcdef",
  vaultKeyDisposition: "install",
  pendingVaultKeyHex: "07".repeat(32),
  expectedVaultKeyHex: "07".repeat(32),
  files: [
    {
      stagedReference:
        "file:///cache/alyr-recovery-stage-0123456789abcdef0123456789abcdef/" +
        `${"1".repeat(64)}.alyrblob`,
      destinationReference:
        `file:///document/alyr-attachments/${"1".repeat(64)}.alyrblob`,
      protectedByteSize: 512,
      protectedSha256: "2".repeat(64)
    }
  ]
};

function snapshots() {
  const oldWorkspace = createWorkspace("personal", CREATED_AT, {
    householdId: HOUSEHOLD_ID,
    ownerMemberId: "member-owner",
    deviceId: DEVICE_ID
  });
  const targetWorkspace = {
    ...oldWorkspace,
    household: {
      ...oldWorkspace.household,
      name: "Recovered household"
    },
    deviceId: DEVICE_ID,
    recoveryRestoreLineage: {
      lineageVersion: 1 as const,
      transactionId: KIT_ID,
      targetRevision: 8,
      committedAt: CREATED_AT
    },
    syncStatus: "local-only" as const,
    lastSyncedAt: null
  };
  return { oldWorkspace, targetWorkspace };
}

function crashJournal(
  phase: RecoveryRestoreJournalPhase
): RecoveryRestoreCrashJournal {
  const { targetWorkspace } = snapshots();
  return {
    journalVersion: 1,
    transactionId: KIT_ID,
    kitId: KIT_ID,
    householdId: HOUSEHOLD_ID,
    workspaceSchemaVersion: targetWorkspace.schemaVersion,
    expectedRevision: 7,
    targetRevision: 8,
    targetWorkspace,
    attachments: ATTACHMENT_STATE,
    phase,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT
  };
}

function repositoryFixture(input: {
  readonly phase: RecoveryRestoreJournalPhase;
  readonly revision: number;
  readonly targetCommitted: boolean;
  readonly snapshotOverride?: ReturnType<typeof snapshots>["targetWorkspace"];
}) {
  const { oldWorkspace, targetWorkspace } = snapshots();
  let journal: RecoveryRestoreCrashJournal | null = crashJournal(
    input.phase
  );
  const transitionRecoveryRestoreJournal = jest.fn(
    async (
      _transactionId: string,
      _expectedPhase: RecoveryRestoreJournalPhase,
      nextPhase: RecoveryRestoreJournalPhase,
      updatedAt: string
    ) => {
      journal = journal
        ? { ...journal, phase: nextPhase, updatedAt }
        : null;
    }
  );
  const clearRecoveryRestoreJournal = jest.fn(async () => {
    journal = null;
  });
  const repository = {
    kind: "sqlite-sqlcipher",
    durable: true,
    encryptedAtRest: true,
    scopeId: SCOPE_ID,
    initialize: jest.fn(),
    load: jest.fn(async () => ({
      revision: input.revision,
      snapshot:
        input.snapshotOverride ??
        (input.targetCommitted ? targetWorkspace : oldWorkspace)
    })),
    commit: jest.fn(),
    listPendingOperations: jest.fn(),
    acknowledgeOperation: jest.fn(),
    loadSyncState: jest.fn(),
    commitSync: jest.fn(),
    loadRecoveryRestoreJournal: jest.fn(async () => journal),
    createRecoveryRestoreJournal: jest.fn(),
    transitionRecoveryRestoreJournal,
    clearRecoveryRestoreJournal,
    close: jest.fn(),
    lock: jest.fn(),
    purge: jest.fn()
  } as unknown as NativeWorkspaceRepository;
  return {
    repository,
    clearRecoveryRestoreJournal,
    transitionRecoveryRestoreJournal,
    currentJournal: () => journal
  };
}

describe("Recovery Kit crash journal restart resolution", () => {
  it.each([
    "prepared",
    "attachments-installing",
    "attachments-installed"
  ] as const)(
    "rolls back opaque attachment changes after a crash in %s when SQLCipher still has the old revision",
    async (phase) => {
      const fixture = repositoryFixture({
        phase,
        revision: 7,
        targetCommitted: false
      });
      const attachments = {
        resolveInterruptedRecoveryAttachmentRestore: jest.fn()
      };

      await expect(
        resolveInterruptedRecoveryRestore({
          repository: fixture.repository,
          attachments,
          householdId: HOUSEHOLD_ID,
          deviceId: DEVICE_ID
        })
      ).resolves.toBe("rolled-back");

      expect(
        attachments.resolveInterruptedRecoveryAttachmentRestore
      ).toHaveBeenCalledWith(ATTACHMENT_STATE, "rollback");
      expect(fixture.currentJournal()).toBeNull();
    }
  );

  it.each([
    "attachments-installed",
    "workspace-committed"
  ] as const)(
    "finishes the new attachment state after a crash in %s when the exact target revision committed",
    async (phase) => {
      const fixture = repositoryFixture({
        phase,
        revision: 8,
        targetCommitted: true
      });
      const attachments = {
        resolveInterruptedRecoveryAttachmentRestore: jest.fn()
      };

      await expect(
        resolveInterruptedRecoveryRestore({
          repository: fixture.repository,
          attachments,
          householdId: HOUSEHOLD_ID,
          deviceId: DEVICE_ID
        })
      ).resolves.toBe("completed");

      expect(
        attachments.resolveInterruptedRecoveryAttachmentRestore
      ).toHaveBeenCalledWith(ATTACHMENT_STATE, "complete");
      expect(fixture.currentJournal()).toBeNull();
    }
  );

  it("finishes committed attachment cleanup after later valid workspace revisions preserve the restore lineage", async () => {
    const { targetWorkspace } = snapshots();
    const fixture = repositoryFixture({
      phase: "attachments-installed",
      revision: 12,
      targetCommitted: true,
      snapshotOverride: {
        ...targetWorkspace,
        household: {
          ...targetWorkspace.household,
          name: "Renamed after recovery"
        },
        updatedAt: "2026-07-28T11:00:00.000Z"
      }
    });
    const attachments = {
      resolveInterruptedRecoveryAttachmentRestore: jest.fn()
    };

    await expect(
      resolveInterruptedRecoveryRestore({
        repository: fixture.repository,
        attachments,
        householdId: HOUSEHOLD_ID,
        deviceId: DEVICE_ID
      })
    ).resolves.toBe("completed");
    expect(
      attachments.resolveInterruptedRecoveryAttachmentRestore
    ).toHaveBeenCalledWith(ATTACHMENT_STATE, "complete");
    expect(
      fixture.transitionRecoveryRestoreJournal
    ).toHaveBeenCalledWith(
      KIT_ID,
      "attachments-installed",
      "workspace-committed",
      expect.any(String)
    );
    expect(fixture.currentJournal()).toBeNull();
  });

  it("does not treat a later unrelated revision as the committed recovery lineage", async () => {
    const { targetWorkspace } = snapshots();
    const fixture = repositoryFixture({
      phase: "attachments-installed",
      revision: 12,
      targetCommitted: true,
      snapshotOverride: {
        ...targetWorkspace,
        recoveryRestoreLineage: {
          ...targetWorkspace.recoveryRestoreLineage,
          transactionId: "b".repeat(32)
        }
      }
    });
    const attachments = {
      resolveInterruptedRecoveryAttachmentRestore: jest.fn()
    };

    await expect(
      resolveInterruptedRecoveryRestore({
        repository: fixture.repository,
        attachments,
        householdId: HOUSEHOLD_ID,
        deviceId: DEVICE_ID
      })
    ).rejects.toMatchObject({ code: "RESTORE_REJECTED" });
    expect(
      attachments.resolveInterruptedRecoveryAttachmentRestore
    ).not.toHaveBeenCalled();
    expect(fixture.currentJournal()).not.toBeNull();
  });

  it("keeps the vault closed when revision and exact target snapshot do not prove old or new state", async () => {
    const fixture = repositoryFixture({
      phase: "attachments-installed",
      revision: 9,
      targetCommitted: false
    });
    const attachments = {
      resolveInterruptedRecoveryAttachmentRestore: jest.fn()
    };

    await expect(
      resolveInterruptedRecoveryRestore({
        repository: fixture.repository,
        attachments,
        householdId: HOUSEHOLD_ID,
        deviceId: DEVICE_ID
      })
    ).rejects.toMatchObject({ code: "RESTORE_REJECTED" });
    expect(
      attachments.resolveInterruptedRecoveryAttachmentRestore
    ).not.toHaveBeenCalled();
    expect(fixture.currentJournal()).not.toBeNull();
  });
});

describe("journaled restore coordinator fault boundaries", () => {
  function coordinatorFixture(options?: {
    readonly failInstalledTransition?: boolean;
    readonly failFinalClear?: boolean;
    readonly failFinalize?: boolean;
    readonly failRollback?: boolean;
  }) {
    const calls: string[] = [];
    let phase: RecoveryRestoreJournalPhase | null = null;
    const attachments = {
      async begin() {
        calls.push("attachments.begin");
        return {
          async stageAttachmentVaultKey() {},
          async stageProtectedAttachment() {},
          async stageWorkspace(workspace: unknown) {
            calls.push("workspace.stage");
            return workspace;
          },
          async createRecoveryRestoreJournalState() {
            calls.push("journal.attachments");
            return ATTACHMENT_STATE;
          },
          async commit() {
            calls.push("attachments.commit");
          },
          async rollback() {
            calls.push("attachments.rollback");
            if (options?.failRollback) {
              throw new Error("fault: attachment cleanup");
            }
          },
          async finalize() {
            calls.push("attachments.finalize");
            if (options?.failFinalize) {
              throw new Error("fault: attachment finalization");
            }
          }
        };
      },
      async resolveInterruptedRecoveryAttachmentRestore() {}
    };
    const workspace = {
      async preflight() {
        calls.push("workspace.preflight");
      },
      async prepareRecoveryRestoreJournal(input: {
        readonly workspace: unknown;
      }) {
        calls.push("journal.prepare");
        phase = "prepared";
        return {
          transactionId: KIT_ID,
          workspace: input.workspace
        };
      },
      async transitionRecoveryRestoreJournal(
        _transactionId: string,
        _expected: RecoveryRestoreJournalPhase,
        next: RecoveryRestoreJournalPhase
      ) {
        calls.push(`journal.${next}`);
        if (
          options?.failInstalledTransition &&
          next === "attachments-installed"
        ) {
          throw new Error("fault: journal phase write");
        }
        phase = next;
      },
      async clearRecoveryRestoreJournal() {
        calls.push("journal.clear");
        if (options?.failFinalClear && phase === "workspace-committed") {
          throw new Error("fault: final journal clear");
        }
        phase = null;
      },
      async replaceWorkspaceAtomically() {
        calls.push("workspace.replace");
      }
    };
    return {
      calls,
      port: createCoordinatedRecoveryRestorePort({
        attachments,
        workspace
      }),
      phase: () => phase
    };
  }

  it("rolls back before snapshot replacement when a durable attachment phase write fails", async () => {
    const fixture = coordinatorFixture({
      failInstalledTransition: true
    });
    const transaction = await fixture.port.begin({
      kitId: KIT_ID,
      createdAt: CREATED_AT,
      workspaceSchemaVersion: 2,
      attachmentCount: 0
    });
    await transaction.stageWorkspace(
      snapshots().targetWorkspace,
      snapshots().targetWorkspace.schemaVersion
    );

    await expect(transaction.commit()).rejects.toThrow(
      "fault: journal phase write"
    );
    expect(fixture.calls).not.toContain("workspace.replace");
    expect(fixture.calls).toEqual(
      expect.arrayContaining([
        "attachments.commit",
        "attachments.rollback",
        "journal.clear"
      ])
    );
    expect(fixture.phase()).toBeNull();
  });

  it("preserves committed-new state when final journal cleanup is interrupted", async () => {
    const fixture = coordinatorFixture({ failFinalClear: true });
    const transaction = await fixture.port.begin({
      kitId: KIT_ID,
      createdAt: CREATED_AT,
      workspaceSchemaVersion: 2,
      attachmentCount: 0
    });
    await transaction.stageWorkspace(
      snapshots().targetWorkspace,
      snapshots().targetWorkspace.schemaVersion
    );

    await expect(transaction.commit()).resolves.toBeUndefined();
    expect(fixture.calls).toContain("workspace.replace");
    expect(fixture.calls).not.toContain("attachments.rollback");
    expect(fixture.calls).toContain("attachments.finalize");
    expect(fixture.phase()).toBe("workspace-committed");
  });

  it("keeps committed state successful when in-memory finalization fails", async () => {
    const fixture = coordinatorFixture({ failFinalize: true });
    const transaction = await fixture.port.begin({
      kitId: KIT_ID,
      createdAt: CREATED_AT,
      workspaceSchemaVersion: 2,
      attachmentCount: 0
    });
    await transaction.stageWorkspace(
      snapshots().targetWorkspace,
      snapshots().targetWorkspace.schemaVersion
    );

    await expect(transaction.commit()).resolves.toBeUndefined();
    expect(fixture.calls).toEqual(
      expect.arrayContaining([
        "workspace.replace",
        "journal.clear",
        "attachments.finalize"
      ])
    );
    expect(fixture.calls.indexOf("attachments.finalize")).toBeGreaterThan(
      fixture.calls.indexOf("journal.clear")
    );
    expect(fixture.calls).not.toContain("attachments.rollback");
    expect(fixture.phase()).toBeNull();
  });

  it("retains the journal when pre-commit attachment cleanup needs a restart retry", async () => {
    const fixture = coordinatorFixture({
      failInstalledTransition: true,
      failRollback: true
    });
    const transaction = await fixture.port.begin({
      kitId: KIT_ID,
      createdAt: CREATED_AT,
      workspaceSchemaVersion: 2,
      attachmentCount: 0
    });
    await transaction.stageWorkspace(
      snapshots().targetWorkspace,
      snapshots().targetWorkspace.schemaVersion
    );

    await expect(transaction.commit()).rejects.toThrow(
      "fault: journal phase write"
    );
    expect(fixture.calls).not.toContain("journal.clear");
    expect(fixture.phase()).toBe("attachments-installing");
  });
});
