import type {
  RecoveredAttachment,
  RecoveryRestoreJournalAttachmentState,
  RecoveryRestoreJournalPhase,
  RecoveryRestoreMetadata,
  RecoveryRestorePort,
  RecoveryRestoreTransaction
} from "./types";
import { RecoveryKitError } from "./types";

export interface RecoveryAttachmentRestoreSession {
  stageAttachmentVaultKey(value: Uint8Array): Promise<void>;
  stageProtectedAttachment(value: RecoveredAttachment): Promise<void>;
  /**
   * Rewrites device-specific protected references to opaque destinations
   * allocated by this session. The returned value remains staged.
   */
  stageWorkspace(
    workspace: unknown,
    workspaceSchemaVersion: number
  ): Promise<unknown>;
  /** Makes the staged vault key and protected blobs visible. */
  commit(): Promise<void>;
  /** Removes staged/installed files and restores the previous key. Idempotent. */
  rollback(): Promise<void>;
  /**
   * Releases transaction-only secret material after the workspace replacement
   * is durably committed. This must be idempotent and must never run before the
   * last point at which rollback could still be required.
   */
  finalize(): Promise<void>;
}

export interface RecoveryAttachmentRestoreAdapter {
  begin(metadata: RecoveryRestoreMetadata): Promise<RecoveryAttachmentRestoreSession>;
}

export interface RecoveryJournaledAttachmentRestoreSession
  extends RecoveryAttachmentRestoreSession {
  createRecoveryRestoreJournalState(): Promise<RecoveryRestoreJournalAttachmentState>;
}

export interface RecoveryJournaledAttachmentRestoreAdapter
  extends RecoveryAttachmentRestoreAdapter {
  begin(
    metadata: RecoveryRestoreMetadata
  ): Promise<RecoveryJournaledAttachmentRestoreSession>;
  resolveInterruptedRecoveryAttachmentRestore(
    state: RecoveryRestoreJournalAttachmentState,
    outcome: "rollback" | "complete"
  ): Promise<void>;
}

export interface RecoveryWorkspaceRestoreAdapter {
  /**
   * Must validate signed account, household ownership, schema support, free
   * disk space, and any unsynced-change policy before attachment staging.
   */
  preflight(metadata: RecoveryRestoreMetadata): Promise<void>;
  /**
   * Replaces the snapshot and clears its old sync outbox in one repository
   * transaction. It must expose the new snapshot only after the commit.
   */
  replaceWorkspaceAtomically(
    workspace: unknown,
    workspaceSchemaVersion: number
  ): Promise<void>;
}

export interface RecoveryJournaledWorkspaceRestoreAdapter
  extends RecoveryWorkspaceRestoreAdapter {
  /**
   * Persists the prepared phase before the attachment key or any destination
   * file becomes visible. The returned workspace is the exact normalized
   * snapshot that will be committed at `targetRevision`.
   */
  prepareRecoveryRestoreJournal(input: {
    readonly metadata: RecoveryRestoreMetadata;
    readonly workspace: unknown;
    readonly workspaceSchemaVersion: number;
    readonly attachments: RecoveryRestoreJournalAttachmentState;
  }): Promise<{
    readonly transactionId: string;
    readonly workspace: unknown;
  }>;
  transitionRecoveryRestoreJournal(
    transactionId: string,
    expectedPhase: RecoveryRestoreJournalPhase,
    nextPhase: RecoveryRestoreJournalPhase
  ): Promise<void>;
  clearRecoveryRestoreJournal(transactionId: string): Promise<void>;
}

export function isRecoveryJournaledAttachmentRestoreSession(
  value: RecoveryAttachmentRestoreSession
): value is RecoveryJournaledAttachmentRestoreSession {
  return (
    typeof (
      value as Partial<RecoveryJournaledAttachmentRestoreSession>
    ).createRecoveryRestoreJournalState === "function"
  );
}

export function isRecoveryJournaledWorkspaceRestoreAdapter(
  value: RecoveryWorkspaceRestoreAdapter
): value is RecoveryJournaledWorkspaceRestoreAdapter {
  const candidate =
    value as Partial<RecoveryJournaledWorkspaceRestoreAdapter>;
  return (
    typeof candidate.prepareRecoveryRestoreJournal === "function" &&
    typeof candidate.transitionRecoveryRestoreJournal === "function" &&
    typeof candidate.clearRecoveryRestoreJournal === "function"
  );
}

/**
 * Coordinates an attachment-vault staging transaction with the repository's
 * atomic snapshot replacement. When both adapters expose the journal
 * extensions, every externally visible phase is durably recorded before it
 * starts and can be reconciled on the next vault open.
 */
