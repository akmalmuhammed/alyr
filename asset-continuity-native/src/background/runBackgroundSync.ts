import type {
  ContractError,
  Result,
  SyncOperation,
  SyncTransport,
  UploadCompletionResponse,
  UploadIntentResponse
} from "@alyr/contracts";

import type {
  AttachmentStore,
  MaterializedAttachment
} from "@/data/attachmentStore";
import type { EvidenceDownloadPort } from "@/data/evidenceDownload";
import type {
  EvidenceUploadDescriptor,
  EvidenceUploadPort,
  EvidenceUploadTransfer
} from "@/data/evidenceUpload";
import {
  reconcileForeground,
  type ForegroundSyncResult
} from "@/data/foregroundSync";
import type { NativeWorkspaceRepository } from "@/data/repository";

export const DEFAULT_BACKGROUND_METADATA_OPERATION_LIMIT = 20;
export const DEFAULT_BACKGROUND_EVIDENCE_TRANSFER_LIMIT = 2;
export const DEFAULT_BACKGROUND_EXECUTION_WINDOW_MS = 25_000;

const MAX_BACKGROUND_METADATA_OPERATION_LIMIT = 20;
const MAX_BACKGROUND_EVIDENCE_TRANSFER_LIMIT = 2;

export type BackgroundSyncRuntimeState =
  | { readonly kind: "signed-out" }
  | { readonly kind: "vault-locked" }
  | { readonly kind: "provider-missing" }
  | {
      readonly kind: "ready";
      readonly accountId: string;
      readonly householdId: string;
      readonly repository: NativeWorkspaceRepository;
      readonly transport: SyncTransport;
      readonly attachmentStore: AttachmentStore;
      readonly evidenceUploadPort: EvidenceUploadPort;
      readonly evidenceDownloadPort: EvidenceDownloadPort;
    };

export type BackgroundSyncSkipReason =
  | "signed-out"
  | "vault-locked"
  | "provider-missing"
  | "clean-vault"
  | "expired";

export type BackgroundSyncOutcome =
  | "idle"
  | "synced"
  | "retry"
  | "needs-attention";

export type BackgroundSyncRunResult =
  | {
      readonly kind: "skipped";
      readonly reason: BackgroundSyncSkipReason;
      readonly metadataOperationsAttempted: 0;
      readonly evidenceTransfersAttempted: 0;
    }
  | {
      readonly kind: "finished";
      readonly outcome: BackgroundSyncOutcome;
      readonly metadataOperationsAttempted: number;
      readonly evidenceTransfersAttempted: number;
    };

export interface BackgroundSyncClock {
  readonly nowMs: () => number;
}

export interface BackgroundSyncDeadline {
  /**
   * Read at every network/byte boundary so a coalesced native delivery can
   * tighten the active task's deadline without starting a second run.
   */
  readonly expiresAtMs: () => number;
}

export interface RunBackgroundSyncRequest {
  readonly runtime: BackgroundSyncRuntimeState;
  readonly clock?: BackgroundSyncClock;
  readonly expiresAtMs?: number;
  readonly deadline?: BackgroundSyncDeadline;
  /**
   * Overrides may only reduce the hard background ceilings. Foreground sync
   * remains the place for an unrestricted user-visible reconciliation.
   */
  readonly metadataOperationLimit?: number;
  readonly evidenceTransferLimit?: number;
}

function stoppedError(message: string): ContractError {
  return {
    errorVersion: 1,
    code: "OFFLINE",
    message,
    retryable: true
  };
}

function stoppedResult<T>(message: string): Result<T> {
  return {
    ok: false,
    error: stoppedError(message)
  };
}

function normalizeLimit(
  requested: number | undefined,
  fallback: number,
  maximum: number
): number {
  if (
    requested === undefined ||
    !Number.isSafeInteger(requested) ||
    requested < 0
  ) {
    return fallback;
  }
  return Math.min(requested, maximum);
}

function validNow(clock: BackgroundSyncClock): number {
  const value = clock.nowMs();
  return Number.isFinite(value) ? value : Date.now();
}

class ExecutionBudget {
  private metadataOperations = 0;
  private evidenceTransfers = 0;

  constructor(
    private readonly clock: BackgroundSyncClock,
    private readonly deadline: BackgroundSyncDeadline,
    private readonly metadataLimit: number,
    private readonly evidenceLimit: number
  ) {}

  get metadataOperationsAttempted(): number {
    return this.metadataOperations;
  }

  get evidenceTransfersAttempted(): number {
    return this.evidenceTransfers;
  }

  expired(): boolean {
    const expiresAtMs = this.deadline.expiresAtMs();
    return (
      !Number.isFinite(expiresAtMs) ||
      validNow(this.clock) >= expiresAtMs
    );
  }

