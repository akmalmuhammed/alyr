import {
  createVaultGenerationScope,
  createVaultOperationGate,
  runVaultOperationExclusive
} from "@/data/vaultOperationGate";
import { createBackgroundSyncTask } from "@/background/backgroundSyncTask";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("shared vault operation gate", () => {
  it("serializes work in submission order and keeps a rejection from poisoning the queue", async () => {
    const gate = createVaultOperationGate();
    const firstRelease = deferred();
    const calls: string[] = [];
    const first = gate.runExclusive(async () => {
      calls.push("first:start");
      await firstRelease.promise;
      calls.push("first:end");
    });
    const second = gate.runExclusive(async () => {
      calls.push("second");
      throw new Error("expected test failure");
    });
    const third = gate.runExclusive(async () => {
      calls.push("third");
      return 3;
    });

    await Promise.resolve();
    expect(calls).toEqual(["first:start"]);
    firstRelease.resolve();
    await first;
    await expect(second).rejects.toThrow("expected test failure");
    await expect(third).resolves.toBe(3);
    await expect(gate.whenIdle()).resolves.toBeUndefined();
    expect(calls).toEqual([
      "first:start",
      "first:end",
      "second",
      "third"
    ]);
  });

  it("keeps background runtime resolution behind an active Recovery Kit operation", async () => {
    const restoreStarted = deferred();
    const restoreRelease = deferred();
    const restore = runVaultOperationExclusive(async () => {
      restoreStarted.resolve();
      await restoreRelease.promise;
    });
    await restoreStarted.promise;

    const resolveRuntime = jest.fn(async () => ({
      kind: "signed-out" as const
    }));
    const backgroundTask = createBackgroundSyncTask({
      runtime: { resolve: resolveRuntime },
      runExclusive: runVaultOperationExclusive
    });
    const background = backgroundTask();
    await Promise.resolve();
    await Promise.resolve();
    expect(resolveRuntime).not.toHaveBeenCalled();

    restoreRelease.resolve();
    await restore;
    await expect(background).resolves.toMatchObject({
      kind: "skipped",
      reason: "signed-out"
    });
    expect(resolveRuntime).toHaveBeenCalledTimes(1);
  });

  it("aborts a displaced vault generation synchronously and stays non-idle until cleanup settles", async () => {
    const generation = createVaultGenerationScope();
    const release = deferred();
    const tracked = generation.track(async () => {
      await release.promise;
    });
    let becameIdle = false;

    generation.cancel();
    void generation.whenIdle().then(() => {
      becameIdle = true;
    });
    await Promise.resolve();

    expect(generation.signal.aborted).toBe(true);
    expect(generation.isActive()).toBe(false);
    expect(becameIdle).toBe(false);

    release.resolve();
    await tracked;
    await generation.whenIdle();
    expect(becameIdle).toBe(true);
  });
});
