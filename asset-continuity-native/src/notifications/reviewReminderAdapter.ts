import * as SecureStore from "expo-secure-store";

import {
  DEFAULT_REVIEW_REMINDER_PREFERENCES,
  REVIEW_REMINDER_NOTIFICATION_ID,
  REVIEW_REMINDER_PAYLOAD,
  normalizeReviewReminderPreferences,
  selectReviewReminder,
  type ReviewReminderCalendarTrigger,
  type ReviewReminderPreferences,
  type ReviewReminderRuntime
} from "@/domain/reviewReminders";
import type { NativeWorkspace } from "@/domain/model";
import {
  assertValidVaultScope,
  vaultScopeFromOpaqueId,
  type VaultScope
} from "@/data/vaultScope";

export type ReviewNotificationPermission =
  | "authorized"
  | "provisional"
  | "ephemeral"
  | "denied"
  | "undetermined";

export interface ScheduledReviewNotificationDescriptor {
  readonly identifier: string;
  /**
   * Present only when the OS request carries ALYR's versioned, generic review
   * ownership marker. This is an opaque deterministic identifier, not user
   * content.
   */
  readonly requestedIdentifier: string | null;
}

export interface LocalReviewNotificationPort {
  getPermission(): Promise<ReviewNotificationPermission>;
  requestPermission(): Promise<ReviewNotificationPermission>;
  /**
   * The operating system must schedule and return this exact deterministic,
   * scoped identifier. Implementations must reject any mismatch immediately
   * so the manager can journal both IDs before beginning cancellation.
   */
  scheduleReview(input: {
    readonly identifier: string;
    readonly date: Date;
  }): Promise<string>;
  cancel(identifier: string): Promise<void>;
  listScheduledNotifications(): Promise<
    readonly ScheduledReviewNotificationDescriptor[]
  >;
}

export class ReviewNotificationIdentifierMismatchError extends Error {
  readonly returnedIdentifier: string;

  constructor(returnedIdentifier: string) {
    super(
      "The operating system did not preserve the scoped review notification identifier."
    );
    this.name = "ReviewNotificationIdentifierMismatchError";
    this.returnedIdentifier = returnedIdentifier;
  }
}

export interface ReviewReminderSecureStorePort {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export class ExpoReviewReminderSecureStore
  implements ReviewReminderSecureStorePort
{
  async getItem(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
    });
  }

  async setItem(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
    });
  }

  async removeItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  }
}

interface ExpoNotificationPermissionsStatusLike {
  readonly granted?: boolean;
  readonly status?: "granted" | "denied" | "undetermined" | string;
  readonly ios?: {
    readonly status?: number;
  } | null;
}

interface ExpoNotificationRequestLike {
  readonly identifier: string;
  readonly content?: {
    readonly data?: unknown;
  };
}

export interface ExpoNotificationsModuleLike {
  readonly SchedulableTriggerInputTypes: {
    readonly DATE: string;
  };
  readonly AndroidImportance?: {
    readonly LOW: number;
  };
  readonly AndroidNotificationVisibility?: {
    readonly PRIVATE: number;
  };
  getPermissionsAsync(): Promise<ExpoNotificationPermissionsStatusLike>;
  requestPermissionsAsync(input: {
    readonly ios: {
      readonly allowAlert: true;
      readonly allowBadge: false;
      readonly allowSound: false;
      readonly allowProvisional: false;
    };
  }): Promise<ExpoNotificationPermissionsStatusLike>;
  scheduleNotificationAsync(input: {
    readonly identifier: string;
    readonly content: {
      readonly title: string;
      readonly body: string;
      readonly data: {
        readonly kind: "review";
        readonly schemaVersion: 1;
        readonly requestedIdentifier: string;
      };
      readonly sound: false;
      readonly interruptionLevel: "passive";
      readonly priority: "low";
    };
    readonly trigger: {
      readonly type: string;
      readonly date: Date;
      readonly channelId: string;
    };
  }): Promise<string>;
  cancelScheduledNotificationAsync(identifier: string): Promise<void>;
  getAllScheduledNotificationsAsync(): Promise<
    readonly ExpoNotificationRequestLike[]
  >;
  setNotificationHandler(handler: {
    readonly handleNotification: () => Promise<{
      readonly shouldPlaySound: false;
      readonly shouldSetBadge: false;
      readonly shouldShowBanner: true;
      readonly shouldShowList: true;
    }>;
  }): void;
  setNotificationChannelAsync?(
    identifier: string,
    input: {
      readonly name: string;
      readonly importance: number;
      readonly sound: null;
      readonly vibrationPattern: number[];
      readonly lockscreenVisibility?: number;
    }
  ): Promise<unknown>;
}

const IOS_AUTHORIZATION_STATUS = Object.freeze({
  notDetermined: 0,
  denied: 1,
  authorized: 2,
  provisional: 3,
  ephemeral: 4
});

const REVIEW_NOTIFICATION_CHANNEL_ID = "alyr-private-reviews";
const REVIEW_NOTIFICATION_IDENTIFIER_PREFIX =
  `${REVIEW_REMINDER_NOTIFICATION_ID}.v1.` as const;
const REVIEW_NOTIFICATION_OWNERSHIP_SCHEMA_VERSION = 1 as const;
const ACTIVE_REMINDER_STORAGE_KEY =
  "alyr.native.review-reminder.active.v1";
export const REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY =
  "alyr.native.review-reminder.cleanup-pending.v1";
export const REVIEW_REMINDER_MISMATCH_ESCROW_STORAGE_KEY =
  "alyr.native.review-reminder.mismatch-escrow.v1";
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const MAX_CLEANUP_IDENTIFIERS = 64;
const MAX_CLEANUP_SCOPES = 32;
const MAX_CLEANUP_ENUMERATION_PASSES = 8;
const MAX_MISMATCH_ESCROW_WRITE_ATTEMPTS = 2;

export function reviewNotificationPermissionFromExpo(
  settings: ExpoNotificationPermissionsStatusLike
): ReviewNotificationPermission {
  const iosStatus = settings.ios?.status;
  if (typeof iosStatus === "number") {
    switch (iosStatus) {
      case IOS_AUTHORIZATION_STATUS.authorized:
        return "authorized";
      case IOS_AUTHORIZATION_STATUS.provisional:
        return "provisional";
      case IOS_AUTHORIZATION_STATUS.ephemeral:
        return "ephemeral";
      case IOS_AUTHORIZATION_STATUS.denied:
        return "denied";
      case IOS_AUTHORIZATION_STATUS.notDetermined:
      default:
        return "undetermined";
    }
  }
  if (settings.granted || settings.status === "granted") {
    return "authorized";
  }
  return settings.status === "denied" ? "denied" : "undetermined";
}

export function permissionAllowsReviewReminders(
  permission: ReviewNotificationPermission
): permission is Exclude<
  ReviewNotificationPermission,
  "denied" | "undetermined"
> {
  return (
    permission === "authorized" ||
    permission === "provisional" ||
    permission === "ephemeral"
  );
}

/**
 * Narrow adapter over Expo Notifications. It has no push-token, remote-message,
 * or background-task methods, so the Recovery reminder remains device-local.
 */