export function createCoordinatedRecoveryRestorePort(input: {
  readonly attachments: RecoveryAttachmentRestoreAdapter;
  readonly workspace: RecoveryWorkspaceRestoreAdapter;
}): RecoveryRestorePort {
  return {
    async begin(metadata): Promise<RecoveryRestoreTransaction> {
      await input.workspace.preflight(metadata);
      const attachmentSession = await input.attachments.begin(metadata);
      let stagedWorkspace:
        | {
            readonly value: unknown;
            readonly schemaVersion: number;
          }
        | null = null;
      let finished = false;
      let journal:
        | {
            readonly transactionId: string;
            phase: RecoveryRestoreJournalPhase;
          }
        | null = null;
      let workspaceCommitted = false;

      return {
        async stageAttachmentVaultKey(value) {
          if (finished) {
            throw new RecoveryKitError(
              "RESTORE_REJECTED",
              "Recovery transaction is already closed."
            );
          }
          await attachmentSession.stageAttachmentVaultKey(value);
        },
        async stageProtectedAttachment(value) {
          if (finished) {
            throw new RecoveryKitError(
              "RESTORE_REJECTED",
              "Recovery transaction is already closed."
            );
          }
          await attachmentSession.stageProtectedAttachment(value);
        },
        async stageWorkspace(workspace, workspaceSchemaVersion) {
          if (finished || stagedWorkspace) {
            throw new RecoveryKitError(
              "RESTORE_REJECTED",
              "Recovery workspace staging order is invalid."
            );
          }
          stagedWorkspace = {
            value: await attachmentSession.stageWorkspace(
              workspace,
              workspaceSchemaVersion
            ),
            schemaVersion: workspaceSchemaVersion
          };
        },
        async commit() {
          if (finished || !stagedWorkspace) {
            throw new RecoveryKitError(
              "RESTORE_REJECTED",
              "Recovery workspace has not been staged."
            );
          }
          try {
            const journaledWorkspace =
              isRecoveryJournaledWorkspaceRestoreAdapter(input.workspace)
                ? input.workspace
                : null;
            const journaledAttachments =
              isRecoveryJournaledAttachmentRestoreSession(
                attachmentSession
              )
                ? attachmentSession
                : null;
            if (Boolean(journaledWorkspace) !== Boolean(journaledAttachments)) {
              throw new RecoveryKitError(
                "RESTORE_REJECTED",
                "Recovery crash-journal capabilities are incomplete."
              );
            }
            if (journaledWorkspace && journaledAttachments) {
              const prepared =
                await journaledWorkspace.prepareRecoveryRestoreJournal({
                  metadata,
                  workspace: stagedWorkspace.value,
                  workspaceSchemaVersion: stagedWorkspace.schemaVersion,
                  attachments:
                    await journaledAttachments.createRecoveryRestoreJournalState()
                });
              stagedWorkspace = {
                value: prepared.workspace,
                schemaVersion: stagedWorkspace.schemaVersion
              };
              journal = {
                transactionId: prepared.transactionId,
                phase: "prepared"
              };
              await journaledWorkspace.transitionRecoveryRestoreJournal(
                journal.transactionId,
                journal.phase,
                "attachments-installing"
              );
              journal.phase = "attachments-installing";
            }
            await attachmentSession.commit();
            if (journal && journaledWorkspace) {
              await journaledWorkspace.transitionRecoveryRestoreJournal(
                journal.transactionId,
                journal.phase,
                "attachments-installed"
              );
              journal.phase = "attachments-installed";
            }
            await input.workspace.replaceWorkspaceAtomically(
              stagedWorkspace.value,
              stagedWorkspace.schemaVersion
            );
            workspaceCommitted = true;
            if (journal && journaledWorkspace) {
              try {
                await journaledWorkspace.transitionRecoveryRestoreJournal(
                  journal.transactionId,
                  journal.phase,
                  "workspace-committed"
                );
                journal.phase = "workspace-committed";
                await journaledWorkspace.clearRecoveryRestoreJournal(
                  journal.transactionId
                );
              } catch {
                // The repository commit is authoritative. Keep the durable
                // journal for idempotent startup completion rather than
                // undoing files required by the now-visible snapshot.
              }
            }
            try {
              await attachmentSession.finalize();
            } catch {
              // Snapshot replacement is authoritative. Finalization only
              // releases in-memory transaction material, so its failure must
              // not report a durable restore as rolled back or remove files
              // referenced by the committed workspace.
            }
            finished = true;
          } catch (error) {
            if (!workspaceCommitted) {
              let rollbackCompleted = false;
              try {
                await attachmentSession.rollback();
                rollbackCompleted = true;
              } catch {
                // Leave the journal in place. Startup reconciliation retries
                // cleanup before exposing either workspace revision.
              }
              if (
                rollbackCompleted &&
                journal &&
                isRecoveryJournaledWorkspaceRestoreAdapter(input.workspace)
              ) {
                await input.workspace
                  .clearRecoveryRestoreJournal(journal.transactionId)
                  .catch(() => undefined);
              }
            }
            finished = true;
            throw error;
          }
        },
        async rollback() {
          if (finished) return;
          finished = true;
          await attachmentSession.rollback();
        }
      };
    }
  };
}
