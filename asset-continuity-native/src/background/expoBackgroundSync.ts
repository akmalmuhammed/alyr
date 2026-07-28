import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";

import type { BackgroundSyncTask } from "./backgroundSyncTask";
import {
  createHeadlessBackgroundSyncTask,
  resolveHeadlessRegistrationDisposition,
  type HeadlessForegroundOnlyReason
} from "./headlessBackgroundSync";
import {
  ALYR_BACKGROUND_SYNC_TASK_NAME,
  registerBackgroundSync,
  type BackgroundSyncScheduler
} from "./registerBackgroundSync";
import type { BackgroundSyncRunResult } from "./runBackgroundSync";

let configuredTask: BackgroundSyncTask | null = null;
const headlessTask = createHeadlessBackgroundSyncTask();
let nativeLifecycleTail: Promise<void> = Promise.resolve();

function enqueueNativeLifecycle<T>(
  work: () => Promise<T>
): Promise<T> {
  const result = nativeLifecycleTail.then(work, work);
  nativeLifecycleTail = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

function clearConfiguredTask(task: BackgroundSyncTask): boolean {
  if (configuredTask !== task) return false;
  configuredTask = null;
  return true;
}

/**
 * The OS should retry only work that stopped before reaching a durable state.
 * Locked, signed-out, provider-missing, and clean-vault states are intentional
 * no-ops rather than scheduler failures.
 */
export function expoBackgroundTaskResultFor(
  result: BackgroundSyncRunResult,
  expirationObserved = false
): BackgroundTask.BackgroundTaskResult {
  if (
    expirationObserved ||
    (result.kind === "skipped" && result.reason === "expired") ||
    (result.kind === "finished" && result.outcome === "retry")
  ) {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
  return BackgroundTask.BackgroundTaskResult.Success;
}

/**
 * Installs the runtime-aware task created by createBackgroundSyncTask.
 *
 * The native callback itself is defined at module scope below so iOS can start
 * the JavaScript bundle in the background without mounting any React screen.
 */
export function configureExpoBackgroundSyncTask(
  task: BackgroundSyncTask
): () => void {
  configuredTask = task;
  return () => {
    clearConfiguredTask(task);
  };
}

async function executeExpoBackgroundSyncTask(
  body: TaskManager.TaskManagerTaskBody
): Promise<BackgroundTask.BackgroundTaskResult> {
  const processTask = configuredTask;
  const task = processTask ?? headlessTask;
  const coldLaunch = processTask === null;

  if (body.error) {
    if (coldLaunch) {
      await unregisterStaleBackgroundSyncIfIdle().catch(
        () => undefined
      );
    }
    return BackgroundTask.BackgroundTaskResult.Failed;
  }

  let expirationObserved = false;
  let acceptingExpiration = true;
  let expirationSubscription: { remove: () => void } | null = null;

  try {
    expirationSubscription = BackgroundTask.addExpirationListener(() => {
      if (!acceptingExpiration) return;
      expirationObserved = true;

      // createBackgroundSyncTask coalesces this call onto the active run and
      // tightens its monotonic deadline. Rejections remain scheduler-local.
      void task({ expiresAtMs: Date.now() }).catch(() => undefined);
    });
  } catch {
    // Android and older native shells may not expose an expiration listener.
  }

  try {
    const result = await task();
    if (coldLaunch) {
      try {
        await unregisterStaleBackgroundSyncIfIdle();
      } catch {
        return BackgroundTask.BackgroundTaskResult.Failed;
      }
      // A stale OS delivery did not synchronize a vault. Report failure for
      // this final delivery after removing the registration rather than
      // claiming a successful headless run.
      if (result.kind === "skipped") {
        return BackgroundTask.BackgroundTaskResult.Failed;
      }
    }
    return expoBackgroundTaskResultFor(result, expirationObserved);
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  } finally {
    acceptingExpiration = false;
    try {
      expirationSubscription?.remove();
    } catch {
      // Listener cleanup must not overwrite the durable task result.
    }
  }
}

/**
 * This call intentionally remains at module scope. Expo TaskManager restores
 * the callback on a background launch before any component lifecycle runs.
 */
TaskManager.defineTask(
  ALYR_BACKGROUND_SYNC_TASK_NAME,
  executeExpoBackgroundSyncTask
);

async function unregisterNativeBackgroundSync(): Promise<boolean> {
  const registered = await TaskManager.isTaskRegisteredAsync(
    ALYR_BACKGROUND_SYNC_TASK_NAME
  );
  if (!registered) return false;
  await BackgroundTask.unregisterTaskAsync(
    ALYR_BACKGROUND_SYNC_TASK_NAME
  );
  return true;
}

function unregisterStaleBackgroundSyncIfIdle(): Promise<boolean> {
  return enqueueNativeLifecycle(async () => {
    if (configuredTask) return false;
    return unregisterNativeBackgroundSync();
  });
}

function createExpoBackgroundSyncScheduler(): BackgroundSyncScheduler {
  return {
    isTaskDefined: (taskName) =>
      TaskManager.isTaskDefined(taskName),
    defineTask: (taskName) => {
      TaskManager.defineTask(taskName, executeExpoBackgroundSyncTask);
    },
    isTaskRegistered: (taskName) =>
      TaskManager.isTaskRegisteredAsync(taskName),
    registerTask: (taskName, options) =>
      BackgroundTask.registerTaskAsync(taskName, {
        minimumInterval: options.minimumIntervalMinutes
      })
  };
}

export type ExpoBackgroundSyncRegistration =
  | {
      readonly kind: "restricted";
      readonly taskName: typeof ALYR_BACKGROUND_SYNC_TASK_NAME;
    }
  | {
      readonly kind: "process-resident";
      readonly taskName: typeof ALYR_BACKGROUND_SYNC_TASK_NAME;
      readonly newlyRegistered: boolean;
    }
  | {
      readonly kind: "foreground-only";
      readonly taskName: typeof ALYR_BACKGROUND_SYNC_TASK_NAME;
      readonly reason: HeadlessForegroundOnlyReason;
      readonly staleRegistrationRemoved: boolean;
    };

/**
 * Registers an opportunistic callback only while WorkspaceProvider has
 * installed an unlocked-vault task in this JavaScript process. A terminated
 * cold launch has no configured task, removes stale native state, and stays
 * foreground-only rather than opening protected keys.
 */
export async function registerExpoBackgroundSync(): Promise<ExpoBackgroundSyncRegistration> {
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
    if (!configuredTask) {
      void unregisterStaleBackgroundSyncIfIdle().catch(
        () => undefined
      );
    }
    return {
      kind: "restricted",
      taskName: ALYR_BACKGROUND_SYNC_TASK_NAME
    };
  }

  const nativeDecision = await enqueueNativeLifecycle(async () => {
    const processTask = configuredTask;
    if (!processTask) {
      return {
        kind: "foreground-only" as const,
        staleRegistrationRemoved:
          await unregisterNativeBackgroundSync()
      };
    }

    const registration = await registerBackgroundSync({
      scheduler: createExpoBackgroundSyncScheduler(),
      task: processTask
    });

    if (!configuredTask) {
      return {
        kind: "foreground-only" as const,
        staleRegistrationRemoved:
          await unregisterNativeBackgroundSync()
      };
    }

    return {
      kind: "process-resident" as const,
      newlyRegistered: registration.newlyRegistered
    };
  });

  if (nativeDecision.kind === "process-resident") {
    return {
      kind: "process-resident",
      taskName: ALYR_BACKGROUND_SYNC_TASK_NAME,
      newlyRegistered: nativeDecision.newlyRegistered
    };
  }

  const disposition =
    await resolveHeadlessRegistrationDisposition();
  return {
    kind: "foreground-only",
    taskName: ALYR_BACKGROUND_SYNC_TASK_NAME,
    reason: disposition.reason,
    staleRegistrationRemoved:
      nativeDecision.staleRegistrationRemoved
  };
}

export interface ExpoBackgroundSyncInstallation {
  readonly registration: Promise<ExpoBackgroundSyncRegistration>;
  /**
   * Removes this process's exact runtime resolver synchronously and schedules
   * best-effort native unregistration. WorkspaceProvider cancels and drains
   * its vault-generation scope around this call.
   */
  readonly dispose: () => void;
}

/**
 * Turnkey integration seam for WorkspaceProvider after auth/vault bootstrap.
 * The disposer is returned synchronously so an account or vault transition can
 * invalidate the resolver even while native registration is still pending.
 */
export function installExpoBackgroundSync(
  task: BackgroundSyncTask
): ExpoBackgroundSyncInstallation {
  configuredTask = task;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (clearConfiguredTask(task)) {
      void unregisterStaleBackgroundSyncIfIdle().catch(
        () => undefined
      );
    }
  };
  const registration = registerExpoBackgroundSync()
    .catch((error) => {
      dispose();
      throw error;
    });
  return { registration, dispose };
}