export class ExpoLocalReviewNotificationPort
  implements LocalReviewNotificationPort
{
  private presentationConfigured = false;
  private channelConfigured = false;

  constructor(
    private readonly notifications: ExpoNotificationsModuleLike
  ) {
    this.configureForegroundPresentation();
  }

  async getPermission(): Promise<ReviewNotificationPermission> {
    return reviewNotificationPermissionFromExpo(
      await this.notifications.getPermissionsAsync()
    );
  }

  async requestPermission(): Promise<ReviewNotificationPermission> {
    return reviewNotificationPermissionFromExpo(
      await this.notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: false,
          allowSound: false,
          allowProvisional: false
        }
      })
    );
  }

  async scheduleReview(input: {
    readonly identifier: string;
    readonly date: Date;
  }): Promise<string> {
    if (
      !isScopedReviewNotificationIdentifier(input.identifier) ||
      !Number.isFinite(input.date.getTime())
    ) {
      throw new Error("The local review notification request is invalid.");
    }
    await this.configureQuietPresentation();
    const nativeIdentifier =
      await this.notifications.scheduleNotificationAsync({
        identifier: input.identifier,
        content: {
          title: REVIEW_REMINDER_PAYLOAD.title,
          body: REVIEW_REMINDER_PAYLOAD.body,
          data: {
            kind: REVIEW_REMINDER_PAYLOAD.data.kind,
            schemaVersion: REVIEW_NOTIFICATION_OWNERSHIP_SCHEMA_VERSION,
            requestedIdentifier: input.identifier
          },
          sound: false,
          interruptionLevel: "passive",
          priority: "low"
        },
        trigger: {
          type: this.notifications.SchedulableTriggerInputTypes.DATE,
          date: input.date,
          channelId: REVIEW_NOTIFICATION_CHANNEL_ID
        }
      });
    if (nativeIdentifier !== input.identifier) {
      throw new ReviewNotificationIdentifierMismatchError(
        nativeIdentifier
      );
    }
    return input.identifier;
  }

  async cancel(identifier: string): Promise<void> {
    if (!isValidNativeNotificationIdentifier(identifier)) {
      throw new Error("The local review notification identifier is invalid.");
    }
    await this.notifications.cancelScheduledNotificationAsync(identifier);
  }

  async listScheduledNotifications(): Promise<
    readonly ScheduledReviewNotificationDescriptor[]
  > {
    const scheduled =
      await this.notifications.getAllScheduledNotificationsAsync();
    return scheduled
      .filter((request) =>
        isValidNativeNotificationIdentifier(request.identifier)
      )
      .map((request) => ({
        identifier: request.identifier,
        requestedIdentifier:
          requestedReviewIdentifierFromOwnershipMarker(
            request.content?.data
          )
      }));
  }

  private async configureQuietPresentation(): Promise<void> {
    this.configureForegroundPresentation();
    if (
      !this.channelConfigured &&
      this.notifications.setNotificationChannelAsync &&
      this.notifications.AndroidImportance
    ) {
      await this.notifications.setNotificationChannelAsync(
        REVIEW_NOTIFICATION_CHANNEL_ID,
        {
          name: "Private reviews",
          importance: this.notifications.AndroidImportance.LOW,
          sound: null,
          vibrationPattern: [],
          ...(this.notifications.AndroidNotificationVisibility
            ? {
                lockscreenVisibility:
                  this.notifications.AndroidNotificationVisibility.PRIVATE
              }
            : {})
        }
      );
      this.channelConfigured = true;
    }
  }

  private configureForegroundPresentation(): void {
    if (!this.presentationConfigured) {
      this.notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true
        })
      });
      this.presentationConfigured = true;
    }
  }
}

interface StoredReviewReminderSchedule {
  readonly version: 1;
  readonly scopeId: string;
  readonly requestedIdentifier: string;
  readonly nativeIdentifier: string;
  readonly scheduledAt: string;
  readonly planSignature: string;
}

interface StoredActiveReviewReminder {
  readonly version: 1;
  readonly scopeId: string;
  readonly requestedIdentifier: string;
  readonly nativeIdentifier: string;
}

interface StoredReviewReminderCleanup {
  readonly version: 1;
  /**
   * `all` is used for sign-out/sample cleanup where the previous scope may no
   * longer be available. Both forms remain limited to ALYR-owned identifiers.
   */
  readonly mode: "scope" | "all";
  readonly scopeIds: readonly string[];
  readonly identifiers: readonly string[];
  /**
   * A bounded journal cannot retain every explicit target after an overflow.
   * `all` plus this flag forces an exhaustive OS enumeration checkpoint before
   * the journal may be removed.
   */
  readonly overflow?: boolean;
}

interface StoredReviewReminderMismatchEscrow {
  readonly version: 1;
  readonly scopeId: string;
  readonly requestedIdentifier: string;
  readonly returnedIdentifier: string;
}

/**
 * SecureStore has no compare-and-swap primitive. This module-level queue makes
 * marker read/merge/write and compare/remove atomic across every manager
 * instance in the JavaScript process.
 */
class CleanupJournalCoordinator {
  private queue: Promise<unknown> = Promise.resolve();

  runExclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.catch(() => undefined);
    return run;
  }
}

const CLEANUP_JOURNAL_COORDINATOR = new CleanupJournalCoordinator();
const REVIEW_SCHEDULE_COORDINATOR = new CleanupJournalCoordinator();

export type ReviewReminderCancellationResult =
  | {
      readonly kind: "cancelled";
      readonly cleanupPending: false;
    }
  | {
      readonly kind: "cleanup-pending";
      readonly cleanupPending: true;
    };

export type ReviewReminderReconcileResult =
  | {
      readonly kind:
        | "inactive"
        | "disabled"
        | "no-review"
        | "cleanup-pending";
      readonly permission: null;
      readonly notificationIdentifier: null;
      readonly scheduledAt: null;
    }
  | {
      readonly kind: "permission-blocked";
      readonly permission: "denied" | "undetermined";
      readonly notificationIdentifier: null;
      readonly scheduledAt: null;
    }
  | {
      readonly kind: "scheduled" | "unchanged";
      readonly permission: Exclude<
        ReviewNotificationPermission,
        "denied" | "undetermined"
      >;
      readonly notificationIdentifier: string;
      readonly scheduledAt: string;
    };

export interface ReviewReminderContext {
  readonly scope: VaultScope | null;
  readonly workspace: NativeWorkspace | null;
  readonly runtime: ReviewReminderRuntime;
}

export interface ReviewReminderOptInInput extends ReviewReminderContext {
  readonly localHour: number;
  readonly localMinute: number;
}

export function reviewReminderStorageKeys(scope: VaultScope): {
  readonly preferences: string;
  readonly schedule: string;
} {
  const checked = assertAuthenticatedScope(scope);
  return {
    preferences:
      `alyr.native.review-reminder.${checked.scopeId}.preferences.v1`,
    schedule: `alyr.native.review-reminder.${checked.scopeId}.schedule.v1`
  };
}

export function scopedReviewNotificationIdentifier(
  scope: VaultScope
): string {
  return `${REVIEW_NOTIFICATION_IDENTIFIER_PREFIX}${
    assertAuthenticatedScope(scope).scopeId
  }`;
}

