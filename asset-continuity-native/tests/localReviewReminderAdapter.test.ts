import type {
  NativeAsset,
  NativeEvidence,
  NativeWorkspace
} from "@/domain/model";
import { createWorkspace } from "@/domain/sample";
import { REVIEW_REMINDER_PAYLOAD } from "@/domain/reviewReminders";
import {
  ExpoLocalReviewNotificationPort,
  LocalReviewReminderManager,
  permissionAllowsReviewReminders,
  REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY,
  REVIEW_REMINDER_MISMATCH_ESCROW_STORAGE_KEY,
  reviewNotificationPermissionFromExpo,
  reviewReminderStorageKeys,
  reviewReminderTriggerDate,
  scopedReviewNotificationIdentifier,
  type ExpoNotificationsModuleLike,
  type LocalReviewNotificationPort,
  type ReviewNotificationPermission,
  type ReviewReminderSecureStorePort,
  type ScheduledReviewNotificationDescriptor
} from "@/notifications/reviewReminderAdapter";
import {
  DEVICE_PREVIEW_VAULT_SCOPE,
  vaultScopeFromOpaqueId,
  type VaultScope
} from "@/data/vaultScope";

const FIXED_NOW = new Date(2026, 6, 28, 10, 30, 0, 0);
const SENSITIVE_VALUES = [
  "Private family name",
  "Sensitive heirloom name",
  "Hidden cabinet location",
  "secret-policy-number.pdf",
  "88,000,000 QAR",
  "raw-account@example.test",
  "household-raw-private"
] as const;

class MemorySecureStore implements ReviewReminderSecureStorePort {
  readonly values = new Map<string, string>();
  failSetWhen: ((key: string) => boolean) | null = null;
  failGetWhen: ((key: string) => boolean) | null = null;
  failRemoveWhen: ((key: string) => boolean) | null = null;
  afterGetWhen:
    | ((key: string, value: string | null) => Promise<void>)
    | null = null;
  beforeRemoveWhen:
    | ((key: string) => Promise<void>)
    | null = null;

  constructor(private readonly events: string[] = []) {}

  async getItem(key: string): Promise<string | null> {
    this.events.push(`store:get:${key}`);
    if (this.failGetWhen?.(key)) {
      throw new Error("Synthetic secure storage read failure.");
    }
    const value = this.values.get(key) ?? null;
    await this.afterGetWhen?.(key, value);
    return value;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.events.push(`store:set:${key}`);
    if (this.failSetWhen?.(key)) {
      throw new Error("Synthetic secure storage failure.");
    }
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.events.push(`store:remove:${key}`);
    await this.beforeRemoveWhen?.(key);
    if (this.failRemoveWhen?.(key)) {
      throw new Error("Synthetic secure storage remove failure.");
    }
    this.values.delete(key);
  }
}

class MemoryNotificationPort implements LocalReviewNotificationPort {
  permission: ReviewNotificationPermission = "undetermined";
  requestResult: ReviewNotificationPermission = "authorized";
  requestCalls = 0;
  getPermissionCalls = 0;
  scheduleCalls: {
    readonly identifier: string;
    readonly date: Date;
  }[] = [];
  cancelCalls: string[] = [];
  readonly scheduled = new Map<string, Date>();
  readonly requestedIdentifierByNative = new Map<string, string>();
  failList = false;
  failCancel = false;
  failCancelWhen: ((identifier: string) => boolean) | null = null;
  scheduleIdentifierFor:
    | ((requestedIdentifier: string) => string)
    | null = null;
  listCalls = 0;

  constructor(private readonly events: string[] = []) {}

  async getPermission(): Promise<ReviewNotificationPermission> {
    this.getPermissionCalls += 1;
    return this.permission;
  }

  async requestPermission(): Promise<ReviewNotificationPermission> {
    this.requestCalls += 1;
    this.permission = this.requestResult;
    return this.requestResult;
  }

  async scheduleReview(input: {
    readonly identifier: string;
    readonly date: Date;
  }): Promise<string> {
    this.scheduleCalls.push({
      identifier: input.identifier,
      date: new Date(input.date)
    });
    const nativeIdentifier =
      this.scheduleIdentifierFor?.(input.identifier) ??
      input.identifier;
    this.scheduled.set(nativeIdentifier, new Date(input.date));
    this.requestedIdentifierByNative.set(
      nativeIdentifier,
      input.identifier
    );
    return nativeIdentifier;
  }

  async cancel(identifier: string): Promise<void> {
    this.events.push(`notification:cancel:${identifier}`);
    this.cancelCalls.push(identifier);
    if (this.failCancel || this.failCancelWhen?.(identifier)) {
      throw new Error("Synthetic notification cancellation failure.");
    }
    this.scheduled.delete(identifier);
    this.requestedIdentifierByNative.delete(identifier);
  }

  async listScheduledNotifications(): Promise<
    readonly ScheduledReviewNotificationDescriptor[]
  > {
    this.events.push("notification:list");
    this.listCalls += 1;
    if (this.failList) {
      throw new Error("Synthetic notification enumeration failure.");
    }
    return [...this.scheduled.keys()].map((identifier) => ({
      identifier,
      requestedIdentifier:
        this.requestedIdentifierByNative.get(identifier) ?? null
    }));
  }
}

function authenticatedScope(seed: "a" | "b"): VaultScope {
  return vaultScopeFromOpaqueId(`auth-v1-${seed.repeat(64)}`);
}

function authenticatedScopeAt(index: number): VaultScope {
  return vaultScopeFromOpaqueId(
    `auth-v1-${index.toString(16).padStart(64, "0")}`
  );
}

function deferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function reviewWorkspace(
  householdId = "household-raw-private",
  expiresAt = "2027-01-20"
): NativeWorkspace {
  const base = createWorkspace(
    "personal",
    "2026-07-28T07:30:00.000Z",
    {
      householdId,
      ownerMemberId: "member-raw-private",
      deviceId: "device-raw-private"
    }
  );
  const asset: NativeAsset = {
    id: "asset-raw-private",
    version: 1,
    householdId,
    name: "Sensitive heirloom name",
    categoryId: "home.other",
    categoryLabel: "Personal item",
    visualKind: "heirloom",
    photoUri: null,
    photoProtectedUri: null,
    photoChecksumSha256: null,
    photoEvidenceId: null,
    locationStatus: "known",
    placeId: null,
    roomId: null,
    locatorText: "Hidden cabinet location",
    evidenceIds: ["evidence-raw-private"],
    lifecycleStatus: "active",
    archivedAt: null,
    syncStatus: "synced",
    createdAt: "2026-07-28T07:30:00.000Z",
    updatedAt: "2026-07-28T07:30:00.000Z"
  };
  const evidence: NativeEvidence = {
    id: "evidence-raw-private",
    version: 1,
    versionId: "evidence-version-raw-private",
    blobObjectId: "blob-raw-private",
    householdId,
    assetId: asset.id,
    kind: "record",
    relation: "ownership",
    fileName: "secret-policy-number.pdf",
    mimeType: "application/pdf",
    byteSize: 88_000_000,
    localUri: null,
    checksumSha256: null,
    reviewStatus: "reviewed",
    reviewedAt: "2026-07-28T07:30:00.000Z",
    expiresAt,
    storageState: "synced",
    capturedAt: "2026-07-28T07:30:00.000Z",
    updatedAt: "2026-07-28T07:30:00.000Z"
  };
  return {
    ...base,
    household: {
      ...base.household,
      name: "Private family name"
    },
    assets: [asset],
    evidence: [evidence]
  };
}

