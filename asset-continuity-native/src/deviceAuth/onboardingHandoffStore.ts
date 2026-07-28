import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import type { OnboardingFirstRecordIntent } from "./types";

const STORE_KEY = "alyr.device-auth.onboarding-handoff.v1";
const STORE_VERSION = 2;
const LEGACY_STORE_VERSION = 1;

export interface OnboardingHandoffRecord {
  readonly handoffId: string;
  readonly intent: OnboardingFirstRecordIntent;
  /**
   * Stable local aggregate identity reserved before capture starts. Reusing
   * this ID makes a commit-before-ack retry idempotent after process death.
   */
  readonly recordId: string;
  readonly createdAt: number;
}

interface StoredOnboardingHandoff extends OnboardingHandoffRecord {
  readonly version: typeof STORE_VERSION;
  readonly subjectId: string;
}

interface LegacyStoredOnboardingHandoff {
  readonly version: typeof LEGACY_STORE_VERSION;
  readonly subjectId: string;
  readonly intent: OnboardingFirstRecordIntent;
  readonly createdAt: number;
}

export interface OnboardingHandoffIdentity {
  readonly handoffId: string;
  readonly recordId: string;
}

export interface OnboardingHandoffStore {
  /**
   * Kept for compatibility with the lock gate. New continuation work should
   * use `loadRecord`, which carries the stable aggregate identity.
   */
  readonly load: (
    subjectId: string
  ) => Promise<OnboardingFirstRecordIntent | null>;
  readonly loadRecord: (
    subjectId: string
  ) => Promise<OnboardingHandoffRecord | null>;
  readonly save: (
    subjectId: string,
    intent: OnboardingFirstRecordIntent,
    createdAt: number,
    identity?: OnboardingHandoffIdentity
  ) => Promise<void>;
  /**
   * When a handoff ID is supplied, a stale acknowledgement cannot erase a
   * newer first-record continuation for the same subject.
   */
  readonly clear: (
    subjectId: string,
    handoffId?: string
  ) => Promise<boolean>;
}

export interface OnboardingHandoffStoreDriver {
  readonly get: (key: string) => Promise<string | null>;
  readonly set: (key: string, value: string) => Promise<void>;
  readonly remove: (key: string) => Promise<void>;
}

function validOpaqueId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 1_024 &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(value)
  );
}

function validSubjectId(value: unknown): value is string {
  return validOpaqueId(value);
}

function validIntent(
  value: unknown
): value is OnboardingFirstRecordIntent {
  return value === "item" || value === "place";
}

function validCreatedAt(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function parseStoredHandoff(
  value: string | null
): StoredOnboardingHandoff | LegacyStoredOnboardingHandoff | null {
  if (!value || value.length > 8_192) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      !("subjectId" in parsed) ||
      !validSubjectId(parsed.subjectId) ||
      !("intent" in parsed) ||
      !validIntent(parsed.intent) ||
      !("createdAt" in parsed) ||
      !validCreatedAt(parsed.createdAt)
    ) {
      return null;
    }

    if (parsed.version === LEGACY_STORE_VERSION) {
      return parsed as LegacyStoredOnboardingHandoff;
    }
    if (
      parsed.version !== STORE_VERSION ||
      !("handoffId" in parsed) ||
      !validOpaqueId(parsed.handoffId) ||
      !("recordId" in parsed) ||
      !validOpaqueId(parsed.recordId)
    ) {
      return null;
    }
    return parsed as StoredOnboardingHandoff;
  } catch {
    return null;
  }
}

function publicRecord(
  stored: StoredOnboardingHandoff
): OnboardingHandoffRecord {
  return {
    handoffId: stored.handoffId,
    intent: stored.intent,
    recordId: stored.recordId,
    createdAt: stored.createdAt
  };
}

export function createOnboardingHandoffStore(
  driver: OnboardingHandoffStoreDriver,
  createId: () => string = () => Crypto.randomUUID()
): OnboardingHandoffStore {
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation, operation);
    queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };

  const loadStoredRecord = async (
    subjectId: string
  ): Promise<StoredOnboardingHandoff | null> => {
    if (!validSubjectId(subjectId)) return null;
    const stored = parseStoredHandoff(await driver.get(STORE_KEY));
    if (!stored || stored.subjectId !== subjectId) return null;

    if (stored.version === STORE_VERSION) {
      return stored;
    }

    // Upgrade V1 in place before exposing it. Both identities are then durable
    // before routing, so a later process restart reuses the same aggregate.
    const upgraded: StoredOnboardingHandoff = {
      version: STORE_VERSION,
      subjectId: stored.subjectId,
      intent: stored.intent,
      createdAt: stored.createdAt,
      handoffId: createId(),
      recordId: createId()
    };
    if (
      !validOpaqueId(upgraded.handoffId) ||
      !validOpaqueId(upgraded.recordId)
    ) {
      throw new Error("The onboarding handoff identity is invalid.");
    }
    await driver.set(STORE_KEY, JSON.stringify(upgraded));
    return upgraded;
  };

  return {
    load(subjectId) {
      return exclusive(async () => {
        const stored = await loadStoredRecord(subjectId);
        return stored?.intent ?? null;
      });
    },
    loadRecord(subjectId) {
      return exclusive(async () => {
        const stored = await loadStoredRecord(subjectId);
        return stored ? publicRecord(stored) : null;
      });
    },
    save(subjectId, intent, createdAt, identity) {
      return exclusive(async () => {
        const handoffId = identity?.handoffId ?? createId();
        const recordId = identity?.recordId ?? createId();
        if (
          !validSubjectId(subjectId) ||
          !validIntent(intent) ||
          !validCreatedAt(createdAt) ||
          !validOpaqueId(handoffId) ||
          !validOpaqueId(recordId)
        ) {
          throw new Error(
            "The onboarding handoff record is invalid."
          );
        }
        const record: StoredOnboardingHandoff = {
          version: STORE_VERSION,
          subjectId,
          intent,
          createdAt,
          handoffId,
          recordId
        };
        await driver.set(STORE_KEY, JSON.stringify(record));
      });
    },
    clear(subjectId, handoffId) {
      return exclusive(async () => {
        if (
          !validSubjectId(subjectId) ||
          (handoffId !== undefined && !validOpaqueId(handoffId))
        ) {
          return false;
        }
        const stored = parseStoredHandoff(await driver.get(STORE_KEY));
        // Deletion is idempotent: an absent record already satisfies the
        // acknowledgement. A different/newer record still returns false.
        if (!stored) return true;
        if (
          stored?.subjectId === subjectId &&
          (handoffId === undefined ||
            (stored.version === STORE_VERSION &&
              stored.handoffId === handoffId))
        ) {
          await driver.remove(STORE_KEY);
          return true;
        }
        return false;
      });
    }
  };
}

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
};

export const expoOnboardingHandoffStore =
  createOnboardingHandoffStore({
    get(key) {
      return SecureStore.getItemAsync(key, secureStoreOptions);
    },
    async set(key, value) {
      await SecureStore.setItemAsync(
        key,
        value,
        secureStoreOptions
      );
    },
    async remove(key) {
      await SecureStore.deleteItemAsync(key, secureStoreOptions);
    }
  });
