import type {
  BackgroundSyncRunResult
} from "./runBackgroundSync";
import type { BackgroundSyncTask } from "./backgroundSyncTask";

export const ALYR_BACKGROUND_SYNC_TASK_NAME =
  "alyr.opportunistic-sync.v1";

export interface BackgroundSyncRegistrationOptions {
  readonly minimumIntervalMinutes: number;
}

export const DEFAULT_BACKGROUND_SYNC_REGISTRATION_OPTIONS: BackgroundSyncRegistrationOptions =
  Object.freeze({
    minimumIntervalMinutes: 6 * 60
  });

/**
 * Pure adapter contract for TaskManager + BackgroundTask. The native adapter
 * owns conversion from BackgroundSyncRunResult to the platform result enum;
 * this module never imports an Expo native package.
 */
export interface BackgroundSyncScheduler {
  readonly isTaskDefined: (taskName: string) => boolean;
  readonly defineTask: (
    taskName: string,
    handler: () => Promise<BackgroundSyncRunResult>
  ) => void;
  readonly isTaskRegistered: (taskName: string) => Promise<boolean>;
  readonly registerTask: (
    taskName: string,
    options: BackgroundSyncRegistrationOptions
  ) => Promise<void>;
}

export interface BackgroundSyncRegistration {
  readonly taskName: typeof ALYR_BACKGROUND_SYNC_TASK_NAME;
  readonly newlyRegistered: boolean;
}

export interface RegisterBackgroundSyncRequest {
  readonly scheduler: BackgroundSyncScheduler;
  readonly task: BackgroundSyncTask;
  readonly options?: BackgroundSyncRegistrationOptions;
}

const registrations = new WeakMap<
  BackgroundSyncScheduler,
  Promise<BackgroundSyncRegistration>
>();

/**
 * Defines and registers the native hook once per scheduler instance. Parallel
 * startup paths share one promise; a failed attempt is removed so the next
 * foreground launch can retry registration.
 */
export function registerBackgroundSync(
  request: RegisterBackgroundSyncRequest
): Promise<BackgroundSyncRegistration> {
  const current = registrations.get(request.scheduler);
  if (current) return current;

  const registration = (async () => {
    if (
      !request.scheduler.isTaskDefined(
        ALYR_BACKGROUND_SYNC_TASK_NAME
      )
    ) {
      request.scheduler.defineTask(
        ALYR_BACKGROUND_SYNC_TASK_NAME,
        () => request.task()
      );
    }

    const alreadyRegistered =
      await request.scheduler.isTaskRegistered(
        ALYR_BACKGROUND_SYNC_TASK_NAME
      );
    if (!alreadyRegistered) {
      await request.scheduler.registerTask(
        ALYR_BACKGROUND_SYNC_TASK_NAME,
        request.options ??
          DEFAULT_BACKGROUND_SYNC_REGISTRATION_OPTIONS
      );
    }
    return {
      taskName: ALYR_BACKGROUND_SYNC_TASK_NAME,
      newlyRegistered: !alreadyRegistered
    } as const;
  })();

  registrations.set(request.scheduler, registration);
  void registration.catch(() => {
    if (registrations.get(request.scheduler) === registration) {
      registrations.delete(request.scheduler);
    }
  });
  return registration;
}