describe("Expo local review notification adapter", () => {
  it.each([
    [0, "undetermined"],
    [1, "denied"],
    [2, "authorized"],
    [3, "provisional"],
    [4, "ephemeral"]
  ] as const)("maps iOS authorization status %i to %s", (status, expected) => {
    expect(
      reviewNotificationPermissionFromExpo({
        status: "undetermined",
        ios: { status }
      })
    ).toBe(expected);
  });

  it("maps platform-level granted and denied states and recognizes every allowed state", () => {
    expect(
      reviewNotificationPermissionFromExpo({
        granted: true,
        status: "granted"
      })
    ).toBe("authorized");
    expect(
      reviewNotificationPermissionFromExpo({ status: "denied" })
    ).toBe("denied");
    expect(
      reviewNotificationPermissionFromExpo({ status: "undetermined" })
    ).toBe("undetermined");

    expect(permissionAllowsReviewReminders("authorized")).toBe(true);
    expect(permissionAllowsReviewReminders("provisional")).toBe(true);
    expect(permissionAllowsReviewReminders("ephemeral")).toBe(true);
    expect(permissionAllowsReviewReminders("denied")).toBe(false);
    expect(permissionAllowsReviewReminders("undetermined")).toBe(false);
  });

  it("requests alerts only and schedules one quiet, generic, device-local notification", async () => {
    const getPermissionsAsync = jest.fn(async () => ({
      status: "granted",
      granted: true
    }));
    const requestPermissionsAsync = jest.fn(async () => ({
      status: "granted",
      granted: true,
      ios: { status: 2 }
    }));
    const scheduleNotificationAsync = jest.fn(
      async (request: { readonly identifier: string }) =>
        request.identifier
    );
    const cancelScheduledNotificationAsync = jest.fn(async () => undefined);
    const getAllScheduledNotificationsAsync = jest.fn(async () => []);
    const setNotificationHandler = jest.fn();
    const setNotificationChannelAsync = jest.fn(async () => undefined);
    const expoModule: ExpoNotificationsModuleLike = {
      SchedulableTriggerInputTypes: { DATE: "date" },
      AndroidImportance: { LOW: 2 },
      AndroidNotificationVisibility: { PRIVATE: -1 },
      getPermissionsAsync,
      requestPermissionsAsync,
      scheduleNotificationAsync,
      cancelScheduledNotificationAsync,
      getAllScheduledNotificationsAsync,
      setNotificationHandler,
      setNotificationChannelAsync
    };
    const port = new ExpoLocalReviewNotificationPort(expoModule);
    const identifier = scopedReviewNotificationIdentifier(
      authenticatedScope("a")
    );
    const date = new Date(2027, 0, 20, 9, 0, 0, 0);

    await expect(port.getPermission()).resolves.toBe("authorized");
    await expect(port.requestPermission()).resolves.toBe("authorized");
    await expect(
      port.scheduleReview({ identifier, date })
    ).resolves.toBe(identifier);

    expect(requestPermissionsAsync).toHaveBeenCalledWith({
      ios: {
        allowAlert: true,
        allowBadge: false,
        allowSound: false,
        allowProvisional: false
      }
    });
    expect(scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier,
      content: {
        title: REVIEW_REMINDER_PAYLOAD.title,
        body: REVIEW_REMINDER_PAYLOAD.body,
        data: {
          kind: "review",
          schemaVersion: 1,
          requestedIdentifier: identifier
        },
        sound: false,
        interruptionLevel: "passive",
        priority: "low"
      },
      trigger: {
        type: "date",
        date,
        channelId: "alyr-private-reviews"
      }
    });
    expect(setNotificationChannelAsync).toHaveBeenCalledWith(
      "alyr-private-reviews",
      {
        name: "Private reviews",
        importance: 2,
        sound: null,
        vibrationPattern: [],
        lockscreenVisibility: -1
      }
    );
    expect(setNotificationHandler).toHaveBeenCalledTimes(1);
    const handler = setNotificationHandler.mock.calls[0]?.[0] as {
      readonly handleNotification: () => Promise<unknown>;
    };
    await expect(handler.handleNotification()).resolves.toEqual({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true
    });

    const serialized = JSON.stringify(
      scheduleNotificationAsync.mock.calls[0]?.[0]
    );
    expect(Object.keys(REVIEW_REMINDER_PAYLOAD)).toEqual([
      "title",
      "body",
      "data"
    ]);
    expect(Object.keys(REVIEW_REMINDER_PAYLOAD.data)).toEqual(["kind"]);
    for (const sensitive of SENSITIVE_VALUES) {
      expect(serialized).not.toContain(sensitive);
    }
    expect(expoModule).not.toHaveProperty("getExpoPushTokenAsync");
    expect(expoModule).not.toHaveProperty("registerTaskAsync");
  });

  it("recognizes only versioned, scoped ALYR review ownership markers", async () => {
    const requestedIdentifier =
      scopedReviewNotificationIdentifier(authenticatedScope("a"));
    const expoModule: ExpoNotificationsModuleLike = {
      SchedulableTriggerInputTypes: { DATE: "date" },
      getPermissionsAsync: jest.fn(async () => ({
        status: "granted",
        granted: true
      })),
      requestPermissionsAsync: jest.fn(async () => ({
        status: "granted",
        granted: true
      })),
      scheduleNotificationAsync: jest.fn(
        async (request) => request.identifier
      ),
      cancelScheduledNotificationAsync: jest.fn(async () => undefined),
      getAllScheduledNotificationsAsync: jest.fn(async () => [
        {
          identifier: "provider-owned-id",
          content: {
            data: {
              kind: "review",
              schemaVersion: 1,
              requestedIdentifier
            }
          }
        },
        {
          identifier: "provider-unowned-id",
          content: {
            data: {
              kind: "other",
              schemaVersion: 1,
              requestedIdentifier
            }
          }
        },
        {
          identifier: "provider-forged-scope-id",
          content: {
            data: {
              kind: "review",
              schemaVersion: 1,
              requestedIdentifier: "not-a-scoped-review-id"
            }
          }
        }
      ]),
      setNotificationHandler: jest.fn()
    };
    const port = new ExpoLocalReviewNotificationPort(expoModule);

    await expect(port.listScheduledNotifications()).resolves.toEqual([
      {
        identifier: "provider-owned-id",
        requestedIdentifier
      },
      {
        identifier: "provider-unowned-id",
        requestedIdentifier: null
      },
      {
        identifier: "provider-forged-scope-id",
        requestedIdentifier: null
      }
    ]);
  });

  it("rejects an operating-system identifier mismatch immediately for manager journaling", async () => {
    const mismatchedIdentifier = "provider-generated-id";
    const cancelScheduledNotificationAsync = jest.fn(
      async () => undefined
    );
    const expoModule: ExpoNotificationsModuleLike = {
      SchedulableTriggerInputTypes: { DATE: "date" },
      getPermissionsAsync: jest.fn(async () => ({
        status: "granted",
        granted: true
      })),
      requestPermissionsAsync: jest.fn(async () => ({
        status: "granted",
        granted: true
      })),
      scheduleNotificationAsync: jest.fn(
        async () => mismatchedIdentifier
      ),
      cancelScheduledNotificationAsync,
      getAllScheduledNotificationsAsync: jest.fn(async () => []),
      setNotificationHandler: jest.fn()
    };
    const port = new ExpoLocalReviewNotificationPort(expoModule);
    const requestedIdentifier =
      scopedReviewNotificationIdentifier(authenticatedScope("a"));

    await expect(
      port.scheduleReview({
        identifier: requestedIdentifier,
        date: new Date(2027, 0, 20, 9, 0, 0, 0)
      })
    ).rejects.toThrow(
      "did not preserve the scoped review notification identifier"
    );
    expect(cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });
});

