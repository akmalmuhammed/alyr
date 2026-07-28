import type { NativeWorkspaceRepository } from "@/data/repository";
import {
  isNativeWorkspace,
  type NativeWorkspace
} from "@/domain/model";

import type {
  RecoveryRestoreCrashJournal,
  RecoveryRestoreJournalAttachmentState,
  RecoveryRestoreJournalPhase,
  RecoveryRestoreJournalPort
} from "./types";
import { RecoveryKitError } from "./types";

const JOURNAL_PHASES = new Set<RecoveryRestoreJournalPhase>([
  "prepared",
  "attachments-installing",
  "attachments-installed",
  "workspace-committed"
]);
const MAX_JOURNAL_ATTACHMENT_COUNT = 256;
const MAX_PROTECTED_ATTACHMENT_BYTES = 10 * 1024 * 1024 + 128;

export type InterruptedRecoveryResolution =
  | "none"
  | "rolled-back"
  | "completed";

export interface InterruptedRecoveryAttachmentResolver {
  resolveInterruptedRecoveryAttachmentRestore(
    state: RecoveryRestoreJournalAttachmentState,
    outcome: "rollback" | "complete"
  ): Promise<void>;
}

export function isRecoveryRestoreJournalPort(
  value: unknown
): value is RecoveryRestoreJournalPort {
  const candidate = value as Partial<RecoveryRestoreJournalPort> | null;
  return Boolean(
    candidate &&
      typeof candidate.loadRecoveryRestoreJournal === "function" &&
      typeof candidate.createRecoveryRestoreJournal === "function" &&
      typeof candidate.transitionRecoveryRestoreJournal === "function" &&
      typeof candidate.clearRecoveryRestoreJournal === "function"
  );
}

export function isInterruptedRecoveryAttachmentResolver(
  value: unknown
): value is InterruptedRecoveryAttachmentResolver {
  return (
    typeof (
      value as Partial<InterruptedRecoveryAttachmentResolver> | null
    )?.resolveInterruptedRecoveryAttachmentRestore === "function"
  );
}

function isValidDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

function isValidAttachmentState(
  value: unknown
): value is RecoveryRestoreJournalAttachmentState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<RecoveryRestoreJournalAttachmentState>;
  if (
    state.journalVersion !== 1 ||
    typeof state.vaultScopeId !== "string" ||
    state.vaultScopeId.length === 0 ||
    typeof state.stagingDirectoryReference !== "string" ||
    state.stagingDirectoryReference.length === 0 ||
    (state.vaultKeyDisposition !== "preserve" &&
      state.vaultKeyDisposition !== "install") ||
    !Array.isArray(state.files) ||
    state.files.length > MAX_JOURNAL_ATTACHMENT_COUNT
  ) {
    return false;
  }
  const hasProtectedFiles = state.files.length > 0;
  const hasExpectedVaultKey =
    typeof state.expectedVaultKeyHex === "string" &&
    /^[a-f0-9]{64}$/u.test(state.expectedVaultKeyHex);
  if (
    (hasProtectedFiles
      ? !hasExpectedVaultKey
      : state.expectedVaultKeyHex !== null) ||
    (state.vaultKeyDisposition === "install"
      ? !hasProtectedFiles ||
        typeof state.pendingVaultKeyHex !== "string" ||
        !/^[a-f0-9]{64}$/u.test(state.pendingVaultKeyHex) ||
        state.pendingVaultKeyHex !== state.expectedVaultKeyHex
      : state.pendingVaultKeyHex !== null)
  ) {
    return false;
  }

  const stagedReferences = new Set<string>();
  const destinationReferences = new Set<string>();
  for (const file of state.files) {
    if (
      !file ||
      typeof file !== "object" ||
      typeof file.stagedReference !== "string" ||
      !file.stagedReference ||
      typeof file.destinationReference !== "string" ||
      !file.destinationReference ||
      !Number.isSafeInteger(file.protectedByteSize) ||
      file.protectedByteSize <= 0 ||
      file.protectedByteSize > MAX_PROTECTED_ATTACHMENT_BYTES ||
      typeof file.protectedSha256 !== "string" ||
      !/^[a-f0-9]{64}$/u.test(file.protectedSha256) ||
      stagedReferences.has(file.stagedReference) ||
      destinationReferences.has(file.destinationReference)
    ) {
      return false;
    }
    stagedReferences.add(file.stagedReference);
    destinationReferences.add(file.destinationReference);
  }
  return true;
}

