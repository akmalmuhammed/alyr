export interface VaultOperationGate {
  /**
   * Runs one vault operation after every previously submitted operation has
   * settled. A rejected operation never poisons the queue.
   */
  runExclusive<T>(work: () => Promise<T>): Promise<T>;
  /** Resolves after every operation submitted before this call has settled. */
  whenIdle(): Promise<void>;
}

export interface VaultGenerationScope {
  readonly signal: AbortSignal;
  readonly isActive: () => boolean;
  /**
   * Tracks work that may temporarily leave the local vault gate for a bounded
   * provider call. Transitions cancel first, then wait for these runs to
   * settle before locking or purging the old scope.
   */
  readonly track: <T>(work: () => Promise<T>) => Promise<T>;
  readonly cancel: () => void;
  readonly whenIdle: () => Promise<void>;
}

export function createVaultGenerationScope(): VaultGenerationScope {
  const controller = new AbortController();
  let activeRuns = 0;
  let idleWaiters: Array<() => void> = [];

  const settleOne = (): void => {
    activeRuns = Math.max(0, activeRuns - 1);
    if (activeRuns !== 0) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    waiters.forEach((resolve) => resolve());
  };

  return {
    signal: controller.signal,
    isActive: () => !controller.signal.aborted,
    track<T>(work: () => Promise<T>): Promise<T> {
      activeRuns += 1;
      let run: Promise<T>;
      try {
        run = Promise.resolve().then(work);
      } catch (error) {
        settleOne();
        return Promise.reject(error);
      }
      return run.finally(settleOne);
    },
    cancel(): void {
      if (!controller.signal.aborted) {
        controller.abort();
      }
    },
    whenIdle(): Promise<void> {
      if (activeRuns === 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        idleWaiters.push(resolve);
      });
    }
  };
}

export function createVaultOperationGate(): VaultOperationGate {
  let tail: Promise<void> = Promise.resolve();

  return {
    runExclusive<T>(work: () => Promise<T>): Promise<T> {
      const run = tail.then(work, work);
      tail = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    },
    whenIdle(): Promise<void> {
      return tail;
    }
  };
}

/**
 * One process owns one active ALYR vault. Foreground mutation/sync, Recovery
 * Kit operations, account transitions, and the native background task inject
 * this same runner so runtime resolution and protected-byte work cannot cross
 * one another.
 */
const sharedVaultOperationGate = createVaultOperationGate();

export function runVaultOperationExclusive<T>(
  work: () => Promise<T>
): Promise<T> {
  return sharedVaultOperationGate.runExclusive(work);
}

export function waitForVaultOperations(): Promise<void> {
  return sharedVaultOperationGate.whenIdle();
}