describe("scope-bound local review reminder manager", () => {
  it("does not request permission or schedule until explicit opt-in", async () => {
    const notifications = new MemoryNotificationPort();
    const manager = new LocalReviewReminderManager(
      notifications,
      new MemorySecureStore(),
      () => new Date(FIXED_NOW)
    );

    await expect(
      manager.reconcile({
        scope: authenticatedScope("a"),
        workspace: reviewWorkspace(),
        runtime: "supabase"
      })
    ).resolves.toMatchObject({
      kind: "disabled",
      permission: null
    });
    expect(notifications.getPermissionCalls).toBe(0);
    expect(notifications.requestCalls).toBe(0);
    expect(notifications.scheduleCalls).toHaveLength(0);
  });

  it("requests permission only from opt-in, persists the choice, and reconciles idempotently", async () => {
    const scope = authenticatedScope("a");
    const notifications = new MemoryNotificationPort();
    const secureStore = new MemorySecureStore();
    const manager = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );
    const context = {
      scope,
      workspace: reviewWorkspace(),
      runtime: "supabase" as const
    };

    const scheduled = await manager.optIn({
      ...context,
      localHour: 8,
      localMinute: 45
    });
    const unchanged = await manager.reconcile(context);

    expect(scheduled).toMatchObject({
      kind: "scheduled",
      permission: "authorized"
    });
    expect(unchanged).toEqual({
      ...scheduled,
      kind: "unchanged"
    });
    expect(notifications.requestCalls).toBe(1);
    expect(notifications.scheduleCalls).toHaveLength(1);
    await expect(manager.getPreferences(scope)).resolves.toEqual({
      version: 1,
      enabled: true,
      localHour: 8,
      localMinute: 45
    });
  });

  it.each(["authorized", "provisional", "ephemeral"] as const)(
    "schedules under an existing %s permission without prompting",
    async (permission) => {
      const notifications = new MemoryNotificationPort();
      notifications.permission = permission;
      const manager = new LocalReviewReminderManager(
        notifications,
        new MemorySecureStore(),
        () => new Date(FIXED_NOW)
      );

      await expect(
        manager.optIn({
          scope: authenticatedScope("a"),
          workspace: reviewWorkspace(),
          runtime: "supabase",
          localHour: 9,
          localMinute: 0
        })
      ).resolves.toMatchObject({
        kind: "scheduled",
        permission
      });
      expect(notifications.requestCalls).toBe(0);
      expect(notifications.scheduleCalls).toHaveLength(1);
    }
  );

  it("keeps reminders disabled when the explicit permission request is denied", async () => {
    const scope = authenticatedScope("a");
    const notifications = new MemoryNotificationPort();
    notifications.requestResult = "denied";
    const manager = new LocalReviewReminderManager(
      notifications,
      new MemorySecureStore(),
      () => new Date(FIXED_NOW)
    );

    await expect(
      manager.optIn({
        scope,
        workspace: reviewWorkspace(),
        runtime: "supabase",
        localHour: 9,
        localMinute: 0
      })
    ).resolves.toEqual({
      kind: "permission-blocked",
      permission: "denied",
      notificationIdentifier: null,
      scheduledAt: null
    });
    expect(notifications.requestCalls).toBe(1);
    expect(notifications.scheduleCalls).toHaveLength(0);
    await expect(manager.getPreferences(scope)).resolves.toMatchObject({
      enabled: false
    });
  });

  it("uses only opaque scope identifiers in SecureStore keys, values, and notification identifiers", async () => {
    const scope = authenticatedScope("a");
    const notifications = new MemoryNotificationPort();
    notifications.permission = "authorized";
    const secureStore = new MemorySecureStore();
    const manager = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );

    await manager.optIn({
      scope,
      workspace: reviewWorkspace(),
      runtime: "supabase",
      localHour: 9,
      localMinute: 0
    });

    const serializedStorage = JSON.stringify([
      ...secureStore.values.entries()
    ]);
    const serializedNotificationCalls = JSON.stringify(
      notifications.scheduleCalls
    );
    expect([...secureStore.values.keys()]).toEqual(
      expect.arrayContaining([
        reviewReminderStorageKeys(scope).preferences,
        reviewReminderStorageKeys(scope).schedule,
        "alyr.native.review-reminder.active.v1"
      ])
    );
    expect(notifications.scheduleCalls[0]?.identifier).toBe(
      scopedReviewNotificationIdentifier(scope)
    );
    expect(serializedStorage).toContain(scope.scopeId);
    for (const sensitive of SENSITIVE_VALUES) {
      expect(serializedStorage).not.toContain(sensitive);
      expect(serializedNotificationCalls).not.toContain(sensitive);
    }
  });

  it("cancels the prior scope on account switch and cancels on sample preview and sign-out", async () => {
    const scopeA = authenticatedScope("a");
    const scopeB = authenticatedScope("b");
    const notifications = new MemoryNotificationPort();
    notifications.permission = "authorized";
    const manager = new LocalReviewReminderManager(
      notifications,
      new MemorySecureStore(),
      () => new Date(FIXED_NOW)
    );
    const personalA = reviewWorkspace();

    const first = await manager.optIn({
      scope: scopeA,
      workspace: personalA,
      runtime: "supabase",
      localHour: 9,
      localMinute: 0
    });
    expect(first.notificationIdentifier).not.toBeNull();

    await expect(
      manager.reconcile({
        scope: scopeB,
        workspace: reviewWorkspace("another-household"),
        runtime: "supabase"
      })
    ).resolves.toMatchObject({ kind: "disabled" });
    expect(notifications.cancelCalls).toContain(
      first.notificationIdentifier
    );
    expect(notifications.scheduled.size).toBe(0);

    const second = await manager.optIn({
      scope: scopeA,
      workspace: personalA,
      runtime: "supabase",
      localHour: 9,
      localMinute: 0
    });
    await expect(
      manager.reconcile({
        scope: scopeA,
        workspace: createWorkspace("sample"),
        runtime: "supabase"
      })
    ).resolves.toMatchObject({ kind: "inactive" });
    expect(notifications.cancelCalls).toContain(
      second.notificationIdentifier
    );
    expect(notifications.scheduled.size).toBe(0);

    const third = await manager.optIn({
      scope: scopeA,
      workspace: personalA,
      runtime: "supabase",
      localHour: 9,
      localMinute: 0
    });
    await expect(
      manager.reconcile({
        scope: null,
        workspace: null,
        runtime: "unavailable"
      })
    ).resolves.toMatchObject({ kind: "inactive" });
    expect(notifications.cancelCalls).toContain(
      third.notificationIdentifier
    );
    expect(notifications.scheduled.size).toBe(0);
  });

  it("cancels the newly scheduled notification if secure schedule persistence fails", async () => {
    const scope = authenticatedScope("a");
    const notifications = new MemoryNotificationPort();
    notifications.permission = "authorized";
    const secureStore = new MemorySecureStore();
    secureStore.failSetWhen = (key) => key.endsWith(".schedule.v1");
    const manager = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );

    await expect(
      manager.optIn({
        scope,
        workspace: reviewWorkspace(),
        runtime: "supabase",
        localHour: 9,
        localMinute: 0
      })
    ).rejects.toThrow("Synthetic secure storage failure");
    expect(notifications.scheduleCalls).toHaveLength(1);
    expect(notifications.scheduled.size).toBe(0);
    expect(notifications.cancelCalls).toContain(
      scopedReviewNotificationIdentifier(scope)
    );
    expect(
      secureStore.values.has(reviewReminderStorageKeys(scope).schedule)
    ).toBe(false);
  });

  it("mops up a mismatched native ID without storing or enabling it", async () => {
    const scope = authenticatedScope("a");
    const requestedIdentifier =
      scopedReviewNotificationIdentifier(scope);
    const mismatchedIdentifier = "provider-generated-id";
    const events: string[] = [];
    const notifications = new MemoryNotificationPort(events);
    notifications.permission = "authorized";
    notifications.scheduleIdentifierFor = () =>
      mismatchedIdentifier;
    const secureStore = new MemorySecureStore(events);
    const manager = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );

    await expect(
      manager.optIn({
        scope,
        workspace: reviewWorkspace(),
        runtime: "supabase",
        localHour: 9,
        localMinute: 0
      })
    ).rejects.toThrow(
      "did not preserve the scoped review notification identifier"
    );

    expect(notifications.cancelCalls).toEqual(
      expect.arrayContaining([
        requestedIdentifier,
        mismatchedIdentifier
      ])
    );
    const journalWrite = events.indexOf(
      `store:set:${REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY}`
    );
    const firstMismatchCancellation = events.indexOf(
      `notification:cancel:${mismatchedIdentifier}`
    );
    expect(journalWrite).toBeGreaterThanOrEqual(0);
    expect(firstMismatchCancellation).toBeGreaterThan(journalWrite);
    expect(notifications.scheduled.size).toBe(0);
    await expect(manager.getPreferences(scope)).resolves.toMatchObject({
      enabled: false
    });
    expect(
      secureStore.values.has(reviewReminderStorageKeys(scope).schedule)
    ).toBe(false);
    expect(
      secureStore.values.has(
        "alyr.native.review-reminder.active.v1"
      )
    ).toBe(false);
    expect(
      secureStore.values.has(
        REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
      )
    ).toBe(false);
    expect(JSON.stringify([...secureStore.values.values()])).not.toContain(
      mismatchedIdentifier
    );
  });

  it("retries and read-verifies mismatch escrow before the first cancellation", async () => {
    const scope = authenticatedScope("a");
    const mismatchedIdentifier = "provider-owned-transient-id";
    const events: string[] = [];
    const notifications = new MemoryNotificationPort(events);
    notifications.permission = "authorized";
    notifications.scheduleIdentifierFor = () =>
      mismatchedIdentifier;
    const secureStore = new MemorySecureStore(events);
    let escrowSetAttempts = 0;
    secureStore.failSetWhen = (key) => {
      if (key !== REVIEW_REMINDER_MISMATCH_ESCROW_STORAGE_KEY) {
        return false;
      }
      escrowSetAttempts += 1;
      return escrowSetAttempts === 1;
    };
    const manager = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );

    await expect(
      manager.optIn({
        scope,
        workspace: reviewWorkspace(),
        runtime: "supabase",
        localHour: 9,
        localMinute: 0
      })
    ).rejects.toThrow(
      "did not preserve the scoped review notification identifier"
    );

    const escrowSetEvent =
      `store:set:${REVIEW_REMINDER_MISMATCH_ESCROW_STORAGE_KEY}`;
    const escrowReadEvent =
      `store:get:${REVIEW_REMINDER_MISMATCH_ESCROW_STORAGE_KEY}`;
    const setIndices = events.flatMap((event, index) =>
      event === escrowSetEvent ? [index] : []
    );
    expect(setIndices).toHaveLength(2);
    const successfulSetIndex = setIndices[1] ?? -1;
    const firstCancellationIndex = events.indexOf(
      `notification:cancel:${mismatchedIdentifier}`
    );
    const verifiedReadIndex = events.findIndex(
      (event, index) =>
        event === escrowReadEvent &&
        index > successfulSetIndex &&
        index < firstCancellationIndex
    );
    expect(successfulSetIndex).toBeGreaterThanOrEqual(0);
    expect(verifiedReadIndex).toBeGreaterThan(successfulSetIndex);
    expect(firstCancellationIndex).toBeGreaterThan(verifiedReadIndex);
    expect(notifications.scheduled.has(mismatchedIdentifier)).toBe(false);
    expect(
      secureStore.values.has(
        REVIEW_REMINDER_MISMATCH_ESCROW_STORAGE_KEY
      )
    ).toBe(false);
  });

  it("uses the versioned OS ownership marker when mismatch escrow stays unavailable", async () => {
    const scope = authenticatedScope("a");
    const mismatchedIdentifier = "provider-owned-os-fallback";
    const unrelatedIdentifier = "provider-unowned-os-fallback";
    const notifications = new MemoryNotificationPort();
    notifications.permission = "authorized";
    notifications.scheduleIdentifierFor = () =>
      mismatchedIdentifier;
    notifications.scheduled.set(
      unrelatedIdentifier,
      new Date(2027, 0, 20, 9, 0, 0, 0)
    );
    const secureStore = new MemorySecureStore();
    secureStore.failSetWhen = (key) =>
      key === REVIEW_REMINDER_MISMATCH_ESCROW_STORAGE_KEY;
    const manager = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );

    await expect(
      manager.optIn({
        scope,
        workspace: reviewWorkspace(),
        runtime: "supabase",
        localHour: 9,
        localMinute: 0
      })
    ).rejects.toThrow(
      "did not preserve the scoped review notification identifier"
    );
    expect(notifications.scheduled.has(mismatchedIdentifier)).toBe(false);
    expect(notifications.cancelCalls).toContain(mismatchedIdentifier);
    expect(notifications.scheduled.has(unrelatedIdentifier)).toBe(true);
    expect(notifications.cancelCalls).not.toContain(
      unrelatedIdentifier
    );
    expect(
      secureStore.values.has(
        REVIEW_REMINDER_MISMATCH_ESCROW_STORAGE_KEY
      )
    ).toBe(false);
  });

  it("cold-recovers after escrow writes and initial OS ownership discovery both fail", async () => {
    const scope = authenticatedScope("a");
    const mismatchedIdentifier = "provider-owned-delayed-escrow";
    const unrelatedIdentifier = "provider-unowned-cold-restart";
    const notifications = new MemoryNotificationPort();
    notifications.permission = "authorized";
    notifications.scheduleIdentifierFor = () => {
      notifications.failList = true;
      return mismatchedIdentifier;
    };
    const secureStore = new MemorySecureStore();
    let blockEscrow = true;
    secureStore.failSetWhen = (key) =>
      blockEscrow &&
      key === REVIEW_REMINDER_MISMATCH_ESCROW_STORAGE_KEY;
    const manager = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );

    await expect(
      manager.optIn({
        scope,
        workspace: reviewWorkspace(),
        runtime: "supabase",
        localHour: 9,
        localMinute: 0
      })
    ).resolves.toEqual({
      kind: "cleanup-pending",
      permission: null,
      notificationIdentifier: null,
      scheduledAt: null
    });
    expect(notifications.scheduled.has(mismatchedIdentifier)).toBe(true);
    expect(notifications.cancelCalls).not.toContain(
      mismatchedIdentifier
    );
    expect(
      secureStore.values.has(
        REVIEW_REMINDER_MISMATCH_ESCROW_STORAGE_KEY
      )
    ).toBe(false);
    expect(
      secureStore.values.has(
        REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
      )
    ).toBe(false);

    notifications.scheduled.set(
      unrelatedIdentifier,
      new Date(2027, 0, 20, 9, 0, 0, 0)
    );
    blockEscrow = false;
    secureStore.failSetWhen = null;
    const restartedNotifications = new MemoryNotificationPort();
    for (const [identifier, date] of notifications.scheduled) {
      restartedNotifications.scheduled.set(
        identifier,
        new Date(date)
      );
    }
    for (const [
      identifier,
      requestedIdentifier
    ] of notifications.requestedIdentifierByNative) {
      restartedNotifications.requestedIdentifierByNative.set(
        identifier,
        requestedIdentifier
      );
    }
    const restartedStore = new MemorySecureStore();
    for (const [key, value] of secureStore.values) {
      restartedStore.values.set(key, value);
    }
    const restartedManager = new LocalReviewReminderManager(
      restartedNotifications,
      restartedStore,
      () => new Date(FIXED_NOW)
    );
    await expect(
      restartedManager.retryPendingCleanup()
    ).resolves.toEqual({
      kind: "cancelled",
      cleanupPending: false
    });
    expect(restartedNotifications.cancelCalls).toContain(
      mismatchedIdentifier
    );
    expect(
      restartedNotifications.scheduled.has(mismatchedIdentifier)
    ).toBe(false);
    expect(
      restartedNotifications.scheduled.has(unrelatedIdentifier)
    ).toBe(true);
    expect(restartedNotifications.cancelCalls).not.toContain(
      unrelatedIdentifier
    );
    expect(
      restartedStore.values.has(
        REVIEW_REMINDER_MISMATCH_ESCROW_STORAGE_KEY
      )
    ).toBe(false);
  });

  it("retains exact mismatch escrow across a failed marker write and drains it after restart", async () => {
    const scope = authenticatedScope("a");
    const mismatchedIdentifier = "provider-owned-after-restart";
    const unrelatedIdentifier = "provider-unowned-sentinel";
    const notifications = new MemoryNotificationPort();
    notifications.permission = "authorized";
    const secureStore = new MemorySecureStore();
    let blockCleanupMarker = false;
    notifications.scheduleIdentifierFor = () => {
      blockCleanupMarker = true;
      return mismatchedIdentifier;
    };
    secureStore.failSetWhen = (key) =>
      blockCleanupMarker &&
      key === REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY;
    const manager = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );

    await expect(
      manager.optIn({
        scope,
        workspace: reviewWorkspace(),
        runtime: "supabase",
        localHour: 9,
        localMinute: 0
      })
    ).resolves.toEqual({
      kind: "cleanup-pending",
      permission: null,
      notificationIdentifier: null,
      scheduledAt: null
    });
    expect(notifications.scheduled.has(mismatchedIdentifier)).toBe(false);
    expect(notifications.cancelCalls).toContain(mismatchedIdentifier);
    expect(
      secureStore.values.get(
        REVIEW_REMINDER_MISMATCH_ESCROW_STORAGE_KEY
      )
    ).toContain(mismatchedIdentifier);

    const blockedManager = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );
    await expect(
      blockedManager.optIn({
        scope,
        workspace: reviewWorkspace(),
        runtime: "supabase",
        localHour: 9,
        localMinute: 0
      })
    ).resolves.toEqual({
      kind: "cleanup-pending",
      permission: null,
      notificationIdentifier: null,
      scheduledAt: null
    });
    expect(notifications.scheduleCalls).toHaveLength(1);

    notifications.scheduled.set(
      unrelatedIdentifier,
      new Date(2027, 0, 20, 9, 0, 0, 0)
    );
    blockCleanupMarker = false;
    secureStore.failSetWhen = null;
    const restartedManager = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );

    await expect(
      restartedManager.retryPendingCleanup()
    ).resolves.toEqual({
      kind: "cancelled",
      cleanupPending: false
    });
    expect(notifications.scheduled.has(mismatchedIdentifier)).toBe(false);
    expect(notifications.cancelCalls).toContain(mismatchedIdentifier);
    expect(notifications.scheduled.has(unrelatedIdentifier)).toBe(true);
    expect(notifications.cancelCalls).not.toContain(
      unrelatedIdentifier
    );
    expect(
      secureStore.values.has(
        REVIEW_REMINDER_MISMATCH_ESCROW_STORAGE_KEY
      )
    ).toBe(false);
  });

  it("drains exact mismatch escrow beside a capped overflow marker without touching an unrelated native ID", async () => {
    const scopes = Array.from(
      { length: 70 },
      (_, index) => authenticatedScopeAt(index + 300)
    );
    const scopedIdentifiers = scopes.map((scope) =>
      scopedReviewNotificationIdentifier(scope)
    );
    const escrowScope = authenticatedScopeAt(900);
    const escrowRequested =
      scopedReviewNotificationIdentifier(escrowScope);
    const escrowReturned = "provider-owned-overflow-id";
    const unrelatedIdentifier = "provider-unowned-overflow-id";
    const notifications = new MemoryNotificationPort();
    const secureStore = new MemorySecureStore();
    for (const identifier of [
      ...scopedIdentifiers,
      escrowReturned,
      unrelatedIdentifier
    ]) {
      notifications.scheduled.set(
        identifier,
        new Date(2027, 0, 20, 9, 0, 0, 0)
      );
    }
    secureStore.values.set(
      REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        mode: "all",
        scopeIds: scopes
          .slice(0, 32)
          .map((scope) => scope.scopeId),
        identifiers: scopedIdentifiers.slice(0, 64),
        overflow: true
      })
    );
    secureStore.values.set(
      REVIEW_REMINDER_MISMATCH_ESCROW_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        scopeId: escrowScope.scopeId,
        requestedIdentifier: escrowRequested,
        returnedIdentifier: escrowReturned
      })
    );

    let result:
      | { readonly kind: "cancelled"; readonly cleanupPending: false }
      | {
          readonly kind: "cleanup-pending";
          readonly cleanupPending: true;
        } = {
      kind: "cleanup-pending",
      cleanupPending: true
    };
    for (let attempt = 0; attempt < 4 && result.cleanupPending; attempt += 1) {
      const restartedManager = new LocalReviewReminderManager(
        notifications,
        secureStore,
        () => new Date(FIXED_NOW)
      );
      result = await restartedManager.retryPendingCleanup();
    }

    expect(result).toEqual({
      kind: "cancelled",
      cleanupPending: false
    });
    for (const identifier of scopedIdentifiers) {
      expect(notifications.scheduled.has(identifier)).toBe(false);
    }
    expect(notifications.scheduled.has(escrowReturned)).toBe(false);
    expect(notifications.cancelCalls).toContain(escrowReturned);
    expect(notifications.scheduled.has(unrelatedIdentifier)).toBe(true);
    expect(notifications.cancelCalls).not.toContain(
      unrelatedIdentifier
    );
    expect(
      secureStore.values.has(
        REVIEW_REMINDER_MISMATCH_ESCROW_STORAGE_KEY
      )
    ).toBe(false);
    expect(
      secureStore.values.has(
        REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
      )
    ).toBe(false);
  });

  it("keeps malformed mismatch escrow pending without cancelling its arbitrary ID", async () => {
    const scope = authenticatedScope("a");
    const arbitraryIdentifier = "provider-arbitrary-corrupt-id";
    const notifications = new MemoryNotificationPort();
    const secureStore = new MemorySecureStore();
    notifications.scheduled.set(
      arbitraryIdentifier,
      new Date(2027, 0, 20, 9, 0, 0, 0)
    );
    secureStore.values.set(
      REVIEW_REMINDER_MISMATCH_ESCROW_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        scopeId: scope.scopeId,
        requestedIdentifier: "scope-mismatched-requested-id",
        returnedIdentifier: arbitraryIdentifier
      })
    );
    const manager = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );

    await expect(manager.retryPendingCleanup()).resolves.toEqual({
      kind: "cleanup-pending",
      cleanupPending: true
    });
    expect(notifications.scheduled.has(arbitraryIdentifier)).toBe(true);
    expect(notifications.cancelCalls).not.toContain(
      arbitraryIdentifier
    );
    expect(
      secureStore.values.has(
        REVIEW_REMINDER_MISMATCH_ESCROW_STORAGE_KEY
      )
    ).toBe(true);
  });

  it("cancels immediately on opt-out and keeps the stored preference disabled", async () => {
    const scope = authenticatedScope("a");
    const notifications = new MemoryNotificationPort();
    notifications.permission = "authorized";
    const manager = new LocalReviewReminderManager(
      notifications,
      new MemorySecureStore(),
      () => new Date(FIXED_NOW)
    );
    const result = await manager.optIn({
      scope,
      workspace: reviewWorkspace(),
      runtime: "supabase",
      localHour: 9,
      localMinute: 0
    });

    await manager.optOut(scope);

    expect(notifications.cancelCalls).toContain(
      result.notificationIdentifier
    );
    expect(notifications.scheduled.size).toBe(0);
    await expect(manager.getPreferences(scope)).resolves.toMatchObject({
      enabled: false
    });
  });

  it("cancels deterministic and known IDs before failed reads, persists opaque cleanup state, then heals on reconcile", async () => {
    const events: string[] = [];
    const scope = authenticatedScope("a");
    const notifications = new MemoryNotificationPort(events);
    notifications.permission = "authorized";
    const secureStore = new MemorySecureStore(events);
    const manager = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );
    const context = {
      scope,
      workspace: reviewWorkspace(),
      runtime: "supabase" as const
    };
    const scheduled = await manager.optIn({
      ...context,
      localHour: 9,
      localMinute: 0
    });
    const requestedIdentifier =
      scopedReviewNotificationIdentifier(scope);
    events.length = 0;
    secureStore.failGetWhen = (key) =>
      key !== REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY;

    await expect(manager.optOut(scope)).resolves.toEqual({
      kind: "cleanup-pending",
      cleanupPending: true
    });

    const requestedCancel = events.indexOf(
      `notification:cancel:${requestedIdentifier}`
    );
    const nativeCancel = events.indexOf(
      `notification:cancel:${scheduled.notificationIdentifier}`
    );
    const firstRead = events.findIndex((event) =>
      event.startsWith("store:get:")
    );
    const firstList = events.indexOf("notification:list");
    expect(requestedCancel).toBeGreaterThanOrEqual(0);
    expect(nativeCancel).toBeGreaterThanOrEqual(0);
    expect(requestedCancel).toBeLessThan(firstRead);
    expect(nativeCancel).toBeLessThan(firstRead);
    expect(requestedCancel).toBeLessThan(firstList);
    expect(notifications.scheduled.size).toBe(0);

    const cleanupMarker = secureStore.values.get(
      REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
    );
    expect(cleanupMarker).toBeDefined();
    expect(cleanupMarker).toContain(scope.scopeId);
    for (const sensitive of SENSITIVE_VALUES) {
      expect(cleanupMarker).not.toContain(sensitive);
    }

    secureStore.failGetWhen = null;
    await expect(manager.reconcile(context)).resolves.toMatchObject({
      kind: "disabled"
    });
    expect(
      secureStore.values.has(
        REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
      )
    ).toBe(false);
  });

  it("keeps cleanup pending when OS enumeration fails and clears it on a later retry", async () => {
    const scope = authenticatedScope("a");
    const notifications = new MemoryNotificationPort();
    notifications.permission = "authorized";
    const secureStore = new MemorySecureStore();
    const manager = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );
    await manager.optIn({
      scope,
      workspace: reviewWorkspace(),
      runtime: "supabase",
      localHour: 9,
      localMinute: 0
    });
    notifications.failList = true;

    await expect(manager.optOut(scope)).resolves.toEqual({
      kind: "cleanup-pending",
      cleanupPending: true
    });
    expect(
      secureStore.values.has(
        REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
      )
    ).toBe(true);

    notifications.failList = false;
    await expect(manager.retryPendingCleanup()).resolves.toEqual({
      kind: "cancelled",
      cleanupPending: false
    });
    expect(
      secureStore.values.has(
        REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
      )
    ).toBe(false);
  });

  it("does not claim cancellation while the OS cancel API fails and retries every known ID later", async () => {
    const scope = authenticatedScope("a");
    const notifications = new MemoryNotificationPort();
    notifications.permission = "authorized";
    const secureStore = new MemorySecureStore();
    const manager = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );
    const scheduled = await manager.optIn({
      scope,
      workspace: reviewWorkspace(),
      runtime: "supabase",
      localHour: 9,
      localMinute: 0
    });
    notifications.failCancel = true;

    await expect(manager.optOut(scope)).resolves.toEqual({
      kind: "cleanup-pending",
      cleanupPending: true
    });
    expect(notifications.scheduled.has(
      scheduled.notificationIdentifier ?? ""
    )).toBe(true);
    expect(
      secureStore.values.has(
        REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
      )
    ).toBe(true);

    notifications.failCancel = false;
    const restartedManager = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );
    await expect(
      restartedManager.retryPendingCleanup()
    ).resolves.toEqual({
      kind: "cancelled",
      cleanupPending: false
    });
    expect(notifications.scheduled.size).toBe(0);
    expect(notifications.cancelCalls).toContain(
      scheduled.notificationIdentifier
    );
    expect(
      secureStore.values.has(
        REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
      )
    ).toBe(false);
  });

  it("merges an account-B cleanup into account A's pending marker without losing A", async () => {
    const scopeA = authenticatedScope("a");
    const scopeB = authenticatedScope("b");
    const notifications = new MemoryNotificationPort();
    notifications.permission = "authorized";
    const secureStore = new MemorySecureStore();
    const manager = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );
    const scheduledA = await manager.optIn({
      scope: scopeA,
      workspace: reviewWorkspace(),
      runtime: "supabase",
      localHour: 9,
      localMinute: 0
    });
    notifications.failCancelWhen = (identifier) =>
      identifier.includes(scopeA.scopeId);

    await expect(manager.optOut(scopeA)).resolves.toEqual({
      kind: "cleanup-pending",
      cleanupPending: true
    });
    const markerAfterA = JSON.parse(
      secureStore.values.get(
        REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
      ) ?? "null"
    ) as {
      readonly mode: string;
      readonly scopeIds: readonly string[];
      readonly identifiers: readonly string[];
    };
    expect(markerAfterA.scopeIds).toContain(scopeA.scopeId);
    expect(markerAfterA.identifiers).toContain(
      scheduledA.notificationIdentifier
    );

    const requestedB =
      scopedReviewNotificationIdentifier(scopeB);
    notifications.scheduled.set(
      requestedB,
      new Date(2027, 0, 20, 9, 0, 0, 0)
    );
    await expect(manager.cancel(scopeB)).resolves.toEqual({
      kind: "cleanup-pending",
      cleanupPending: true
    });

    const mergedMarker = JSON.parse(
      secureStore.values.get(
        REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
      ) ?? "null"
    ) as {
      readonly mode: string;
      readonly scopeIds: readonly string[];
      readonly identifiers: readonly string[];
    };
    expect(mergedMarker.mode).toBe("scope");
    expect(mergedMarker.scopeIds).toEqual(
      expect.arrayContaining([scopeA.scopeId, scopeB.scopeId])
    );
    expect(mergedMarker.identifiers).toEqual(
      expect.arrayContaining([
        scheduledA.notificationIdentifier,
        requestedB
      ])
    );
    expect(notifications.scheduled.has(requestedB)).toBe(false);
    expect(
      notifications.scheduled.has(
        scheduledA.notificationIdentifier ?? ""
      )
    ).toBe(true);

    notifications.failCancelWhen = null;
    await expect(manager.retryPendingCleanup()).resolves.toEqual({
      kind: "cancelled",
      cleanupPending: false
    });
    expect(notifications.scheduled.size).toBe(0);
    expect(
      secureStore.values.has(
        REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
      )
    ).toBe(false);
  });

  it("keeps an all-mode checkpoint when more than 64 explicit IDs overflow the bounded journal", async () => {
    const scope = authenticatedScope("a");
    const notifications = new MemoryNotificationPort();
    const secureStore = new MemorySecureStore();
    const manager = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );
    const identifiers = Array.from(
      { length: 70 },
      (_, index) => `alyr-overflow-native-${index}`
    );
    for (const identifier of identifiers) {
      notifications.scheduled.set(
        identifier,
        new Date(2027, 0, 20, 9, 0, 0, 0)
      );
    }
    secureStore.values.set(
      REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        mode: "scope",
        scopeIds: [scope.scopeId],
        identifiers
      })
    );

    await expect(manager.retryPendingCleanup()).resolves.toEqual({
      kind: "cleanup-pending",
      cleanupPending: true
    });

    expect(notifications.scheduled.size).toBe(0);
    expect(notifications.listCalls).toBeGreaterThanOrEqual(2);
    for (const identifier of identifiers) {
      expect(notifications.cancelCalls).toContain(identifier);
    }
    const checkpoint = JSON.parse(
      secureStore.values.get(
        REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
      ) ?? "null"
    ) as {
      readonly mode: string;
      readonly scopeIds: readonly string[];
      readonly identifiers: readonly string[];
    };
    expect(checkpoint.mode).toBe("all");
    expect(checkpoint.scopeIds.length).toBeLessThanOrEqual(32);
    expect(checkpoint.identifiers.length).toBeLessThanOrEqual(64);

    await expect(manager.retryPendingCleanup()).resolves.toEqual({
      kind: "cancelled",
      cleanupPending: false
    });
    expect(
      secureStore.values.has(
        REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
      )
    ).toBe(false);
  });

  it("drains every scheduled ID while more than 32 scopes overflow the bounded journal", async () => {
    const scopes = Array.from(
      { length: 33 },
      (_, index) => authenticatedScopeAt(index + 1)
    );
    const identifiers = scopes.map((scope) =>
      scopedReviewNotificationIdentifier(scope)
    );
    const notifications = new MemoryNotificationPort();
    const secureStore = new MemorySecureStore();
    const manager = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );
    for (const identifier of identifiers) {
      notifications.scheduled.set(
        identifier,
        new Date(2027, 0, 20, 9, 0, 0, 0)
      );
    }
    secureStore.values.set(
      REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        mode: "scope",
        scopeIds: scopes.map((scope) => scope.scopeId),
        identifiers: []
      })
    );

    await expect(manager.retryPendingCleanup()).resolves.toEqual({
      kind: "cleanup-pending",
      cleanupPending: true
    });
    expect(notifications.scheduled.size).toBe(0);
    expect(notifications.listCalls).toBeGreaterThanOrEqual(2);
    for (const identifier of identifiers) {
      expect(notifications.cancelCalls).toContain(identifier);
    }
    const checkpoint = JSON.parse(
      secureStore.values.get(
        REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
      ) ?? "null"
    ) as {
      readonly mode: string;
      readonly scopeIds: readonly string[];
      readonly identifiers: readonly string[];
    };
    expect(checkpoint.mode).toBe("all");
    expect(checkpoint.scopeIds).toHaveLength(32);
    expect(checkpoint.identifiers.length).toBeLessThanOrEqual(64);

    await expect(manager.retryPendingCleanup()).resolves.toEqual({
      kind: "cancelled",
      cleanupPending: false
    });
  });

  it("restarts from a capped overflow marker, drains dropped scoped IDs, and leaves non-prefixed IDs untouched", async () => {
    const scopes = Array.from(
      { length: 70 },
      (_, index) => authenticatedScopeAt(index + 100)
    );
    const scopedIdentifiers = scopes.map((scope) =>
      scopedReviewNotificationIdentifier(scope)
    );
    const unownedIdentifier = "provider-generated-unowned-id";
    const notifications = new MemoryNotificationPort();
    const secureStore = new MemorySecureStore();
    for (const identifier of [
      ...scopedIdentifiers,
      unownedIdentifier
    ]) {
      notifications.scheduled.set(
        identifier,
        new Date(2027, 0, 20, 9, 0, 0, 0)
      );
    }
    secureStore.values.set(
      REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        mode: "all",
        scopeIds: scopes
          .slice(0, 32)
          .map((scope) => scope.scopeId),
        identifiers: scopedIdentifiers.slice(0, 64),
        overflow: true
      })
    );

    const restartedManager = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );
    await expect(
      restartedManager.retryPendingCleanup()
    ).resolves.toEqual({
      kind: "cleanup-pending",
      cleanupPending: true
    });
    for (const identifier of scopedIdentifiers) {
      expect(notifications.scheduled.has(identifier)).toBe(false);
      expect(notifications.cancelCalls).toContain(identifier);
    }
    expect(notifications.scheduled.has(unownedIdentifier)).toBe(true);
    expect(notifications.cancelCalls).not.toContain(
      unownedIdentifier
    );

    const secondRestart = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );
    await expect(
      secondRestart.retryPendingCleanup()
    ).resolves.toEqual({
      kind: "cleanup-pending",
      cleanupPending: true
    });
    expect(notifications.scheduled.has(unownedIdentifier)).toBe(true);

    const thirdRestart = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );
    await expect(
      thirdRestart.retryPendingCleanup()
    ).resolves.toEqual({
      kind: "cancelled",
      cleanupPending: false
    });
    expect(notifications.scheduled.has(unownedIdentifier)).toBe(true);
    expect(
      secureStore.values.has(
        REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
      )
    ).toBe(false);
  });

  it("retains failing account B when B merges after account A has prepared removal", async () => {
    const scopeA = authenticatedScope("a");
    const scopeB = authenticatedScope("b");
    const notifications = new MemoryNotificationPort();
    const secureStore = new MemorySecureStore();
    const managerA = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );
    const managerB = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );
    const aPreparedRemoval = deferred();
    const releaseA = deferred();
    let heldA = false;
    secureStore.beforeRemoveWhen = async (key) => {
      if (
        !heldA &&
        key === reviewReminderStorageKeys(scopeA).schedule
      ) {
        heldA = true;
        aPreparedRemoval.resolve();
        await releaseA.promise;
      }
    };

    const cancelA = managerA.cancel(scopeA);
    await aPreparedRemoval.promise;
    notifications.failCancelWhen = (identifier) =>
      identifier.includes(scopeB.scopeId);
    await expect(managerB.cancel(scopeB)).resolves.toEqual({
      kind: "cleanup-pending",
      cleanupPending: true
    });
    const merged = JSON.parse(
      secureStore.values.get(
        REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
      ) ?? "null"
    ) as {
      readonly scopeIds: readonly string[];
      readonly identifiers: readonly string[];
    };
    expect(merged.scopeIds).toEqual(
      expect.arrayContaining([scopeA.scopeId, scopeB.scopeId])
    );

    releaseA.resolve();
    await expect(cancelA).resolves.toEqual({
      kind: "cleanup-pending",
      cleanupPending: true
    });
    const surviving = JSON.parse(
      secureStore.values.get(
        REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
      ) ?? "null"
    ) as {
      readonly scopeIds: readonly string[];
      readonly identifiers: readonly string[];
    };
    expect(surviving.scopeIds).toContain(scopeB.scopeId);
    expect(surviving.identifiers).toContain(
      scopedReviewNotificationIdentifier(scopeB)
    );

    secureStore.beforeRemoveWhen = null;
    notifications.failCancelWhen = null;
    await expect(managerA.retryPendingCleanup()).resolves.toEqual({
      kind: "cancelled",
      cleanupPending: false
    });
  });

  it("serializes compare-remove against a second manager writing a failing cleanup", async () => {
    const scopeA = authenticatedScope("a");
    const scopeB = authenticatedScope("b");
    const notifications = new MemoryNotificationPort();
    const secureStore = new MemorySecureStore();
    const managerA = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );
    const managerB = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );
    const compareRead = deferred();
    const releaseCompare = deferred();
    const aPreparedRemoval = deferred();
    const releaseScheduleRemoval = deferred();
    let heldScheduleRemoval = false;
    let heldCompareRead = false;
    secureStore.beforeRemoveWhen = async (key) => {
      if (
        !heldScheduleRemoval &&
        key === reviewReminderStorageKeys(scopeA).schedule
      ) {
        heldScheduleRemoval = true;
        aPreparedRemoval.resolve();
        await releaseScheduleRemoval.promise;
      }
    };

    const cancelA = managerA.cancel(scopeA);
    await aPreparedRemoval.promise;
    secureStore.afterGetWhen = async (key) => {
      if (
        !heldCompareRead &&
        key === REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
      ) {
        heldCompareRead = true;
        compareRead.resolve();
        await releaseCompare.promise;
      }
    };
    releaseScheduleRemoval.resolve();
    await compareRead.promise;

    notifications.failCancelWhen = (identifier) =>
      identifier.includes(scopeB.scopeId);
    const cancelB = managerB.cancel(scopeB);
    await Promise.resolve();
    await Promise.resolve();
    expect(
      secureStore.values.get(
        REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
      )
    ).toContain(scopeA.scopeId);

    releaseCompare.resolve();
    await expect(cancelA).resolves.toEqual({
      kind: "cancelled",
      cleanupPending: false
    });
    await expect(cancelB).resolves.toEqual({
      kind: "cleanup-pending",
      cleanupPending: true
    });
    const marker = JSON.parse(
      secureStore.values.get(
        REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
      ) ?? "null"
    ) as {
      readonly scopeIds: readonly string[];
      readonly identifiers: readonly string[];
    };
    expect(marker.scopeIds).toEqual([scopeB.scopeId]);
    expect(marker.identifiers).toContain(
      scopedReviewNotificationIdentifier(scopeB)
    );

    secureStore.afterGetWhen = null;
    secureStore.beforeRemoveWhen = null;
    notifications.failCancelWhen = null;
    await expect(managerA.retryPendingCleanup()).resolves.toEqual({
      kind: "cancelled",
      cleanupPending: false
    });
  });

  it("upgrades a scoped pending marker to all-mode during sign-out cleanup", async () => {
    const scope = authenticatedScope("a");
    const notifications = new MemoryNotificationPort();
    notifications.permission = "authorized";
    const secureStore = new MemorySecureStore();
    const manager = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );
    const scheduled = await manager.optIn({
      scope,
      workspace: reviewWorkspace(),
      runtime: "supabase",
      localHour: 9,
      localMinute: 0
    });
    notifications.failCancelWhen = (identifier) =>
      identifier.includes(scope.scopeId);
    await manager.optOut(scope);

    await expect(manager.cancel(null)).resolves.toEqual({
      kind: "cleanup-pending",
      cleanupPending: true
    });
    const marker = JSON.parse(
      secureStore.values.get(
        REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
      ) ?? "null"
    ) as {
      readonly mode: string;
      readonly scopeIds: readonly string[];
      readonly identifiers: readonly string[];
    };
    expect(marker.mode).toBe("all");
    expect(marker.scopeIds).toContain(scope.scopeId);
    expect(marker.identifiers).toContain(
      scheduled.notificationIdentifier
    );

    notifications.failCancelWhen = null;
    await expect(manager.retryPendingCleanup()).resolves.toEqual({
      kind: "cancelled",
      cleanupPending: false
    });
  });

  it("salvages bounded targets from a corrupt marker and fails closed to all cleanup", async () => {
    const scopeA = authenticatedScope("a");
    const scopeB = authenticatedScope("b");
    const notifications = new MemoryNotificationPort();
    notifications.permission = "authorized";
    const secureStore = new MemorySecureStore();
    const manager = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );
    const scheduledA = await manager.optIn({
      scope: scopeA,
      workspace: reviewWorkspace(),
      runtime: "supabase",
      localHour: 9,
      localMinute: 0
    });
    secureStore.values.set(
      REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY,
      JSON.stringify({
        version: 99,
        mode: "scope",
        scopeIds: [scopeA.scopeId],
        identifiers: [scheduledA.notificationIdentifier]
      })
    );
    notifications.failCancelWhen = (identifier) =>
      identifier.includes(scopeA.scopeId);
    const requestedB =
      scopedReviewNotificationIdentifier(scopeB);
    notifications.scheduled.set(
      requestedB,
      new Date(2027, 0, 20, 9, 0, 0, 0)
    );

    await expect(manager.cancel(scopeB)).resolves.toEqual({
      kind: "cleanup-pending",
      cleanupPending: true
    });
    const marker = JSON.parse(
      secureStore.values.get(
        REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
      ) ?? "null"
    ) as {
      readonly mode: string;
      readonly scopeIds: readonly string[];
      readonly identifiers: readonly string[];
    };
    expect(marker.mode).toBe("all");
    expect(marker.scopeIds).toEqual(
      expect.arrayContaining([scopeA.scopeId, scopeB.scopeId])
    );
    expect(marker.identifiers).toEqual(
      expect.arrayContaining([
        scheduledA.notificationIdentifier,
        requestedB
      ])
    );

    notifications.failCancelWhen = null;
    await expect(manager.retryPendingCleanup()).resolves.toEqual({
      kind: "cleanup-pending",
      cleanupPending: true
    });
    await expect(manager.retryPendingCleanup()).resolves.toEqual({
      kind: "cancelled",
      cleanupPending: false
    });
  });

  it("still journals and completes OS cancellation when disabling the stored preference fails", async () => {
    const scope = authenticatedScope("a");
    const notifications = new MemoryNotificationPort();
    notifications.permission = "authorized";
    const secureStore = new MemorySecureStore();
    const manager = new LocalReviewReminderManager(
      notifications,
      secureStore,
      () => new Date(FIXED_NOW)
    );
    const scheduled = await manager.optIn({
      scope,
      workspace: reviewWorkspace(),
      runtime: "supabase",
      localHour: 9,
      localMinute: 0
    });
    secureStore.failSetWhen = (key) =>
      key === reviewReminderStorageKeys(scope).preferences;

    await expect(manager.optOut(scope)).rejects.toThrow(
      "Synthetic secure storage failure"
    );
    expect(notifications.scheduled.size).toBe(0);
    expect(notifications.cancelCalls).toContain(
      scheduled.notificationIdentifier
    );
    expect(
      secureStore.values.has(
        REVIEW_REMINDER_CLEANUP_PENDING_STORAGE_KEY
      )
    ).toBe(false);
  });

  it("never schedules sample/device-preview context even through opt-in", async () => {
    const notifications = new MemoryNotificationPort();
    const manager = new LocalReviewReminderManager(
      notifications,
      new MemorySecureStore(),
      () => new Date(FIXED_NOW)
    );

    await expect(
      manager.optIn({
        scope: DEVICE_PREVIEW_VAULT_SCOPE,
        workspace: createWorkspace("sample"),
        runtime: "preview",
        localHour: 9,
        localMinute: 0
      })
    ).resolves.toMatchObject({ kind: "inactive" });
    expect(notifications.getPermissionCalls).toBe(0);
    expect(notifications.requestCalls).toBe(0);
    expect(notifications.scheduleCalls).toHaveLength(0);
  });
});

describe("local calendar review trigger", () => {
  it("preserves a future local calendar time", () => {
    const date = reviewReminderTriggerDate(
      {
        kind: "local-calendar",
        date: "2027-01-20",
        hour: 8,
        minute: 45
      },
      FIXED_NOW
    );

    expect([
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
      date.getHours(),
      date.getMinutes()
    ]).toEqual([2027, 1, 20, 8, 45]);
  });

  it("moves an already-due review to the next chosen local time", () => {
    const date = reviewReminderTriggerDate(
      {
        kind: "local-calendar",
        date: "2026-01-20",
        hour: 9,
        minute: 0
      },
      FIXED_NOW
    );
    const tomorrow = new Date(FIXED_NOW);
    tomorrow.setDate(tomorrow.getDate() + 1);

    expect([
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes()
    ]).toEqual([
      tomorrow.getFullYear(),
      tomorrow.getMonth(),
      tomorrow.getDate(),
      9,
      0
    ]);
  });
});