export function assertRecoveryRestoreCrashJournal(
  value: unknown
): asserts value is RecoveryRestoreCrashJournal {
  if (!value || typeof value !== "object") {
    throw new RecoveryKitError(
      "RESTORE_REJECTED",
      "The interrupted Recovery Kit journal is invalid."
    );
  }
  const journal = value as Partial<RecoveryRestoreCrashJournal>;
  if (
    journal.journalVersion !== 1 ||
    typeof journal.transactionId !== "string" ||
    !/^[a-f0-9]{32}$/u.test(journal.transactionId) ||
    typeof journal.kitId !== "string" ||
    !/^[a-f0-9]{32}$/u.test(journal.kitId) ||
    journal.transactionId !== journal.kitId ||
    typeof journal.householdId !== "string" ||
    !journal.householdId ||
    typeof journal.workspaceSchemaVersion !== "number" ||
    !Number.isSafeInteger(journal.workspaceSchemaVersion) ||
    journal.workspaceSchemaVersion <= 0 ||
    typeof journal.expectedRevision !== "number" ||
    !Number.isSafeInteger(journal.expectedRevision) ||
    journal.expectedRevision < 0 ||
    typeof journal.targetRevision !== "number" ||
    !Number.isSafeInteger(journal.targetRevision) ||
    journal.targetRevision !== journal.expectedRevision + 1 ||
    typeof journal.phase !== "string" ||
    !JOURNAL_PHASES.has(journal.phase as RecoveryRestoreJournalPhase) ||
    !isValidDate(journal.createdAt) ||
    !isValidDate(journal.updatedAt) ||
    !isValidAttachmentState(journal.attachments) ||
    !isNativeWorkspace(journal.targetWorkspace) ||
    journal.targetWorkspace.schemaVersion !==
      journal.workspaceSchemaVersion ||
    journal.targetWorkspace.household.id !== journal.householdId
  ) {
    throw new RecoveryKitError(
      "RESTORE_REJECTED",
      "The interrupted Recovery Kit journal is invalid."
    );
  }
}

function snapshotsMatch(
  left: NativeWorkspace,
  right: NativeWorkspace
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasCommittedRestoreLineage(
  workspace: NativeWorkspace,
  journal: RecoveryRestoreCrashJournal
): boolean {
  const lineage = workspace.recoveryRestoreLineage;
  return Boolean(
    lineage &&
      lineage.lineageVersion === 1 &&
      lineage.transactionId === journal.transactionId &&
      lineage.targetRevision === journal.targetRevision &&
      workspace.household.id === journal.householdId &&
      workspace.schemaVersion === journal.workspaceSchemaVersion
  );
}

/**
 * Runs before WorkspaceProvider exposes a snapshot. The repository revision is
 * the commit point:
 *
 * - the original revision means the SQLCipher replacement never committed, so
 *   staged/installed attachment changes are removed;
 * - the target revision plus the exact journaled snapshot means the new state
 *   committed, so key/files are idempotently finished;
 * - every other combination is rejected and the vault stays closed.
 */
export async function resolveInterruptedRecoveryRestore(input: {
  readonly repository: NativeWorkspaceRepository;
  readonly attachments: unknown;
  readonly householdId: string | null;
  readonly deviceId: string;
}): Promise<InterruptedRecoveryResolution> {
  if (!isRecoveryRestoreJournalPort(input.repository)) {
    return "none";
  }
  const journal =
    await input.repository.loadRecoveryRestoreJournal();
  if (!journal) return "none";
  assertRecoveryRestoreCrashJournal(journal);
  const targetWorkspace = journal.targetWorkspace;
  if (!isNativeWorkspace(targetWorkspace)) {
    throw new RecoveryKitError(
      "RESTORE_REJECTED",
      "The interrupted Recovery Kit target is invalid."
    );
  }

  if (
    !input.householdId ||
    journal.householdId !== input.householdId ||
    journal.attachments.vaultScopeId !== input.repository.scopeId ||
    targetWorkspace.deviceId !== input.deviceId ||
    !isInterruptedRecoveryAttachmentResolver(input.attachments)
  ) {
    throw new RecoveryKitError(
      "RESTORE_REJECTED",
      "The interrupted Recovery Kit does not match this unlocked vault."
    );
  }

  const current = await input.repository.load();
  const currentWorkspace =
    current.snapshot && isNativeWorkspace(current.snapshot)
      ? current.snapshot
      : null;
  const exactCommittedTarget =
    current.revision === journal.targetRevision &&
    currentWorkspace !== null &&
    snapshotsMatch(currentWorkspace, targetWorkspace);
  const committedLineage =
    current.revision >= journal.targetRevision &&
    currentWorkspace !== null &&
    hasCommittedRestoreLineage(currentWorkspace, journal);
  const legacyCommittedLineage =
    current.revision > journal.targetRevision &&
    journal.phase === "workspace-committed" &&
    targetWorkspace.recoveryRestoreLineage === undefined &&
    currentWorkspace !== null &&
    currentWorkspace.household.id === journal.householdId &&
    currentWorkspace.deviceId === targetWorkspace.deviceId &&
    currentWorkspace.schemaVersion === journal.workspaceSchemaVersion;
  if (
    exactCommittedTarget ||
    committedLineage ||
    legacyCommittedLineage
  ) {
    await input.attachments.resolveInterruptedRecoveryAttachmentRestore(
      journal.attachments,
      "complete"
    );
    if (journal.phase !== "workspace-committed") {
      await input.repository.transitionRecoveryRestoreJournal(
        journal.transactionId,
        journal.phase,
        "workspace-committed",
        new Date().toISOString()
      );
    }
    await input.repository.clearRecoveryRestoreJournal(
      journal.transactionId
    );
    return "completed";
  }

  if (
    current.revision === journal.expectedRevision &&
    journal.phase !== "workspace-committed" &&
    currentWorkspace &&
    currentWorkspace.household.id === journal.householdId
  ) {
    await input.attachments.resolveInterruptedRecoveryAttachmentRestore(
      journal.attachments,
      "rollback"
    );
    await input.repository.clearRecoveryRestoreJournal(
      journal.transactionId
    );
    return "rolled-back";
  }

  throw new RecoveryKitError(
    "RESTORE_REJECTED",
    "The interrupted Recovery Kit has an ambiguous commit state. The vault remains closed."
  );
}
