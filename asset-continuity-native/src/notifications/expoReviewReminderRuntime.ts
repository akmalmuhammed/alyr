import * as Notifications from "expo-notifications";

import {
  ExpoLocalReviewNotificationPort,
  ExpoReviewReminderSecureStore,
  LocalReviewReminderManager,
  type ExpoNotificationsModuleLike
} from "./reviewReminderAdapter";

const LOCAL_NOTIFICATIONS_MODULE: ExpoNotificationsModuleLike = {
  SchedulableTriggerInputTypes:
    Notifications.SchedulableTriggerInputTypes,
  AndroidImportance: Notifications.AndroidImportance,
  AndroidNotificationVisibility:
    Notifications.AndroidNotificationVisibility,
  getPermissionsAsync: Notifications.getPermissionsAsync,
  requestPermissionsAsync: Notifications.requestPermissionsAsync,
  scheduleNotificationAsync: Notifications.scheduleNotificationAsync,
  cancelScheduledNotificationAsync:
    Notifications.cancelScheduledNotificationAsync,
  getAllScheduledNotificationsAsync:
    Notifications.getAllScheduledNotificationsAsync,
  setNotificationHandler: Notifications.setNotificationHandler,
  setNotificationChannelAsync: Notifications.setNotificationChannelAsync
};

export function createExpoLocalReviewNotificationPort(): ExpoLocalReviewNotificationPort {
  return new ExpoLocalReviewNotificationPort(LOCAL_NOTIFICATIONS_MODULE);
}

/**
 * Production composition root for the device-local review reminder.
 *
 * The injected surface deliberately excludes Expo push-token registration and
 * background-notification task APIs.
 */
export function createExpoLocalReviewReminderManager(
  now?: () => Date
): LocalReviewReminderManager {
  const notifications = createExpoLocalReviewNotificationPort();
  const secureStore = new ExpoReviewReminderSecureStore();
  return now
    ? new LocalReviewReminderManager(notifications, secureStore, now)
    : new LocalReviewReminderManager(notifications, secureStore);
}
