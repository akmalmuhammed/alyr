import {
  runSyncLocalBoundary,
  runSyncProviderBoundary,
  type SyncExecutionControl
} from "@/data/syncExecution";
import {
  createVaultGenerationScope,
  createVaultOperationGate
} from "@/data/vaultOperationGate";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("generation-scoped synchronization execution", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("hard-times out a hung provider without blocking an unrelated local save or committing afterward", async () => {
    jest.useFakeTimers();
    const gate = createVaultOperationGate();
    const save = jest.fn(async () => undefined);
    const commit = jest.fn(async () => undefined);
    const providerState: { signal?: AbortSignal } = {};
    const generation = createVaultGenerationScope();
    let markProviderStarted!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      markProviderStarted = resolve;
    });
    const execution: SyncExecutionControl = {
      providerTimeoutMs: 100,
      runLocalExclusive: (work) => gate.runExclusive(work),
      trackProviderSettlement: (providerPromise) =>
        generation.track(() => providerPromise)
    };

    const syncRun = (async () => {
      await runSyncLocalBoundary(execution, async () => undefined);
      await runSyncProviderBoundary(execution, (context) => {
        providerState.signal = context.signal;
        markProviderStarted();
        return new Promise<never>((_resolve, reject) => {
          context.signal.addEventListener(
            "abort",
            () => reject(new Error("provider aborted")),
            { once: true }
          );
        });
      });
      await runSyncLocalBoundary(execution, commit);
    })();
    const rejection = expect(syncRun).rejects.toMatchObject({
      name: "SyncExecutionCancelledError",
      reason: "timeout"
    });
    await providerStarted;

    await expect(gate.runExclusive(save)).resolves.toBeUndefined();
    expect(save).toHaveBeenCalledTimes(1);
    expect(providerState.signal?.aborted).toBe(false);

    await jest.advanceTimersByTimeAsync(100);
    await rejection;
    await expect(generation.whenIdle()).resolves.toBeUndefined();
    expect(providerState.signal?.aborted).toBe(true);
    expect(commit).not.toHaveBeenCalled();
  });

  it("drops an old account result after an account switch and performs no post-cancel local commit", async () => {
    const gate = createVaultOperationGate();
    const generation = createVaultGenerationScope();
    const providerResult = deferred<string>();
    const commit = jest.fn(async (_remote: string) => undefined);
    let activeAccount = "account-a";
    let markProviderStarted!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      markProviderStarted = resolve;
    });
    const execution: SyncExecutionControl = {
      signal: generation.signal,
      isCurrent: () => activeAccount === "account-a",
      providerTimeoutMs: 1_000,
      runLocalExclusive: (work) => gate.runExclusive(work),
      trackProviderSettlement: (providerPromise) =>
        generation.track(() => providerPromise)
    };

    const syncRun = (async () => {
      const remote = await runSyncProviderBoundary(
        execution,
        async () => {
          markProviderStarted();
          return providerResult.promise;
        }
      );
      await runSyncLocalBoundary(execution, () => commit(remote));
    })();
    const rejection = expect(syncRun).rejects.toMatchObject({
      name: "SyncExecutionCancelledError",
      reason: "cancelled"
    });
    await providerStarted;

    activeAccount = "account-b";
    generation.cancel();
    providerResult.resolve("old-account-value");

    await rejection;
    await generation.whenIdle();
    await Promise.resolve();
    expect(commit).not.toHaveBeenCalled();
  });

  it("keeps a vault generation non-idle when a noncompliant provider never settles after abort", async () => {
    const generation = createVaultGenerationScope();
    let markProviderStarted!: () => void;
    const providerStarted = new Promise<void>((resolve) => {
      markProviderStarted = resolve;
    });
    const execution: SyncExecutionControl = {
      signal: generation.signal,
      providerTimeoutMs: 1_000,
      trackProviderSettlement: (providerPromise) =>
        generation.track(() => providerPromise)
    };
    const providerRun = runSyncProviderBoundary(execution, () => {
      markProviderStarted();
      // Deliberately violates ProviderRequestContext by ignoring abort and
      // never settling. A secure transition must stay pending, not detach it.
      return new Promise<never>(() => undefined);
    });
    const rejection = expect(providerRun).rejects.toMatchObject({
      name: "SyncExecutionCancelledError",
      reason: "cancelled"
    });
    await providerStarted;

    generation.cancel();
    await rejection;
    let becameIdle = false;
    void generation.whenIdle().then(() => {
      becameIdle = true;
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(becameIdle).toBe(false);
  });
});