export function reviewReminderTriggerDate(
  trigger: ReviewReminderCalendarTrigger,
  now: Date
): Date {
  if (!Number.isFinite(now.getTime())) {
    throw new Error("A valid local clock is required for review reminders.");
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(trigger.date);
  if (!match) {
    throw new Error("The review reminder calendar date is invalid.");
  }
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const requested = new Date(
    year,
    monthIndex,
    day,
    trigger.hour,
    trigger.minute,
    0,
    0
  );
  if (
    requested.getFullYear() !== year ||
    requested.getMonth() !== monthIndex ||
    requested.getDate() !== day
  ) {
    throw new Error("The review reminder calendar date is invalid.");
  }
  if (requested.getTime() > now.getTime()) {
    return requested;
  }

  const next = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    trigger.hour,
    trigger.minute,
    0,
    0
  );
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

/**
 * Owns one scope-bound local notification. Reconciliation never asks for
 * permission; only `optIn` may present the operating-system permission sheet.
 */
export class LocalReviewReminderManager {
  private queue: Promise<unknown> = Promise.resolve();
  private readonly knownIdentifiersByScope = new Map<
    string,
    Set<string>
  >();

  constructor(
    private readonly notifications: LocalReviewNotificationPort,
    private readonly secureStore: ReviewReminderSecureStorePort,
    private readonly now: () => Date = () => new Date()
  ) {}

  getPreferences(scope: VaultScope): Promise<ReviewReminderPreferences> {
    return this.runExclusive(() => this.loadPreferences(scope));
  }

  optIn(
    input: ReviewReminderOptInInput
  ): Promise<ReviewReminderReconcileResult> {
    return this.runExclusive(async () => {
      if (!isActiveReminderContext(input)) {
        const cleanup = await this.cancelAllActive();
        return cleanup.cleanupPending
          ? cleanupPendingResult()
          : inactiveResult();
      }
      const scope = assertAuthenticatedScope(input.scope);
      const previousCleanup = await this.retryPendingCleanupInternal();
      if (previousCleanup.cleanupPending) {
        return cleanupPendingResult();
      }
      const requestedPreferences = normalizeReviewReminderPreferences({
        version: 1,
        enabled: true,
        localHour: input.localHour,
        localMinute: input.localMinute
      });
      if (!requestedPreferences.enabled) {
        throw new Error("The requested review reminder time is invalid.");
      }

      let permission = await this.notifications.getPermission();
      if (permission === "undetermined") {
        permission = await this.notifications.requestPermission();
      }
      if (!permissionAllowsReviewReminders(permission)) {
        await this.writePreferences(scope, {
          ...requestedPreferences,
          enabled: false
        });
        const cleanup = await this.cancelScope(scope);
        return cleanup.cleanupPending
          ? cleanupPendingResult()
          : permissionBlockedResult(permission);
      }

      await this.writePreferences(scope, requestedPreferences);
      return this.reconcileActive(input, scope, requestedPreferences, permission);
    });
  }

  optOut(
    scope: VaultScope | null
  ): Promise<ReviewReminderCancellationResult> {
    return this.runExclusive(async () => {
      if (!scope || assertValidVaultScope(scope).kind !== "authenticated") {
        return this.cancelAllActive();
      }
      const checked = assertAuthenticatedScope(scope);
      // The deterministic identifier is attempted before any preference or
      // schedule read. A SecureStore outage therefore cannot delay the first
      // operating-system cancellation attempt.
      await this.attemptCancellationIdentifiers(
        this.deterministicIdentifiersForScope(checked)
      );
      const currentRead = await Promise.allSettled([
        this.loadPreferences(checked)
      ]);
      const current =
        currentRead[0]?.status === "fulfilled"
          ? currentRead[0].value
          : DEFAULT_REVIEW_REMINDER_PREFERENCES;
      const preferenceWrite = await Promise.allSettled([
        Promise.resolve().then(() =>
          this.writePreferences(checked, {
            ...current,
            enabled: false
          })
        )
      ]);
      const cleanup = await this.cancelScope(checked);
      const preferenceFailure = preferenceWrite.find(
        (result) => result.status === "rejected"
      );
      if (preferenceFailure?.status === "rejected") {
        throw preferenceFailure.reason;
      }
      return cleanup;
    });
  }

  reconcile(
    input: ReviewReminderContext
  ): Promise<ReviewReminderReconcileResult> {
    return this.runExclusive(async () => {
      const previousCleanup = await this.retryPendingCleanupInternal();
      if (previousCleanup.cleanupPending) {
        return cleanupPendingResult();
      }
      if (!isActiveReminderContext(input)) {
        const cleanup = await this.cancelAllActive();
        return cleanup.cleanupPending
          ? cleanupPendingResult()
          : inactiveResult();
      }
      const scope = assertAuthenticatedScope(input.scope);
      const scopeCleanup =
        await this.cancelActiveScopeIfDifferent(scope);
      if (scopeCleanup.cleanupPending) {
        return cleanupPendingResult();
      }
      const preferences = await this.loadPreferences(scope);
      if (!preferences.enabled) {
        const cleanup = await this.cancelScope(scope);
        return cleanup.cleanupPending
          ? cleanupPendingResult()
          : disabledResult();
      }
      const permission = await this.notifications.getPermission();
      if (!permissionAllowsReviewReminders(permission)) {
        const cleanup = await this.cancelScope(scope);
        return cleanup.cleanupPending
          ? cleanupPendingResult()
          : permissionBlockedResult(permission);
      }
      return this.reconcileActive(input, scope, preferences, permission);
    });
  }

  cancel(
    scope: VaultScope | null = null
  ): Promise<ReviewReminderCancellationResult> {
    return this.runExclusive(() =>
      scope && assertValidVaultScope(scope).kind === "authenticated"
        ? this.cancelScope(assertAuthenticatedScope(scope))
        : this.cancelAllActive()
    );
  }

  retryPendingCleanup(): Promise<ReviewReminderCancellationResult> {
    return this.runExclusive(() => this.retryPendingCleanupInternal());
  }

  private async reconcileActive(
    input: ReviewReminderContext,
    scope: VaultScope,
    preferences: ReviewReminderPreferences,
    permission: Exclude<
      ReviewNotificationPermission,
      "denied" | "undetermined"
    >
  ): Promise<ReviewReminderReconcileResult> {
    const workspace = input.workspace;
    if (!workspace) {
      const cleanup = await this.cancelAllActive();
      return cleanup.cleanupPending
        ? cleanupPendingResult()
        : inactiveResult();
    }
    const selection = selectReviewReminder({
      workspace,
      runtime: input.runtime,
      preferences
    });
    if (!selection) {
      const cleanup = await this.cancelScope(scope);
      return cleanup.cleanupPending
        ? cleanupPendingResult()
        : noReviewResult();
    }

    const scheduledDate = reviewReminderTriggerDate(
      selection.calendarTrigger,
      this.now()
    );
    const scheduledAt = scheduledDate.toISOString();
    const requestedIdentifier = scopedReviewNotificationIdentifier(scope);
    const planSignature = [
      selection.reviewDate,
      selection.calendarTrigger.hour,
      selection.calendarTrigger.minute,
      scheduledAt
    ].join("|");
    const stored = await this.loadSchedule(scope);
    if (
      stored &&
      stored.requestedIdentifier === requestedIdentifier &&
      stored.planSignature === planSignature
    ) {
      const scheduledNotifications =
        await this.notifications.listScheduledNotifications();
      if (
        scheduledNotifications.some(
          (notification) =>
            notification.identifier === stored.nativeIdentifier &&
            notification.requestedIdentifier ===
              stored.requestedIdentifier
        )
      ) {
        this.rememberIdentifiers(scope.scopeId, [
          stored.requestedIdentifier,
          stored.nativeIdentifier
        ]);
        await this.writeActive({
          version: 1,
          scopeId: scope.scopeId,
          requestedIdentifier,
          nativeIdentifier: stored.nativeIdentifier
        });
        return {
          kind: "unchanged",
          permission,
          notificationIdentifier: stored.nativeIdentifier,
          scheduledAt
        };
      }
    }

    const replacementCleanup = await this.cancelScope(scope);
    if (replacementCleanup.cleanupPending) {
      return cleanupPendingResult();
    }
    return REVIEW_SCHEDULE_COORDINATOR.runExclusive(async () => {
      // A mismatch escrow is single-flight across manager instances. A second
      // schedule cannot begin until any previously proven-owned native ID has
      // either been confirmed absent or remains visibly cleanup-pending.
      const preflightCleanup =
        await this.retryPendingCleanupInternal();
      if (preflightCleanup.cleanupPending) {
        return cleanupPendingResult();
      }

      let nativeIdentifier: string;
      try {
        nativeIdentifier = await this.notifications.scheduleReview({
          identifier: requestedIdentifier,
          date: scheduledDate
        });
      } catch (error) {
        if (
          error instanceof ReviewNotificationIdentifierMismatchError
        ) {
          return this.rejectMismatchedScheduledIdentifier(
            scope,
            preferences,
            requestedIdentifier,
            error.returnedIdentifier
          );
        }
        throw error;
      }
      if (nativeIdentifier !== requestedIdentifier) {
        return this.rejectMismatchedScheduledIdentifier(
          scope,
          preferences,
          requestedIdentifier,
          nativeIdentifier
        );
      }
      this.rememberIdentifiers(scope.scopeId, [
        requestedIdentifier,
        nativeIdentifier
      ]);
      const record: StoredReviewReminderSchedule = {
        version: 1,
        scopeId: scope.scopeId,
        requestedIdentifier,
        nativeIdentifier,
        scheduledAt,
        planSignature
      };
      try {
        await this.writeSchedule(scope, record);
        await this.writeActive({
          version: 1,
          scopeId: scope.scopeId,
          requestedIdentifier,
          nativeIdentifier
        });
      } catch (error) {
        const cleanup = await this.cancelScope(scope);
        if (cleanup.cleanupPending) {
          return cleanupPendingResult();
        }
        throw error;
      }
      return {
        kind: "scheduled",
        permission,
        notificationIdentifier: nativeIdentifier,
        scheduledAt
      };
    });
  }

  private async rejectMismatchedScheduledIdentifier(
    scope: VaultScope,
    preferences: ReviewReminderPreferences,
    requestedIdentifier: string,
    returnedIdentifier: string
  ): Promise<ReviewReminderReconcileResult> {
    const escrow: StoredReviewReminderMismatchEscrow = {
      version: 1,
      scopeId: scope.scopeId,
      requestedIdentifier,
      returnedIdentifier
    };
    if (!isStoredMismatchEscrow(escrow)) {
      throw new Error(
        "The operating system returned an invalid review notification identifier."
      );
    }
    // The exact provider-returned ID is escrowed outside the bounded cleanup
    // marker and read back before any cancellation begins. A saturated marker
    // can therefore never evict this proven-owned, non-prefixed identifier.
    let escrowPersisted = false;
    try {
      await this.persistMismatchEscrow(escrow);
      escrowPersisted = true;
      this.rememberIdentifiers(scope.scopeId, [
        requestedIdentifier,
        returnedIdentifier
      ]);
    } catch {
      // The OS request itself carries the same versioned, opaque ownership
      // marker. It remains independently discoverable after a cold restart
      // when SecureStore is temporarily unavailable.
    }
    const preferenceWrite = await Promise.allSettled([
      this.writePreferences(scope, {
        ...preferences,
        enabled: false
      })
    ]);
    const cleanup = escrowPersisted
      ? await this.drainMismatchEscrow()
      : await this.drainOwnedMismatchNotifications();
    const preferenceFailure = preferenceWrite.find(
      (result) => result.status === "rejected"
    );
    if (preferenceFailure?.status === "rejected") {
      throw preferenceFailure.reason;
    }
    if (cleanup.cleanupPending) {
      return cleanupPendingResult();
    }
    throw new Error(
      "The operating system did not preserve the scoped review notification identifier."
    );
  }

  private async loadPreferences(
    scope: VaultScope
  ): Promise<ReviewReminderPreferences> {
    if (assertValidVaultScope(scope).kind !== "authenticated") {
      return DEFAULT_REVIEW_REMINDER_PREFERENCES;
    }
    const value = await this.readJson(
      reviewReminderStorageKeys(scope).preferences
    );
    return normalizeReviewReminderPreferences(value);
  }

  private writePreferences(
    scope: VaultScope,
    preferences: ReviewReminderPreferences
  ): Promise<void> {
    return this.secureStore.setItem(
      reviewReminderStorageKeys(scope).preferences,
      JSON.stringify(preferences)
    );
  }

  private async loadSchedule(
    scope: VaultScope
  ): Promise<StoredReviewReminderSchedule | null> {
    const value = await this.readJson(reviewReminderStorageKeys(scope).schedule);
    return isStoredSchedule(value, scope.scopeId) ? value : null;
  }

  private writeSchedule(
    scope: VaultScope,
    schedule: StoredReviewReminderSchedule
  ): Promise<void> {
    return this.secureStore.setItem(
      reviewReminderStorageKeys(scope).schedule,
      JSON.stringify(schedule)
    );
  }

  private async loadActive(): Promise<StoredActiveReviewReminder | null> {
    const value = await this.readJson(ACTIVE_REMINDER_STORAGE_KEY);
    return isStoredActive(value) ? value : null;
  }

  private writeActive(active: StoredActiveReviewReminder): Promise<void> {
    return this.secureStore.setItem(
      ACTIVE_REMINDER_STORAGE_KEY,
      JSON.stringify(active)
    );
  }

  private async persistMismatchEscrow(
    escrow: StoredReviewReminderMismatchEscrow
  ): Promise<void> {
    let lastError: unknown = new Error(
      "The review notification mismatch escrow could not be persisted."
    );
    for (
      let attempt = 0;
      attempt < MAX_MISMATCH_ESCROW_WRITE_ATTEMPTS;
      attempt += 1
    ) {
      try {
        await CLEANUP_JOURNAL_COORDINATOR.runExclusive(async () => {
          const stored = await this.secureStore.getItem(
            REVIEW_REMINDER_MISMATCH_ESCROW_STORAGE_KEY
          );
          const current = mismatchEscrowFromStoredValue(stored);
          if (current && !mismatchEscrowsEqual(current, escrow)) {
            throw new Error(
              "A different review notification mismatch is still pending cleanup."
            );
          }
          await this.secureStore.setItem(
            REVIEW_REMINDER_MISMATCH_ESCROW_STORAGE_KEY,
            JSON.stringify(escrow)
          );
          const verified = mismatchEscrowFromStoredValue(
            await this.secureStore.getItem(
              REVIEW_REMINDER_MISMATCH_ESCROW_STORAGE_KEY
            )
          );
          if (!verified || !mismatchEscrowsEqual(verified, escrow)) {
            throw new Error(
              "The review notification mismatch escrow could not be verified."
            );
          }
        });
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  private async loadMismatchEscrow(): Promise<
    StoredReviewReminderMismatchEscrow | null
  > {
    return CLEANUP_JOURNAL_COORDINATOR.runExclusive(async () =>
      mismatchEscrowFromStoredValue(
        await this.secureStore.getItem(
          REVIEW_REMINDER_MISMATCH_ESCROW_STORAGE_KEY
        )
      )
    );
  }

  private async removeMismatchEscrowIfCurrent(
    expected: StoredReviewReminderMismatchEscrow
  ): Promise<boolean> {
    return CLEANUP_JOURNAL_COORDINATOR.runExclusive(async () => {
      try {
        const current = mismatchEscrowFromStoredValue(
          await this.secureStore.getItem(
            REVIEW_REMINDER_MISMATCH_ESCROW_STORAGE_KEY
          )
        );
        if (!current) return true;
        if (!mismatchEscrowsEqual(current, expected)) return false;
        await this.secureStore.removeItem(
          REVIEW_REMINDER_MISMATCH_ESCROW_STORAGE_KEY
        );
        return true;
      } catch {
        return false;
      }
    });
  }

  private async drainMismatchEscrow(): Promise<ReviewReminderCancellationResult> {
    const ownedMismatchCleanup =
      await this.drainOwnedMismatchNotifications();

    let escrow: StoredReviewReminderMismatchEscrow | null;
    try {
      escrow = await this.loadMismatchEscrow();
    } catch {
      // A malformed or unreadable escrow never authorizes cancellation of an
      // arbitrary non-prefixed identifier.
      return cleanupPendingCancellationResult();
    }
    if (!escrow) return ownedMismatchCleanup;

    const cleanup = await this.executeCleanup(
      {
        version: 1,
        mode: "scope",
        scopeIds: [],
        identifiers: [],
        overflow: false
      },
      {
        scopeIds: new Set([escrow.scopeId]),
        identifiers: new Set([
          escrow.requestedIdentifier,
          escrow.returnedIdentifier
        ])
      }
    );
    if (
      ownedMismatchCleanup.cleanupPending ||
      cleanup.cleanupPending
    ) {
      return cleanupPendingCancellationResult();
    }

    return (await this.removeMismatchEscrowIfCurrent(escrow))
      ? cancelledResult()
      : cleanupPendingCancellationResult();
  }

  private async drainOwnedMismatchNotifications(): Promise<ReviewReminderCancellationResult> {
    for (
      let pass = 0;
      pass <= MAX_CLEANUP_ENUMERATION_PASSES;
      pass += 1
    ) {
      let scheduled: readonly ScheduledReviewNotificationDescriptor[];
      try {
        scheduled =
          await this.notifications.listScheduledNotifications();
      } catch {
        return cleanupPendingCancellationResult();
      }
      const mismatches = scheduled.filter(
        (notification) =>
          notification.requestedIdentifier !== null &&
          notification.identifier !==
            notification.requestedIdentifier
      );
      if (mismatches.length === 0) return cancelledResult();
      if (pass === MAX_CLEANUP_ENUMERATION_PASSES) {
        return cleanupPendingCancellationResult();
      }
      const cancelled =
        await this.attemptCancellationIdentifiers(
          new Set(
            mismatches.map(
              (notification) => notification.identifier
            )
          )
        );
      if (!cancelled) return cleanupPendingCancellationResult();
    }
    return cleanupPendingCancellationResult();
  }

  private async cancelScope(
    scope: VaultScope
  ): Promise<ReviewReminderCancellationResult> {
    const escrowCleanup = await this.drainMismatchEscrow();

    const checked = assertAuthenticatedScope(scope);
    const initial: StoredReviewReminderCleanup = {
      version: 1,
      mode: "scope",
      scopeIds: [checked.scopeId],
      identifiers: [
        ...this.deterministicIdentifiersForScope(checked)
      ],
      overflow: false
    };
    await this.attemptCancellationIdentifiers(
      new Set(initial.identifiers)
    );
    const cleanup = await this.executeCleanup(initial);
    return escrowCleanup.cleanupPending || cleanup.cleanupPending
      ? cleanupPendingCancellationResult()
      : cancelledResult();
  }

  private async cancelActiveScopeIfDifferent(
    scope: VaultScope
  ): Promise<ReviewReminderCancellationResult> {
    const activeRead = await Promise.allSettled([this.loadActive()]);
    const activeResult = activeRead[0];
    if (!activeResult || activeResult.status === "rejected") {
      return this.cancelAllActive();
    }
    const active = activeResult.value;
    if (!active || active.scopeId === scope.scopeId) {
      return cancelledResult();
    }
    try {
      const previousScope = vaultScopeFromOpaqueId(active.scopeId);
      if (previousScope.kind === "authenticated") {
        return this.cancelScope(previousScope);
      }
    } catch {
      // A global, prefix-bounded cleanup handles a corrupt active pointer.
    }
    return this.cancelAllActive();
  }

  private async cancelAllActive(): Promise<ReviewReminderCancellationResult> {
    const escrowCleanup = await this.drainMismatchEscrow();

    const scopeIds = [...this.knownIdentifiersByScope.keys()];
    const identifiers = [
      ...this.knownIdentifiersByScope.values()
    ].flatMap((known) => [...known]);
    const initial: StoredReviewReminderCleanup = {
      version: 1,
      mode: "all",
      scopeIds,
      identifiers,
      overflow: false
    };
    await this.attemptCancellationIdentifiers(
      new Set(initial.identifiers)
    );
    const cleanup = await this.executeCleanup(initial);
    return escrowCleanup.cleanupPending || cleanup.cleanupPending
      ? cleanupPendingCancellationResult()
      : cancelledResult();
  }

  private async retryPendingCleanupInternal(): Promise<ReviewReminderCancellationResult> {
    const escrowCleanup = await this.drainMismatchEscrow();

    let stored: string | null;
    try {
      stored = await this.secureStore.getItem(
        REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
      );
    } catch {
      return cleanupPendingCancellationResult();
    }
    if (stored === null) {
      return escrowCleanup.cleanupPending
        ? cleanupPendingCancellationResult()
        : cancelledResult();
    }

    const marker = cleanupMarkerFromStoredValue(stored);
    const cleanup = await this.executeCleanup(
      marker ?? this.allKnownCleanupMarker()
    );
    return escrowCleanup.cleanupPending || cleanup.cleanupPending
      ? cleanupPendingCancellationResult()
      : cancelledResult();
  }

  /**
   * A cleanup marker is written before fallible discovery. Deterministic and
   * in-memory identifiers are then cancelled before any schedule/active read
   * or OS enumeration. Every external operation is isolated so one failure
   * never prevents the remaining cancellation attempts.
   */
  private async executeCleanup(
    initial: StoredReviewReminderCleanup,
    durableTargets: {
      readonly scopeIds: ReadonlySet<string>;
      readonly identifiers: ReadonlySet<string>;
    } = {
      scopeIds: new Set<string>(),
      identifiers: new Set<string>()
    }
  ): Promise<ReviewReminderCancellationResult> {
    const scopeIds = new Set(
      [
        ...initial.scopeIds,
        ...durableTargets.scopeIds
      ].filter(isAuthenticatedScopeId)
    );
    const identifiers = new Set(
      [
        ...scopeIds
      ].map(
        (scopeId) =>
          `${REVIEW_NOTIFICATION_IDENTIFIER_PREFIX}${scopeId}`
      )
    );
    for (const identifier of initial.identifiers) {
      if (isValidNativeNotificationIdentifier(identifier)) {
        identifiers.add(identifier);
      }
    }
    for (const identifier of durableTargets.identifiers) {
      if (isValidNativeNotificationIdentifier(identifier)) {
        identifiers.add(identifier);
      }
    }
    let overflowObserved = cleanupMarkerInputOverflows(initial);

    const markerWrite = await Promise.allSettled([
      this.writeCleanupMarker(initial)
    ]);
    const markerResult = markerWrite[0];
    if (!markerResult || markerResult.status === "rejected") {
      return cleanupPendingCancellationResult();
    }
    const marker = markerResult.value;
    for (const scopeId of marker.scopeIds) {
      scopeIds.add(scopeId);
    }
    for (const identifier of marker.identifiers) {
      identifiers.add(identifier);
    }
    overflowObserved ||= Boolean(marker.overflow);

    await this.attemptCancellationIdentifiers(identifiers);

    const [activeResult, listedResult] = await Promise.allSettled([
      this.loadActive(),
      Promise.resolve().then(() =>
        this.notifications.listScheduledNotifications()
      )
    ]);
    const active =
      activeResult.status === "fulfilled"
        ? activeResult.value
        : null;
    const listed =
      listedResult.status === "fulfilled"
        ? listedResult.value
        : [];

    if (
      active &&
      (marker.mode === "all" || scopeIds.has(active.scopeId))
    ) {
      scopeIds.add(active.scopeId);
      identifiers.add(active.requestedIdentifier);
      identifiers.add(active.nativeIdentifier);
    }
    for (const notification of listed) {
      const identifier = notification.identifier;
      const listedScopeId =
        scopeIdFromReviewNotificationIdentifier(identifier);
      const ownerIdentifier = notification.requestedIdentifier;
      const ownerScopeId =
        scopeIdFromReviewNotificationIdentifier(
          ownerIdentifier
        );
      if (
        identifiers.has(identifier) ||
        (listedScopeId &&
          (marker.mode === "all" || scopeIds.has(listedScopeId))) ||
        (ownerScopeId &&
          (marker.mode === "all" || scopeIds.has(ownerScopeId)))
      ) {
        if (listedScopeId) {
          scopeIds.add(listedScopeId);
        }
        if (ownerScopeId && ownerIdentifier) {
          scopeIds.add(ownerScopeId);
          identifiers.add(ownerIdentifier);
        }
        identifiers.add(identifier);
      }
    }
    for (const scopeId of scopeIds) {
      for (const identifier of
        this.knownIdentifiersByScope.get(scopeId) ?? []) {
        identifiers.add(identifier);
      }
    }

    const scheduleReads = await Promise.allSettled(
      [...scopeIds].map(async (scopeId) => {
        const scope = vaultScopeFromOpaqueId(scopeId);
        return {
          scope,
          schedule: await this.loadSchedule(scope)
        };
      })
    );
    for (const result of scheduleReads) {
      if (result.status !== "fulfilled" || !result.value.schedule) {
        continue;
      }
      identifiers.add(result.value.schedule.requestedIdentifier);
      identifiers.add(result.value.schedule.nativeIdentifier);
    }

    const enriched: StoredReviewReminderCleanup = {
      version: 1,
      mode: marker.mode,
      scopeIds: [...scopeIds].filter(
        (scopeId) =>
          !durableTargets.scopeIds.has(scopeId) ||
          marker.scopeIds.includes(scopeId)
      ),
      identifiers: [...identifiers].filter(
        (identifier) =>
          !durableTargets.identifiers.has(identifier) ||
          marker.identifiers.includes(identifier)
      ),
      overflow: Boolean(marker.overflow) || overflowObserved
    };
    overflowObserved ||= cleanupMarkerInputOverflows(enriched);
    const enrichedWrite = await Promise.allSettled([
      this.writeCleanupMarker(enriched)
    ]);
    const enrichedResult = enrichedWrite[0];
    if (!enrichedResult || enrichedResult.status === "rejected") {
      return cleanupPendingCancellationResult();
    }
    const persisted = enrichedResult.value;
    for (const scopeId of persisted.scopeIds) {
      scopeIds.add(scopeId);
    }
    for (const identifier of persisted.identifiers) {
      identifiers.add(identifier);
    }
    const finallyCancelled =
      await this.attemptCancellationIdentifiers(
        identifiers
      );
    const writeChangedTargets =
      !cleanupMarkersEqual(
        normalizeCleanupMarker(enriched),
        persisted
      );
    const scheduledDrainComplete =
      await this.drainScheduledReviewIdentifiers(
        persisted.mode,
        scopeIds,
        identifiers
      );
    const finalMarkerInput: StoredReviewReminderCleanup = {
      version: 1,
      mode: persisted.mode,
      scopeIds: [...scopeIds].filter(
        (scopeId) =>
          !durableTargets.scopeIds.has(scopeId) ||
          persisted.scopeIds.includes(scopeId)
      ),
      identifiers: [...identifiers].filter(
        (identifier) =>
          !durableTargets.identifiers.has(identifier) ||
          persisted.identifiers.includes(identifier)
      ),
      overflow:
        Boolean(persisted.overflow) || overflowObserved
    };
    overflowObserved ||=
      cleanupMarkerInputOverflows(finalMarkerInput);
    const finalMarkerWrite = await Promise.allSettled([
      this.writeCleanupMarker(finalMarkerInput)
    ]);
    const finalMarkerResult = finalMarkerWrite[0];
    if (
      !finalMarkerResult ||
      finalMarkerResult.status === "rejected"
    ) {
      return cleanupPendingCancellationResult();
    }
    const finalPersisted = finalMarkerResult.value;
    const finalWriteChangedTargets =
      !cleanupMarkersEqual(
        normalizeCleanupMarker(finalMarkerInput),
        finalPersisted
      );
    const discoveryComplete =
      activeResult.status === "fulfilled" &&
      listedResult.status === "fulfilled" &&
      scheduleReads.every((result) => result.status === "fulfilled") &&
      scheduledDrainComplete;

    if (
      !finallyCancelled ||
      !discoveryComplete ||
      writeChangedTargets ||
      finalWriteChangedTargets
    ) {
      await Promise.allSettled([
        this.writeCleanupMarker(finalPersisted)
      ]);
      return cleanupPendingCancellationResult();
    }

    const scheduleRemoval = await Promise.allSettled(
      [...scopeIds].map((scopeId) =>
        Promise.resolve().then(() =>
          this.secureStore.removeItem(
            reviewReminderStorageKeys(
              vaultScopeFromOpaqueId(scopeId)
            ).schedule
          )
        )
      )
    );
    const removeActive =
      finalPersisted.mode === "all" ||
      Boolean(active && scopeIds.has(active.scopeId));
    const activeRemoval = removeActive
      ? await Promise.allSettled([
          Promise.resolve().then(() =>
            this.secureStore.removeItem(
              ACTIVE_REMINDER_STORAGE_KEY
            )
          )
        ])
      : [];
    if (
      scheduleRemoval.some((result) => result.status === "rejected") ||
      activeRemoval.some((result) => result.status === "rejected")
    ) {
      await Promise.allSettled([
        this.writeCleanupMarker(finalPersisted)
      ]);
      return cleanupPendingCancellationResult();
    }

    if (finalPersisted.overflow || overflowObserved) {
      await this.resolveCleanupOverflowIfCurrent(finalPersisted);
      return cleanupPendingCancellationResult();
    }

    const markerRemoved =
      await this.removeCleanupMarkerIfCurrent(finalPersisted);
    if (!markerRemoved) {
      return cleanupPendingCancellationResult();
    }
    for (const scopeId of scopeIds) {
      this.knownIdentifiersByScope.delete(scopeId);
    }
    return cancelledResult();
  }

  private async attemptCancellationIdentifiers(
    identifiers: ReadonlySet<string>
  ): Promise<boolean> {
    const validIdentifiers = [
      ...new Set(
        [...identifiers].filter(
          isValidNativeNotificationIdentifier
        )
      )
    ];
    let complete = true;
    for (
      let offset = 0;
      offset < validIdentifiers.length;
      offset += MAX_CLEANUP_IDENTIFIERS
    ) {
      const results = await Promise.allSettled(
        validIdentifiers
          .slice(offset, offset + MAX_CLEANUP_IDENTIFIERS)
          .map((identifier) =>
            Promise.resolve().then(() =>
              this.notifications.cancel(identifier)
            )
          )
      );
      complete &&= results.every(
        (result) => result.status === "fulfilled"
      );
    }
    return complete;
  }

  private async drainScheduledReviewIdentifiers(
    mode: StoredReviewReminderCleanup["mode"],
    scopeIds: Set<string>,
    identifiers: Set<string>
  ): Promise<boolean> {
    for (
      let pass = 0;
      pass <= MAX_CLEANUP_ENUMERATION_PASSES;
      pass += 1
    ) {
      let listed: readonly ScheduledReviewNotificationDescriptor[];
      try {
        listed =
          await this.notifications.listScheduledNotifications();
      } catch {
        return false;
      }
      const owned = listed.filter((notification) => {
        const identifier = notification.identifier;
        if (!isValidNativeNotificationIdentifier(identifier)) {
          return false;
        }
        if (identifiers.has(identifier)) {
          return true;
        }
        const listedScopeId =
          scopeIdFromReviewNotificationIdentifier(identifier);
        const ownerScopeId =
          scopeIdFromReviewNotificationIdentifier(
            notification.requestedIdentifier
          );
        return Boolean(
          (listedScopeId &&
            (mode === "all" || scopeIds.has(listedScopeId))) ||
            (ownerScopeId &&
              (mode === "all" || scopeIds.has(ownerScopeId)))
        );
      });
      if (owned.length === 0) {
        return true;
      }
      for (const notification of owned) {
        const identifier = notification.identifier;
        identifiers.add(identifier);
        const listedScopeId =
          scopeIdFromReviewNotificationIdentifier(identifier);
        if (listedScopeId) {
          scopeIds.add(listedScopeId);
        }
        const ownerIdentifier = notification.requestedIdentifier;
        const ownerScopeId =
          scopeIdFromReviewNotificationIdentifier(ownerIdentifier);
        if (ownerScopeId && ownerIdentifier) {
          scopeIds.add(ownerScopeId);
          identifiers.add(ownerIdentifier);
        }
      }
      if (pass === MAX_CLEANUP_ENUMERATION_PASSES) {
        return false;
      }
      const cancelled =
        await this.attemptCancellationIdentifiers(
          new Set(
            owned.map((notification) => notification.identifier)
          )
        );
      if (!cancelled) {
        return false;
      }
    }
    return false;
  }

  private deterministicIdentifiersForScope(
    scope: VaultScope
  ): ReadonlySet<string> {
    const checked = assertAuthenticatedScope(scope);
    return new Set([
      scopedReviewNotificationIdentifier(checked),
      ...(this.knownIdentifiersByScope.get(checked.scopeId) ?? [])
    ]);
  }

  private rememberIdentifiers(
    scopeId: string,
    identifiers: readonly string[]
  ): void {
    const known =
      this.knownIdentifiersByScope.get(scopeId) ?? new Set<string>();
    for (const identifier of identifiers) {
      if (isValidNativeNotificationIdentifier(identifier)) {
        known.add(identifier);
      }
    }
    this.knownIdentifiersByScope.set(scopeId, known);
  }

  private allKnownCleanupMarker(): StoredReviewReminderCleanup {
    return {
      version: 1,
      mode: "all",
      scopeIds: [...this.knownIdentifiersByScope.keys()],
      identifiers: [
        ...this.knownIdentifiersByScope.values()
      ].flatMap((known) => [...known]),
      overflow: false
    };
  }

  private async writeCleanupMarker(
    marker: StoredReviewReminderCleanup
  ): Promise<StoredReviewReminderCleanup> {
    return CLEANUP_JOURNAL_COORDINATOR.runExclusive(async () => {
      const incoming = normalizeCleanupMarker(marker);
      const stored = await this.secureStore.getItem(
        REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
      );
      const existing = cleanupMarkerFromStoredValue(stored);
      const merged = existing
        ? mergeCleanupMarkers(existing, incoming)
        : incoming;
      await this.secureStore.setItem(
        REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY,
        JSON.stringify(merged)
      );
      return merged;
    });
  }

  private async resolveCleanupOverflowIfCurrent(
    expected: StoredReviewReminderCleanup
  ): Promise<boolean> {
    return CLEANUP_JOURNAL_COORDINATOR.runExclusive(async () => {
      try {
        const stored = await this.secureStore.getItem(
          REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
        );
        const current = cleanupMarkerFromStoredValue(stored);
        if (
          !current ||
          !cleanupMarkersEqual(current, expected)
        ) {
          return false;
        }
        await this.secureStore.setItem(
          REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY,
          JSON.stringify({
            ...normalizeCleanupMarker(current),
            overflow: false
          } satisfies StoredReviewReminderCleanup)
        );
        return true;
      } catch {
        return false;
      }
    });
  }

  private async removeCleanupMarkerIfCurrent(
    expected: StoredReviewReminderCleanup
  ): Promise<boolean> {
    return CLEANUP_JOURNAL_COORDINATOR.runExclusive(async () => {
      try {
        const stored = await this.secureStore.getItem(
          REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
        );
        const current = cleanupMarkerFromStoredValue(stored);
        if (
          !current ||
          !cleanupMarkersEqual(current, expected)
        ) {
          return false;
        }
        await this.secureStore.removeItem(
          REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
        );
        return true;
      } catch {
        return false;
      }
    });
  }

  private async readJson(key: string): Promise<unknown> {
    const stored = await this.secureStore.getItem(key);
    if (stored === null) return null;
    try {
      return JSON.parse(stored) as unknown;
    } catch {
      await this.secureStore.removeItem(key);
      return null;
    }
  }

  private async runExclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.catch(() => undefined);
    return run;
  }
}

function assertAuthenticatedScope(scope: VaultScope): VaultScope {
  const checked = assertValidVaultScope(scope);
  if (checked.kind !== "authenticated") {
    throw new Error(
      "Review reminder preferences require an authenticated vault scope."
    );
  }
  return checked;
}

function isActiveReminderContext(
  input: ReviewReminderContext
): input is ReviewReminderContext & {
  readonly scope: VaultScope;
  readonly workspace: NativeWorkspace;
  readonly runtime: "supabase";
} {
  return Boolean(
    input.scope &&
      assertValidVaultScope(input.scope).kind === "authenticated" &&
      input.workspace &&
      input.workspace.mode === "personal" &&
      input.runtime === "supabase"
  );
}

function isValidNativeNotificationIdentifier(
  value: unknown
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 512 &&
    !CONTROL_CHARACTER_PATTERN.test(value)
  );
}

function isScopedReviewNotificationIdentifier(
  value: unknown
): value is string {
  if (
    !isValidNativeNotificationIdentifier(value) ||
    !value.startsWith(REVIEW_NOTIFICATION_IDENTIFIER_PREFIX)
  ) {
    return false;
  }
  const scopeId = value.slice(REVIEW_NOTIFICATION_IDENTIFIER_PREFIX.length);
  try {
    return vaultScopeFromOpaqueId(scopeId).kind === "authenticated";
  } catch {
    return false;
  }
}

function requestedReviewIdentifierFromOwnershipMarker(
  value: unknown
): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value as {
    readonly kind?: unknown;
    readonly schemaVersion?: unknown;
    readonly requestedIdentifier?: unknown;
  };
  return (
    candidate.kind === REVIEW_REMINDER_PAYLOAD.data.kind &&
    candidate.schemaVersion ===
      REVIEW_NOTIFICATION_OWNERSHIP_SCHEMA_VERSION &&
    isScopedReviewNotificationIdentifier(
      candidate.requestedIdentifier
    )
  )
    ? candidate.requestedIdentifier
    : null;
}

function scopeIdFromReviewNotificationIdentifier(
  value: unknown
): string | null {
  if (!isScopedReviewNotificationIdentifier(value)) return null;
  return value.slice(REVIEW_NOTIFICATION_IDENTIFIER_PREFIX.length);
}

function isAuthenticatedScopeId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return vaultScopeFromOpaqueId(value).kind === "authenticated";
  } catch {
    return false;
  }
}