  selectMetadataOperations(
    operations: readonly SyncOperation[]
  ): readonly SyncOperation[] {
    if (this.expired()) return [];
    const remaining = Math.max(
      0,
      this.metadataLimit - this.metadataOperations
    );
    const selected = operations.slice(0, remaining);
    this.metadataOperations += selected.length;
    return selected;
  }

  canContinueEvidenceWork(): boolean {
    return !this.expired() && this.evidenceTransfers < this.evidenceLimit;
  }

  beginEvidenceTransfer(): boolean {
    if (!this.canContinueEvidenceWork()) return false;
    this.evidenceTransfers += 1;
    return true;
  }
}

function backgroundRepository(
  repository: NativeWorkspaceRepository,
  firstLoad: Awaited<ReturnType<NativeWorkspaceRepository["load"]>>
): NativeWorkspaceRepository {
  let pendingFirstLoad:
    | Awaited<ReturnType<NativeWorkspaceRepository["load"]>>
    | null = firstLoad;

  return {
    kind: repository.kind,
    durable: repository.durable,
    encryptedAtRest: repository.encryptedAtRest,
    scopeId: repository.scopeId,
    initialize: () => repository.initialize(),
    load: async () => {
      if (pendingFirstLoad !== null) {
        const loaded = pendingFirstLoad;
        pendingFirstLoad = null;
        return loaded;
      }
      return repository.load();
    },
    commit: (commit) => repository.commit(commit),
    // Reconciliation needs the complete durable ledger to recognize server
    // echoes from an earlier delivery whose acknowledgement was lost. The
    // transport boundary below, not this repository view, owns the send cap.
    listPendingOperations: (limit) =>
      repository.listPendingOperations(limit),
    acknowledgeOperation: (operationId) =>
      repository.acknowledgeOperation(operationId),
    loadSyncState: () => repository.loadSyncState(),
    commitSync: (commit) => repository.commitSync(commit),
    close: () => repository.close(),
    lock: () => repository.lock(),
    purge: () => repository.purge()
  };
}

function backgroundTransport(
  transport: SyncTransport,
  budget: ExecutionBudget
): SyncTransport {
  return {
    async push(operations) {
      const selected = budget.selectMetadataOperations(operations);
      if (selected.length === 0 && operations.length > 0) {
        return stoppedResult(
          "The background metadata window ended before another operation could start."
        );
      }
      return transport.push(selected);
    },
    async pull(householdId, cursor) {
      if (budget.expired()) {
        return stoppedResult(
          "The background execution window ended before cloud metadata could be pulled."
        );
      }
      return transport.pull(householdId, cursor);
    }
  };
}

function backgroundEvidenceUploadPort(
  port: EvidenceUploadPort,
  budget: ExecutionBudget
): EvidenceUploadPort {
  const awaitingCompletion = new Set<string>();

  function canContinue<T>(): Result<T> | null {
    return budget.canContinueEvidenceWork()
      ? null
      : stoppedResult(
          "The bounded background Evidence window ended before another transfer could start."
        );
  }

  return {
    async complete(descriptor, uploadId) {
      const finalizing = awaitingCompletion.has(descriptor.blobId);
      if (!finalizing) {
        const stopped = canContinue<UploadCompletionResponse>();
        if (stopped) return stopped;
      }
      try {
        const completed = await port.complete(descriptor, uploadId);
        if (
          !finalizing &&
          !completed.ok &&
          budget.expired() &&
          (completed.error.code === "NOT_FOUND" ||
            (completed.error.code === "STORAGE_UNAVAILABLE" &&
              completed.error.retryable))
        ) {
          // A missing completion would make the foreground reconciler decrypt
          // and materialize local bytes next. Stop here if the OS window ended
          // during the provider probe.
          return stoppedResult(
            "The background execution window ended before protected Evidence could be prepared."
          );
        }
        return completed;
      } finally {
        if (finalizing) {
          awaitingCompletion.delete(descriptor.blobId);
        }
      }
    },
    async createIntent(descriptor) {
      const stopped = canContinue<UploadIntentResponse>();
      return stopped ?? port.createIntent(descriptor);
    },
    async upload(
      descriptor: EvidenceUploadDescriptor,
      intent,
      attachment: MaterializedAttachment
    ): Promise<Result<EvidenceUploadTransfer>> {
      if (!budget.beginEvidenceTransfer()) {
        return stoppedResult(
          "The bounded background Evidence window ended before another transfer could start."
        );
      }
      const uploaded = await port.upload(
        descriptor,
        intent,
        attachment
      );
      if (uploaded.ok) {
        // Completion is part of the transfer already in progress. Let it run
        // even if the operating-system window expires while bytes are moving.
        awaitingCompletion.add(descriptor.blobId);
      }
      return uploaded;
    }
  };
}

