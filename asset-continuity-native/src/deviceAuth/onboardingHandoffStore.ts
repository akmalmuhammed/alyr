import * as SecureStore from "expo-secure-store";

import type { OnboardingFirstRecordIntent } from "./types";

const STORE_KEY = "alyr.device-auth.onboarding-handoff.v1";
const STORE_VERSION = 1;

interface StoredOnboardingHandoff {
  readonly version: typeof STORE_VERSION;
  readonly subjectId: string;
  readonly intent: OnboardingFirstRecordIntent;
  readonly createdAt: number;
}

export interface OnboardingHandoffStore {
  readonly load: (
    subjectId: string
  ) => Promise<OnboardingFirstRecordIntent | null>;
  readonly save: (
    subjectId: string,
    intent: OnboardingFirstRecordIntent,
    createdAt: number
  ) => Promise<void>;
  readonly clear: (subjectId: string) => Promise<void>;
}

export interface OnboardingHandoffStoreDriver {
  readonly get: (key: string) => Promise<string | null>;
  readonly set: (key: string, value: string) => Promise<void>;
  readonly remove: (key: string) => Promise<void>;
}

function validSubjectId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 1_024 &&
    !/[\u0000-\u001f\u007f-\u009f]/u.test(value)
  );
}

function parseStoredHandoff(
  value: string | null
): StoredOnboardingHandoff | null {
  if (!value || value.length > 4_096) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      parsed.version !== STORE_VERSION ||
      !("subjectId" in parsed) ||
      !validSubjectId(parsed.subjectId) ||
      !("intent" in parsed) ||
      (parsed.intent !== "item" && parsed.intent !== "place") ||
      !("createdAt" in parsed) ||
      typeof parsed.createdAt !== "number" ||
      !Number.isSafeInteger(parsed.createdAt) ||
      parsed.createdAt < 0
    ) {
      return null;
    }
    return parsed as StoredOnboardingHandoff;
  } catch {
    return null;
  }
}

export function createOnboardingHandoffStore(
  driver: OnboardingHandoffStoreDriver
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

  return {
    load(subjectId) {
      return exclusive(async () => {
        if (!validSubjectId(subjectId)) return null;
        const stored = parseStoredHandoff(
          await driver.get(STORE_KEY)
        );
        return stored?.subjectId === subjectId
          ? stored.intent
          : null;
      });
    },
    save(subjectId, intent, createdAt) {
      return exclusive(async () => {
        if (
          !validSubjectId(subjectId) ||
          (intent !== "item" && intent !== "place") ||
          !Number.isSafeInteger(createdAt) ||
          createdAt < 0
        ) {
          throw new Error(
            "The onboarding handoff record is invalid."
          );
        }
        const record: StoredOnboardingHandoff = {
          version: STORE_VERSION,
          subjectId,
          intent,
          createdAt
        };
        await driver.set(STORE_KEY, JSON.stringify(record));
      });
    },
    clear(subjectId) {
      return exclusive(async () => {
        if (!validSubjectId(subjectId)) return;
        const stored = parseStoredHandoff(
          await driver.get(STORE_KEY)
        );
        if (stored?.subjectId === subjectId) {
          await driver.remove(STORE_KEY);
        }
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