function normalizeCleanupMarker(
  marker: StoredReviewReminderCleanup
): StoredReviewReminderCleanup {
  const targets = cleanupMarkerTargets(marker);
  const overflow =
    Boolean(marker.overflow) ||
    cleanupMarkerInputOverflows(marker);
  return {
    version: 1,
    mode:
      overflow || marker.mode !== "scope"
        ? "all"
        : "scope",
    scopeIds: targets.scopeIds.slice(0, MAX_CLEANUP_SCOPES),
    identifiers: targets.identifiers.slice(
      0,
      MAX_CLEANUP_IDENTIFIERS
    ),
    overflow
  };
}

function cleanupMarkerTargets(
  marker: StoredReviewReminderCleanup
): {
  readonly scopeIds: readonly string[];
  readonly identifiers: readonly string[];
} {
  const scopeIds = [
    ...new Set(marker.scopeIds.filter(isAuthenticatedScopeId))
  ];
  const identifiers = [
    ...new Set(
      [
        ...scopeIds.map(
          (scopeId) =>
            `${REVIEW_NOTIFICATION_IDENTIFIER_PREFIX}${scopeId}`
        ),
        ...marker.identifiers
      ].filter(isValidNativeNotificationIdentifier)
    )
  ];
  return { scopeIds, identifiers };
}

