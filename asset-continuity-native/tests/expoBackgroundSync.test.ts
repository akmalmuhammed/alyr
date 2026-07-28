jest.mock("expo-background-task", () => ({
  BackgroundTaskResult: {
    Success: 1,
    Failed: 2
  },
  BackgroundTaskStatus: {
    Restricted: 1,
    Available: 2
  },
  addExpirationListener: jest.fn(),
  getStatusAsync: jest.fn(),
  registerTaskAsync: jest.fn(),
  unregisterTaskAsync: jest.fn()
}));

jest.mock("expo-task-manager", () => ({
  defineTask: jest.fn(),
  isTaskDefined: jest.fn(),
  isTaskRegisteredAsync: jest.fn()
}));

import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

import type { BackgroundSyncTask } from "@/background/backgroundSyncTask";
import {
  configureExpoBackgroundSyncTask,
  expoBackgroundTaskResultFor,
  installExpoBackgroundSync,
  registerExpoBackgroundSync
} from "@/background/expoBackgroundSync";
import { ALYR_BACKGROUND_SYNC_TASK_NAME } from "@/background/registerBackgroundSync";
import type { BackgroundSyncRunResult } from "@/background/runBackgroundSync";

const defineTask = jest.mocked(TaskManager.defineTask);
const isTaskDefined = jest.mocked(TaskManager.isTaskDefined);
const isTaskRegistered = jest.mocked(
  TaskManager.isTaskRegisteredAsync
);
const addExpirationListener = jest.mocked(
  BackgroundTask.addExpirationListener
);
const getStatus = jest.mocked(BackgroundTask.getStatusAsync);
const registerTask = jest.mocked(
  BackgroundTask.registerTaskAsync
);
const unregisterTask = jest.mocked(
  BackgroundTask.unregisterTaskAsync
);

const moduleScopeDefinition = defineTask.mock.calls[0] as unknown as [
  string,
  TaskManager.TaskManagerTaskExecutor
];
const nativeExecutor = moduleScopeDefinition[1];

const syncedResult: BackgroundSyncRunResult = {
  kind: "finished",
  outcome: "synced",
  metadataOperationsAttempted: 1,
  evidenceTransfersAttempted: 1
};

