import type {
  RecoveredAttachment,
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
}

export interface RecoveryAttachmentRestoreAdapter {
  begin(metadata: RecoveryRestoreMetadata): Promise<RecoveryAttachmentRestoreSession>;
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

/**
 * Coordinates an attachment-vault staging transaction with the repository's
 * atomic snapshot replacement. JavaScript/native exceptions are rolled back;
 * crash-atomicity across SQLite, filesystem, and secure key storage still
 * requires a native recovery journal in the signed integration.
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
            await attachmentSession.commit();
            await input.workspace.replaceWorkspaceAtomically(
              stagedWorkspace.value,
              stagedWorkspace.schemaVersion
            );
            finished = true;
          } catch (error) {
            await attachmentSession.rollback().catch(() => undefined);
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