function cleanupMarkerInputOverflows(
  marker: StoredReviewReminderCleanup
): boolean {
  const targets = cleanupMarkerTargets(marker);
  return (
    targets.scopeIds.length > MAX_CLEANUP_SCOPES ||
    targets.identifiers.length > MAX_CLEANUP_IDENTIFIERS
  );
}

function mergeCleanupMarkers(
  existing: StoredReviewReminderCleanup,
  incoming: StoredReviewReminderCleanup
): StoredReviewReminderCleanup {
  const left = normalizeCleanupMarker(existing);
  const right = normalizeCleanupMarker(incoming);
  return normalizeCleanupMarker({
    version: 1,
    mode:
      left.mode === "all" || right.mode === "all"
        ? "all"
        : "scope",
    scopeIds: [...left.scopeIds, ...right.scopeIds],
    identifiers: [...left.identifiers, ...right.identifiers],
    overflow: Boolean(left.overflow) || Boolean(right.overflow)
  });
}

function cleanupMarkerFromStoredValue(
  stored: string | null
): StoredReviewReminderCleanup | null {
  if (stored === null) return null;
  try {
    const parsed = JSON.parse(stored) as unknown;
    return failClosedCleanupMarker(parsed);
  } catch {
    return failClosedCleanupMarker(null);
  }
}