function taskBody(
  error: TaskManager.TaskManagerError | null = null
): TaskManager.TaskManagerTaskBody {
  return {
    data: null,
    error,
    executionInfo: {
      eventId: "fixture-event",
      taskName: ALYR_BACKGROUND_SYNC_TASK_NAME
    }
  };
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("Expo background-sync adapter", () => {
  let dispose: (() => void) | undefined;
  let removeExpirationListener: jest.Mock;
  let nativeRegistered: boolean;

  beforeEach(() => {
    jest.clearAllMocks();
    dispose = undefined;
    nativeRegistered = false;
    removeExpirationListener = jest.fn();
    addExpirationListener.mockReturnValue({
      remove: removeExpirationListener
    });
    getStatus.mockResolvedValue(
      BackgroundTask.BackgroundTaskStatus.Available
    );
    isTaskDefined.mockReturnValue(true);
    isTaskRegistered.mockImplementation(async () => nativeRegistered);
    registerTask.mockImplementation(async () => {
      nativeRegistered = true;
    });
    unregisterTask.mockImplementation(async () => {
      nativeRegistered = false;
    });
  });

  afterEach(async () => {
    dispose?.();
    // installExpoBackgroundSync clears the resolver synchronously, then
    // unregisters through a serialized fire-and-forget native lifecycle.
    await new Promise<void>((resolve) => setImmediate(resolve));
  });

  it("defines the stable task at module scope before React mounts", () => {
    expect(moduleScopeDefinition[0]).toBe(
      ALYR_BACKGROUND_SYNC_TASK_NAME
    );
    expect(typeof moduleScopeDefinition[1]).toBe("function");
  });

  it("maps retryable work to failure and intentional no-ops to success", () => {
    expect(
      expoBackgroundTaskResultFor({
        kind: "finished",
        outcome: "retry",
        metadataOperationsAttempted: 1,
        evidenceTransfersAttempted: 0
      })
    ).toBe(BackgroundTask.BackgroundTaskResult.Failed);
    expect(
      expoBackgroundTaskResultFor({
        kind: "skipped",
        reason: "expired",
        metadataOperationsAttempted: 0,
        evidenceTransfersAttempted: 0
      })
    ).toBe(BackgroundTask.BackgroundTaskResult.Failed);
    expect(
      expoBackgroundTaskResultFor({
        kind: "skipped",
        reason: "vault-locked",
        metadataOperationsAttempted: 0,
        evidenceTransfersAttempted: 0
      })
    ).toBe(BackgroundTask.BackgroundTaskResult.Success);
    expect(
      expoBackgroundTaskResultFor({
        kind: "finished",
        outcome: "needs-attention",
        metadataOperationsAttempted: 1,
        evidenceTransfersAttempted: 0
      })
    ).toBe(BackgroundTask.BackgroundTaskResult.Success);
    expect(expoBackgroundTaskResultFor(syncedResult, true)).toBe(
      BackgroundTask.BackgroundTaskResult.Failed
    );
  });

  it("runs the fail-closed module resolver before React configures a task", async () => {
    await expect(nativeExecutor(taskBody())).resolves.toBe(
      BackgroundTask.BackgroundTaskResult.Failed
    );
    expect(addExpirationListener).toHaveBeenCalledTimes(1);
    expect(isTaskRegistered).toHaveBeenCalledWith(
      ALYR_BACKGROUND_SYNC_TASK_NAME
    );
    expect(unregisterTask).not.toHaveBeenCalled();

    await expect(
      nativeExecutor(
        taskBody({ code: "FIXTURE", message: "fixture failure" })
      )
    ).resolves.toBe(BackgroundTask.BackgroundTaskResult.Failed);
  });

  it("removes a stale process-resident registration during a cold launch", async () => {
    isTaskRegistered.mockResolvedValue(true);

    await expect(nativeExecutor(taskBody())).resolves.toBe(
      BackgroundTask.BackgroundTaskResult.Failed
    );

    expect(unregisterTask).toHaveBeenCalledWith(
      ALYR_BACKGROUND_SYNC_TASK_NAME
    );
  });

  it("fails closed when cold-launch unregistration is rejected", async () => {
    nativeRegistered = true;
    unregisterTask.mockRejectedValueOnce(
      new Error("fixture native rejection")
    );

    await expect(nativeExecutor(taskBody())).resolves.toBe(
      BackgroundTask.BackgroundTaskResult.Failed
    );
    expect(unregisterTask).toHaveBeenCalledWith(
      ALYR_BACKGROUND_SYNC_TASK_NAME
    );
    expect(removeExpirationListener).toHaveBeenCalledTimes(1);
  });

  it("runs configured work and always removes the expiration listener", async () => {
    const task = jest.fn<ReturnType<BackgroundSyncTask>, Parameters<BackgroundSyncTask>>(
      async () => syncedResult
    );
    dispose = configureExpoBackgroundSyncTask(task);

    await expect(nativeExecutor(taskBody())).resolves.toBe(
      BackgroundTask.BackgroundTaskResult.Success
    );
    expect(task).toHaveBeenCalledTimes(1);
    expect(task.mock.calls[0]).toEqual([]);
    expect(removeExpirationListener).toHaveBeenCalledTimes(1);
  });

  it("tightens the active deadline when iOS expires the worker", async () => {
    const firstRun = deferred<BackgroundSyncRunResult>();
    const task = jest
      .fn<
        ReturnType<BackgroundSyncTask>,
        Parameters<BackgroundSyncTask>
      >()
      .mockImplementationOnce(() => firstRun.promise)
      .mockResolvedValue(syncedResult);
    dispose = configureExpoBackgroundSyncTask(task);
    const now = jest.spyOn(Date, "now").mockReturnValue(12_345);

    try {
      const execution = nativeExecutor(taskBody());
      await Promise.resolve();
      const expirationHandler =
        addExpirationListener.mock.calls[0]?.[0];
      expect(expirationHandler).toBeDefined();

      expirationHandler?.();
      expect(task.mock.calls).toEqual([
        [],
        [{ expiresAtMs: 12_345 }]
      ]);

      firstRun.resolve(syncedResult);
      await expect(execution).resolves.toBe(
        BackgroundTask.BackgroundTaskResult.Failed
      );
      expect(removeExpirationListener).toHaveBeenCalledTimes(1);
    } finally {
      now.mockRestore();
    }
  });

  it("returns a native failure when the configured task rejects", async () => {
    const task: BackgroundSyncTask = async () => {
      throw new Error("fixture rejection");
    };
    dispose = configureExpoBackgroundSyncTask(task);

    await expect(nativeExecutor(taskBody())).resolves.toBe(
      BackgroundTask.BackgroundTaskResult.Failed
    );
    expect(removeExpirationListener).toHaveBeenCalledTimes(1);
  });

  it("surfaces restricted runtimes without persistent registration", async () => {
    getStatus.mockResolvedValue(
      BackgroundTask.BackgroundTaskStatus.Restricted
    );

    await expect(registerExpoBackgroundSync()).resolves.toEqual({
      kind: "restricted",
      taskName: ALYR_BACKGROUND_SYNC_TASK_NAME
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(isTaskRegistered).toHaveBeenCalledWith(
      ALYR_BACKGROUND_SYNC_TASK_NAME
    );
    expect(registerTask).not.toHaveBeenCalled();
  });

  it("keeps restricted runtimes process-local and clears them synchronously", async () => {
    getStatus.mockResolvedValue(
      BackgroundTask.BackgroundTaskStatus.Restricted
    );
    const task = jest.fn<
      ReturnType<BackgroundSyncTask>,
      Parameters<BackgroundSyncTask>
    >(async () => syncedResult);

    const installation = installExpoBackgroundSync(task);
    dispose = installation.dispose;
    await expect(installation.registration).resolves.toEqual({
      kind: "restricted",
      taskName: ALYR_BACKGROUND_SYNC_TASK_NAME
    });

    await nativeExecutor(taskBody());
    expect(task).toHaveBeenCalledTimes(1);

    installation.dispose();
    await nativeExecutor(taskBody());
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("installs a process-resident task only while the unlocked vault is active", async () => {
    const task = jest.fn<
      ReturnType<BackgroundSyncTask>,
      Parameters<BackgroundSyncTask>
    >(async () => syncedResult);

    const installation = installExpoBackgroundSync(task);
    dispose = installation.dispose;
    await expect(installation.registration).resolves.toEqual({
      kind: "process-resident",
      taskName: ALYR_BACKGROUND_SYNC_TASK_NAME,
      newlyRegistered: true
    });
    expect(registerTask).toHaveBeenCalledWith(
      ALYR_BACKGROUND_SYNC_TASK_NAME,
      { minimumInterval: 6 * 60 }
    );

    await expect(nativeExecutor(taskBody())).resolves.toBe(
      BackgroundTask.BackgroundTaskResult.Success
    );
    expect(task).toHaveBeenCalledTimes(1);

    installation.dispose();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(unregisterTask).toHaveBeenCalledWith(
      ALYR_BACKGROUND_SYNC_TASK_NAME
    );
    await nativeExecutor(taskBody());
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("removes a registration that completes after its vault was disposed", async () => {
    const pendingRegistration = deferred<void>();
    const registrationStarted = deferred<void>();
    registerTask.mockImplementationOnce(async () => {
      registrationStarted.resolve();
      await pendingRegistration.promise;
      nativeRegistered = true;
    });
    const task = jest.fn<
      ReturnType<BackgroundSyncTask>,
      Parameters<BackgroundSyncTask>
    >(async () => syncedResult);

    const installation = installExpoBackgroundSync(task);
    await registrationStarted.promise;
    expect(registerTask).toHaveBeenCalledTimes(1);

    installation.dispose();
    expect(task).not.toHaveBeenCalled();

    pendingRegistration.resolve();
    await expect(installation.registration).resolves.toEqual({
      kind: "foreground-only",
      taskName: ALYR_BACKGROUND_SYNC_TASK_NAME,
      reason: "signed-out",
      staleRegistrationRemoved: true
    });
    expect(unregisterTask).toHaveBeenCalledWith(
      ALYR_BACKGROUND_SYNC_TASK_NAME
    );
  });

  it("registers one six-hour opportunistic task across parallel startup calls", async () => {
    const task: BackgroundSyncTask = async () => syncedResult;
    dispose = configureExpoBackgroundSyncTask(task);

    const [first, second] = await Promise.all([
      registerExpoBackgroundSync(),
      registerExpoBackgroundSync()
    ]);

    expect(first).toEqual({
      kind: "process-resident",
      taskName: ALYR_BACKGROUND_SYNC_TASK_NAME,
      newlyRegistered: true
    });
    expect(second).toEqual({
      kind: "process-resident",
      taskName: ALYR_BACKGROUND_SYNC_TASK_NAME,
      newlyRegistered: false
    });
    expect(isTaskDefined).toHaveBeenCalledWith(
      ALYR_BACKGROUND_SYNC_TASK_NAME
    );
    expect(isTaskRegistered).toHaveBeenCalledTimes(2);
    expect(registerTask).toHaveBeenCalledTimes(1);
    expect(registerTask).toHaveBeenCalledWith(
      ALYR_BACKGROUND_SYNC_TASK_NAME,
      { minimumInterval: 6 * 60 }
    );
  });

  it("registers again after the prior unlocked-vault installation is removed", async () => {
    const firstTask: BackgroundSyncTask = async () => syncedResult;
    const first = installExpoBackgroundSync(firstTask);
    await expect(first.registration).resolves.toMatchObject({
      kind: "process-resident",
      newlyRegistered: true
    });

    first.dispose();
    await new Promise<void>((resolve) => setImmediate(resolve));

    const secondTask: BackgroundSyncTask = async () => syncedResult;
    const second = installExpoBackgroundSync(secondTask);
    dispose = second.dispose;
    await expect(second.registration).resolves.toMatchObject({
      kind: "process-resident",
      newlyRegistered: true
    });
    expect(registerTask).toHaveBeenCalledTimes(2);
  });

  it("reports foreground-only and removes an earlier OS registration under the biometric policy", async () => {
    nativeRegistered = true;

    await expect(registerExpoBackgroundSync()).resolves.toEqual({
      kind: "foreground-only",
      taskName: ALYR_BACKGROUND_SYNC_TASK_NAME,
      reason: "signed-out",
      staleRegistrationRemoved: true
    });
    expect(registerTask).not.toHaveBeenCalled();
    expect(unregisterTask).toHaveBeenCalledWith(
      ALYR_BACKGROUND_SYNC_TASK_NAME
    );
  });

  it("does not let a stale installation dispose a newer runtime task or registration", async () => {
    const firstTask: BackgroundSyncTask = async () => syncedResult;
    const secondTask = jest.fn<
      ReturnType<BackgroundSyncTask>,
      Parameters<BackgroundSyncTask>
    >(async () => syncedResult);
    const first = installExpoBackgroundSync(firstTask);
    await first.registration;
    const second = installExpoBackgroundSync(secondTask);
    await second.registration;
    dispose = second.dispose;

    first.dispose();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(unregisterTask).not.toHaveBeenCalled();
    await expect(nativeExecutor(taskBody())).resolves.toBe(
      BackgroundTask.BackgroundTaskResult.Success
    );
    expect(secondTask).toHaveBeenCalledTimes(1);
  });
});