function backgroundEvidenceDownloadPort(
  port: EvidenceDownloadPort,
  budget: ExecutionBudget
): EvidenceDownloadPort {
  return {
    download(descriptor) {
      if (!budget.beginEvidenceTransfer()) {
        return Promise.resolve(
          stoppedResult(
            "The bounded background Evidence window ended before another transfer could start."
          )
        );
      }
      return port.download(descriptor);
    }
  };
}

function outcomeFor(result: ForegroundSyncResult): BackgroundSyncOutcome {
  if (result.kind === "offline") return "retry";
  return result.kind;
}

function finished(
  outcome: BackgroundSyncOutcome,
  budget: ExecutionBudget
): BackgroundSyncRunResult {
  return {
    kind: "finished",
    outcome,
    metadataOperationsAttempted:
      budget.metadataOperationsAttempted,
    evidenceTransfersAttempted: budget.evidenceTransfersAttempted
  };
}

function skipped(
  reason: BackgroundSyncSkipReason
): BackgroundSyncRunResult {
  return {
    kind: "skipped",
    reason,
    metadataOperationsAttempted: 0,
    evidenceTransfersAttempted: 0
  };
}

/**
 * Runs one small, retry-safe reconciliation while the operating system grants
 * background time. It deliberately reuses the foreground transaction and
 * idempotency ledger, but narrows every expensive boundary:
 *
 * - a maximum of 20 outgoing metadata operations,
 * - a maximum of two actual Evidence byte transfers,
 * - no clean-device/bootstrap materialization,
 * - and no work after the execution deadline between network transfers.
 *
 * The return value contains only outcome codes and aggregate counts. Account,
 * household, asset, file, provider, token, and error-message values never
 * leave this boundary as diagnostics.
 */
export async function runBackgroundSync(
  request: RunBackgroundSyncRequest
): Promise<BackgroundSyncRunResult> {
  if (request.runtime.kind !== "ready") {
    return skipped(request.runtime.kind);
  }

  const clock = request.clock ?? { nowMs: Date.now };
  const startedAt = validNow(clock);
  const staticExpiresAtMs =
    request.expiresAtMs ?? startedAt + DEFAULT_BACKGROUND_EXECUTION_WINDOW_MS;
  let minimumObservedDeadline = staticExpiresAtMs;
  const deadline: BackgroundSyncDeadline = {
    expiresAtMs: () => {
      if (request.deadline) {
        try {
          const candidate = request.deadline.expiresAtMs();
          minimumObservedDeadline = Number.isFinite(candidate)
            ? Math.min(minimumObservedDeadline, candidate)
            : Number.NEGATIVE_INFINITY;
        } catch {
          minimumObservedDeadline = Number.NEGATIVE_INFINITY;
        }
      }
      return minimumObservedDeadline;
    }
  };
  const initialDeadline = deadline.expiresAtMs();
  if (
    !Number.isFinite(initialDeadline) ||
    startedAt >= initialDeadline
  ) {
    return skipped("expired");
  }

  const metadataOperationLimit = normalizeLimit(
    request.metadataOperationLimit,
    DEFAULT_BACKGROUND_METADATA_OPERATION_LIMIT,
    MAX_BACKGROUND_METADATA_OPERATION_LIMIT
  );
  const evidenceTransferLimit = normalizeLimit(
    request.evidenceTransferLimit,
    DEFAULT_BACKGROUND_EVIDENCE_TRANSFER_LIMIT,
    MAX_BACKGROUND_EVIDENCE_TRANSFER_LIMIT
  );
  const budget = new ExecutionBudget(
    clock,
    deadline,
    metadataOperationLimit,
    evidenceTransferLimit
  );

  try {
    const loaded = await request.runtime.repository.load();
    // Clean-device restore is foreground-only so a partial OS window never
    // leaves a user with a half-materialized household.
    if (loaded.snapshot === null) {
      return skipped("clean-vault");
    }
    if (budget.expired()) return skipped("expired");

    const result = await reconcileForeground({
      repository: backgroundRepository(
        request.runtime.repository,
        loaded
      ),
      transport: backgroundTransport(
        request.runtime.transport,
        budget
      ),
      attachmentStore: request.runtime.attachmentStore,
      evidenceUploadPort: backgroundEvidenceUploadPort(
        request.runtime.evidenceUploadPort,
        budget
      ),
      evidenceDownloadPort: backgroundEvidenceDownloadPort(
        request.runtime.evidenceDownloadPort,
        budget
      ),
      canMaterializeProtectedAttachment: () =>
        budget.canContinueEvidenceWork(),
      householdId: request.runtime.householdId,
      accountId: request.runtime.accountId,
      now: () => new Date(validNow(clock)).toISOString()
    });
    return finished(outcomeFor(result), budget);
  } catch {
    // Repository locking, provider exceptions, and process-transition races
    // remain retryable without copying their potentially sensitive messages
    // into logs or task-manager diagnostics.
    return finished("retry", budget);
  }
}