function failClosedCleanupMarker(
  value: unknown
): StoredReviewReminderCleanup {
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as {
          readonly version?: unknown;
          readonly mode?: unknown;
          readonly scopeIds?: unknown;
          readonly identifiers?: unknown;
          readonly overflow?: unknown;
        })
      : null;
  const scopeIds = Array.isArray(candidate?.scopeIds)
    ? candidate.scopeIds.filter(isAuthenticatedScopeId)
    : [];
  const identifiers = Array.isArray(candidate?.identifiers)
    ? candidate.identifiers.filter(
        isValidNativeNotificationIdentifier
      )
    : [];
  const structurallyValid =
    candidate?.version === 1 &&
    (candidate.mode === "scope" || candidate.mode === "all") &&
    Array.isArray(candidate.scopeIds) &&
    candidate.scopeIds.every(isAuthenticatedScopeId) &&
    Array.isArray(candidate.identifiers) &&
    candidate.identifiers.every(
      isValidNativeNotificationIdentifier
    ) &&
    (candidate.overflow === undefined ||
      typeof candidate.overflow === "boolean");
  const marker: StoredReviewReminderCleanup = {
    version: 1,
    mode:
      structurallyValid && candidate?.mode === "scope"
        ? "scope"
        : "all",
    scopeIds,
    identifiers,
    overflow:
      candidate?.overflow === true || !structurallyValid
  };
  const overflow =
    Boolean(marker.overflow) ||
    cleanupMarkerInputOverflows(marker);
  return {
    ...marker,
    mode: overflow ? "all" : marker.mode,
    overflow
  };
}

