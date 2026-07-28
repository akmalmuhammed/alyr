import type { ProviderRequestContext } from "@alyr/contracts";

// A 10 MB foreground Evidence transfer can legitimately take tens of seconds
// on a constrained mobile connection. It remains hard-bounded, while the
// background runner injects its tighter eight-second ceiling.
export const DEFAULT_PROVIDER_CALL_TIMEOUT_MS = 60_000;

export type SyncLocalExclusiveRunner = <T>(
  work: () => Promise<T>
) => Promise<T>;

export type SyncProviderSettlementTracker = <T>(
  providerPromise: Promise<T>
) => Promise<T>;

export interface SyncExecutionControl {
  readonly signal?: AbortSignal;
  readonly isCurrent?: () => boolean;
  readonly remainingTimeMs?: () => number;
  readonly providerTimeoutMs?: number;
  readonly runLocalExclusive?: SyncLocalExclusiveRunner;
  /**
   * Retains the raw provider promise after the outward timeout/cancellation
   * race settles. Vault transitions use this to wait for adapter abort/finally
   * cleanup without holding the global local-operation gate across network.
   */
  readonly trackProviderSettlement?: SyncProviderSettlementTracker;
}

export class SyncExecutionCancelledError extends Error {
  readonly reason: "cancelled" | "timeout";

  constructor(reason: "cancelled" | "timeout") {
    super(
      reason === "timeout"
        ? "The provider operation exceeded its bounded execution window."
        : "The vault generation changed before synchronization completed."
    );
    this.name = "SyncExecutionCancelledError";
    this.reason = reason;
  }
}

export function isSyncExecutionCancelled(
  value: unknown
): value is SyncExecutionCancelledError {
  return value instanceof SyncExecutionCancelledError;
}

export function syncExecutionIsActive(
  control: SyncExecutionControl | undefined
): boolean {
  if (control?.signal?.aborted) return false;
  if (!control?.isCurrent) return true;
  try {
    return control.isCurrent();
  } catch {
    return false;
  }
}

export function assertSyncExecutionActive(
  control: SyncExecutionControl | undefined
): void {
  if (!syncExecutionIsActive(control)) {
    throw new SyncExecutionCancelledError("cancelled");
  }
}

function boundedProviderTimeout(
  control: SyncExecutionControl | undefined
): number {
  const configured =
    control?.providerTimeoutMs !== undefined &&
    Number.isFinite(control.providerTimeoutMs) &&
    control.providerTimeoutMs > 0
      ? control.providerTimeoutMs
      : DEFAULT_PROVIDER_CALL_TIMEOUT_MS;
  let remaining = Number.POSITIVE_INFINITY;
  if (control?.remainingTimeMs) {
    try {
      remaining = control.remainingTimeMs();
    } catch {
      remaining = 0;
    }
  }
  const bounded = Math.min(configured, remaining);
  if (!Number.isFinite(bounded)) return configured;
  return Math.max(0, Math.floor(bounded));
}

/**
 * Runs one provider call with both cooperative abort propagation and a hard
 * Promise boundary. The outward caller stops immediately on cancellation, but
 * a generation tracker retains the raw provider promise until its abort/finally
 * cleanup settles. A provider that never settles after abort violates the port
 * contract and intentionally keeps that vault generation non-idle.
 */
export async function runSyncProviderBoundary<T>(
  control: SyncExecutionControl | undefined,
  start: (context: ProviderRequestContext) => Promise<T>
): Promise<T> {
  assertSyncExecutionActive(control);
  const timeoutMs = boundedProviderTimeout(control);
  if (timeoutMs <= 0) {
    throw new SyncExecutionCancelledError("timeout");
  }

  const controller = new AbortController();
  const parentSignal = control?.signal;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let settled = false;
  let rejectCancellation!: (error: SyncExecutionCancelledError) => void;
  const cancellation = new Promise<never>((_resolve, reject) => {
    rejectCancellation = reject;
  });
  const cancel = (reason: "cancelled" | "timeout"): void => {
    if (settled) return;
    settled = true;
    controller.abort();
    rejectCancellation(new SyncExecutionCancelledError(reason));
  };
  const onParentAbort = (): void => cancel("cancelled");
  if (parentSignal?.aborted) {
    cancel("cancelled");
  } else {
    parentSignal?.addEventListener("abort", onParentAbort, {
      once: true
    });
    timeoutHandle = setTimeout(() => cancel("timeout"), timeoutMs);
  }

  const context: ProviderRequestContext = {
    signal: controller.signal,
    deadlineAtMs: Date.now() + timeoutMs
  };
  const rawProviderPromise = Promise.resolve().then(() => start(context));
  const providerSettlement = control?.trackProviderSettlement
    ? control.trackProviderSettlement(rawProviderPromise)
    : rawProviderPromise;
  try {
    const result = await Promise.race([
      providerSettlement,
      cancellation
    ]);
    settled = true;
    assertSyncExecutionActive(control);
    return result;
  } finally {
    settled = true;
    if (timeoutHandle !== null) clearTimeout(timeoutHandle);
    parentSignal?.removeEventListener("abort", onParentAbort);
    controller.abort();
  }
}

/**
 * Serializes only protected local state. Network waits belong outside this
 * boundary so normal saves are not queued behind provider latency.
 */
export async function runSyncLocalBoundary<T>(
  control: SyncExecutionControl | undefined,
  work: () => Promise<T>
): Promise<T> {
  assertSyncExecutionActive(control);
  const execute = async (): Promise<T> => {
    assertSyncExecutionActive(control);
    const result = await work();
    assertSyncExecutionActive(control);
    return result;
  };
  return control?.runLocalExclusive
    ? control.runLocalExclusive(execute)
    : execute();
}

/**
 * Cleanup is serialized with vault transitions, but deliberately still runs
 * after cancellation so temporary plaintext can always be removed.
 */
export function runSyncLocalCleanupBoundary<T>(
  control: SyncExecutionControl | undefined,
  work: () => Promise<T>
): Promise<T> {
  return control?.runLocalExclusive
    ? control.runLocalExclusive(work)
    : work();
}
