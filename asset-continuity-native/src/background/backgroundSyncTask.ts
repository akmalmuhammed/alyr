import {
  DEFAULT_BACKGROUND_EXECUTION_WINDOW_MS,
  runBackgroundSync,
  type BackgroundSyncClock,
  type BackgroundSyncRunResult,
  type BackgroundSyncRuntimeState
} from "./runBackgroundSync";

export interface BackgroundSyncRuntimeResolver {
  readonly resolve: () => Promise<BackgroundSyncRuntimeState>;
}

export type BackgroundSyncLogEvent =
  | {
      readonly event: "background-sync.coalesced";
    }
  | {
      readonly event: "background-sync.skipped";
      readonly reason:
        | "signed-out"
        | "vault-locked"
        | "provider-missing"
        | "clean-vault"
        | "expired";
    }
  | {
      readonly event: "background-sync.finished";
      readonly outcome:
        | "idle"
        | "synced"
        | "retry"
        | "needs-attention";
      readonly metadataOperationsAttempted: number;
      readonly evidenceTransfersAttempted: number;
    };

/**
 * Deliberately accepts only an allow-listed diagnostic shape. Free-form
 * strings, identifiers, filenames, provider responses, and ContractError
 * messages have no path into the background logger.
 */
export interface BackgroundSyncLogger {
  readonly record: (
    event: BackgroundSyncLogEvent
  ) => void | Promise<void>;
}

export interface BackgroundSyncTaskInvocation {
  /** A native scheduler adapter may provide an earlier OS deadline. */
  readonly expiresAtMs?: number;
}

export type BackgroundSyncTask = (
  invocation?: BackgroundSyncTaskInvocation
) => Promise<BackgroundSyncRunResult>;

export interface CreateBackgroundSyncTaskRequest {
  readonly runtime: BackgroundSyncRuntimeResolver;
  readonly logger?: BackgroundSyncLogger;
  readonly clock?: BackgroundSyncClock;
  /**
   * Inject the same vault-operation gate used by foreground reconciliation,
   * Recovery Kit restore, purge, and account transitions. The task remains
   * single-flight on its own; this seam prevents cross-feature revision races.
   */
  readonly runExclusive?: <T>(
    work: () => Promise<T>
  ) => Promise<T>;
  readonly executionWindowMs?: number;
  readonly metadataOperationLimit?: number;
  readonly evidenceTransferLimit?: number;
}

function safeRecord(
  logger: BackgroundSyncLogger | undefined,
  event: BackgroundSyncLogEvent
): void {
  try {
    if (logger) {
      void Promise.resolve(logger.record(event)).catch(() => undefined);
    }
  } catch {
    // Diagnostic sinks are observational and never control vault work.
  }
}

function retryResult(): BackgroundSyncRunResult {
  return {
    kind: "finished",
    outcome: "retry",
    metadataOperationsAttempted: 0,
    evidenceTransfersAttempted: 0
  };
}

/**
 * Creates the process-local task hook used by a later Expo adapter.
 *
 * Concurrent scheduler deliveries coalesce onto the same promise. This keeps
 * the durable outbox idempotent without opening a second database transaction
 * or materializing the same protected attachment twice.
 */
export function createBackgroundSyncTask(
  request: CreateBackgroundSyncTaskRequest
): BackgroundSyncTask {
  let inFlight: Promise<BackgroundSyncRunResult> | null = null;
  let activeDeadlineMs: number | null = null;
  const clock = request.clock ?? { nowMs: Date.now };
  const executionWindowMs =
    request.executionWindowMs !== undefined &&
    Number.isFinite(request.executionWindowMs) &&
    request.executionWindowMs > 0
      ? request.executionWindowMs
      : DEFAULT_BACKGROUND_EXECUTION_WINDOW_MS;

  return (invocation = {}) => {
    let invokedAt: number;
    try {
      const candidate = clock.nowMs();
      invokedAt = Number.isFinite(candidate) ? candidate : Date.now();
    } catch {
      invokedAt = Date.now();
    }
    const internalDeadline = invokedAt + executionWindowMs;
    const invocationDeadline =
      invocation.expiresAtMs !== undefined &&
      Number.isFinite(invocation.expiresAtMs)
        ? Math.min(invocation.expiresAtMs, internalDeadline)
        : internalDeadline;

    if (inFlight) {
      activeDeadlineMs = Math.min(
        activeDeadlineMs ?? invocationDeadline,
        invocationDeadline
      );
      safeRecord(request.logger, {
        event: "background-sync.coalesced"
      });
      return inFlight;
    }
    activeDeadlineMs = invocationDeadline;
    const deadline = {
      expiresAtMs: () => activeDeadlineMs ?? invocationDeadline
    };

    const task = (async (): Promise<BackgroundSyncRunResult> => {
      let result: BackgroundSyncRunResult;
      try {
        const run = async () => {
          const runtime = await request.runtime.resolve();
          return runBackgroundSync({
            runtime,
            clock,
            deadline,
            ...(request.metadataOperationLimit === undefined
              ? {}
              : {
                  metadataOperationLimit:
                    request.metadataOperationLimit
                }),
            ...(request.evidenceTransferLimit === undefined
              ? {}
              : {
                  evidenceTransferLimit:
                    request.evidenceTransferLimit
                })
          });
        };
        result = request.runExclusive
          ? await request.runExclusive(run)
          : await run();
      } catch {
        result = retryResult();
      }

      if (result.kind === "skipped") {
        safeRecord(request.logger, {
          event: "background-sync.skipped",
          reason: result.reason
        });
      } else {
        safeRecord(request.logger, {
          event: "background-sync.finished",
          outcome: result.outcome,
          metadataOperationsAttempted:
            result.metadataOperationsAttempted,
          evidenceTransfersAttempted:
            result.evidenceTransfersAttempted
        });
      }
      return result;
    })();

    let wrapped!: Promise<BackgroundSyncRunResult>;
    wrapped = task.finally(() => {
      if (inFlight === wrapped) {
        inFlight = null;
        activeDeadlineMs = null;
      }
    });
    inFlight = wrapped;
    return wrapped;
  };
}