function cleanupMarkerContains(
  container: StoredReviewReminderCleanup,
  candidate: StoredReviewReminderCleanup
): boolean {
  const normalizedContainer = normalizeCleanupMarker(container);
  const normalizedCandidate = normalizeCleanupMarker(candidate);
  const scopes = new Set(normalizedContainer.scopeIds);
  const identifiers = new Set(normalizedContainer.identifiers);
  return (
    normalizedContainer.mode === normalizedCandidate.mode &&
    Boolean(normalizedContainer.overflow) ===
      Boolean(normalizedCandidate.overflow) &&
    normalizedCandidate.scopeIds.every((scopeId) =>
      scopes.has(scopeId)
    ) &&
    normalizedCandidate.identifiers.every((identifier) =>
      identifiers.has(identifier)
    )
  );
}

function cleanupMarkersEqual(
  left: StoredReviewReminderCleanup,
  right: StoredReviewReminderCleanup
): boolean {
  return (
    cleanupMarkerContains(left, right) &&
    cleanupMarkerContains(right, left)
  );
}

function mismatchEscrowFromStoredValue(
  stored: string | null
): StoredReviewReminderMismatchEscrow | null {
  if (stored === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored) as unknown;
  } catch {
    throw new Error(
      "The review notification mismatch escrow is malformed."
    );
  }
  if (!isStoredMismatchEscrow(parsed)) {
    throw new Error(
      "The review notification mismatch escrow is invalid."
    );
  }
  return parsed;
}

function isStoredMismatchEscrow(
  value: unknown
): value is StoredReviewReminderMismatchEscrow {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate =
    value as Partial<StoredReviewReminderMismatchEscrow>;
  return (
    candidate.version === 1 &&
    isAuthenticatedScopeId(candidate.scopeId) &&
    isScopedReviewNotificationIdentifier(
      candidate.requestedIdentifier
    ) &&
    candidate.requestedIdentifier ===
      `${REVIEW_NOTIFICATION_IDENTIFIER_PREFIX}${candidate.scopeId}` &&
    isValidNativeNotificationIdentifier(
      candidate.returnedIdentifier
    ) &&
    candidate.returnedIdentifier !== candidate.requestedIdentifier
  );
}

function mismatchEscrowsEqual(
  left: StoredReviewReminderMismatchEscrow,
  right: StoredReviewReminderMismatchEscrow
): boolean {
  return (
    left.version === right.version &&
    left.scopeId === right.scopeId &&
    left.requestedIdentifier === right.requestedIdentifier &&
    left.returnedIdentifier === right.returnedIdentifier
  );
}

function isStoredSchedule(
  value: unknown,
  scopeId: string
): value is StoredReviewReminderSchedule {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<StoredReviewReminderSchedule>;
  return (
    candidate.version === 1 &&
    candidate.scopeId === scopeId &&
    isScopedReviewNotificationIdentifier(candidate.requestedIdentifier) &&
    candidate.nativeIdentifier === candidate.requestedIdentifier &&
    candidate.requestedIdentifier ===
      `${REVIEW_NOTIFICATION_IDENTIFIER_PREFIX}${scopeId}` &&
    typeof candidate.scheduledAt === "string" &&
    Number.isFinite(Date.parse(candidate.scheduledAt)) &&
    typeof candidate.planSignature === "string" &&
    candidate.planSignature.length > 0 &&
    candidate.planSignature.length <= 128 &&
    !CONTROL_CHARACTER_PATTERN.test(candidate.planSignature)
  );
}

function isStoredActive(
  value: unknown
): value is StoredActiveReviewReminder {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<StoredActiveReviewReminder>;
  if (
    candidate.version !== 1 ||
    typeof candidate.scopeId !== "string" ||
    !isScopedReviewNotificationIdentifier(candidate.requestedIdentifier) ||
    candidate.nativeIdentifier !== candidate.requestedIdentifier
  ) {
    return false;
  }
  try {
    return (
      vaultScopeFromOpaqueId(candidate.scopeId).kind === "authenticated" &&
      candidate.requestedIdentifier ===
        `${REVIEW_NOTIFICATION_IDENTIFIER_PREFIX}${candidate.scopeId}`
    );
  } catch {
    return false;
  }
}

function inactiveResult(): ReviewReminderReconcileResult {
  return {
    kind: "inactive",
    permission: null,
    notificationIdentifier: null,
    scheduledAt: null
  };
}

function disabledResult(): ReviewReminderReconcileResult {
  return {
    kind: "disabled",
    permission: null,
    notificationIdentifier: null,
    scheduledAt: null
  };
}

function noReviewResult(): ReviewReminderReconcileResult {
  return {
    kind: "no-review",
    permission: null,
    notificationIdentifier: null,
    scheduledAt: null
  };
}

function cleanupPendingResult(): ReviewReminderReconcileResult {
  return {
    kind: "cleanup-pending",
    permission: null,
    notificationIdentifier: null,
    scheduledAt: null
  };
}

function cancelledResult(): ReviewReminderCancellationResult {
  return {
    kind: "cancelled",
    cleanupPending: false
  };
}

function cleanupPendingCancellationResult(): ReviewReminderCancellationResult {
  return {
    kind: "cleanup-pending",
    cleanupPending: true
  };
}

function permissionBlockedResult(
  permission: ReviewNotificationPermission
): ReviewReminderReconcileResult {
  return {
    kind: "permission-blocked",
    permission: permission === "denied" ? "denied" : "undetermined",
    notificationIdentifier: null,
    scheduledAt: null
  };
}
