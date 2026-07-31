import SQLiteStorage from "expo-sqlite/kv-store";
import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import { Platform } from "react-native";

export const ONBOARDING_SEEN_KEY =
  "asset-continuity.first-run-intro.v1";

const STORED_SEEN_VALUE = "seen";

export interface OnboardingSeenStoreDriver {
  readonly get: (key: string) => Promise<string | null>;
  readonly set: (key: string, value: string) => Promise<void>;
  readonly remove: (key: string) => Promise<void>;
}

export interface OnboardingSeenWebStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
}

export interface OnboardingSeenStore {
  readonly load: () => Promise<boolean>;
  readonly markSeen: () => Promise<void>;
  /**
   * Explicit development/test reset. Signing out must not call this method.
   */
  readonly reset: () => Promise<void>;
}

export interface OnboardingSeenStatus {
  readonly status:
    | "loading"
    | "unseen"
    | "seen"
    | "unavailable";
  readonly ready: boolean;
  readonly seen: boolean;
  /**
   * Updates the visible state before persistence so storage trouble never
   * traps a person inside the introduction.
   */
  readonly markSeen: () => Promise<void>;
}

function parseStoredSeen(value: string | null): boolean {
  return value === STORED_SEEN_VALUE;
}

export function createOnboardingSeenStore(
  driver: OnboardingSeenStoreDriver
): OnboardingSeenStore {
  let queue: Promise<unknown> = Promise.resolve();
  let seenForThisSession = false;
  let persistenceConfirmed = false;

  const exclusive = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation, operation);
    queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };

  return {
    load() {
      return exclusive(async () => {
        if (persistenceConfirmed) return true;
        try {
          const stored = parseStoredSeen(
            await driver.get(ONBOARDING_SEEN_KEY)
          );
          if (stored) {
            seenForThisSession = true;
            persistenceConfirmed = true;
          }
          return stored || seenForThisSession;
        } catch (error) {
          if (seenForThisSession) return true;
          throw error;
        }
      });
    },
    markSeen() {
      return exclusive(async () => {
        seenForThisSession = true;
        if (persistenceConfirmed) return;
        // Setting the same literal is idempotent and, unlike a read-before-
        // write sequence, still succeeds if only reads are unavailable.
        await driver.set(
          ONBOARDING_SEEN_KEY,
          STORED_SEEN_VALUE
        );
        persistenceConfirmed = true;
      });
    },
    reset() {
      return exclusive(async () => {
        seenForThisSession = false;
        persistenceConfirmed = false;
        await driver.remove(ONBOARDING_SEEN_KEY);
      });
    }
  };
}

function resolveWebStorage(): OnboardingSeenWebStorage | null {
  try {
    const candidate = (
      globalThis as typeof globalThis & {
        readonly localStorage?: OnboardingSeenWebStorage;
      }
    ).localStorage;
    return candidate ?? null;
  } catch {
    return null;
  }
}

export function createWebOnboardingSeenDriver(
  storage: OnboardingSeenWebStorage | null = resolveWebStorage()
): OnboardingSeenStoreDriver {
  return {
    async get(key) {
      return storage?.getItem(key) ?? null;
    },
    async set(key, value) {
      storage?.setItem(key, value);
    },
    async remove(key) {
      storage?.removeItem(key);
    }
  };
}

export function createNativeOnboardingSeenDriver(): OnboardingSeenStoreDriver {
  return {
    get(key) {
      return SQLiteStorage.getItemAsync(key);
    },
    async set(key, value) {
      await SQLiteStorage.setItemAsync(key, value);
    },
    async remove(key) {
      await SQLiteStorage.removeItemAsync(key);
    }
  };
}

export const onboardingSeenStore = createOnboardingSeenStore(
  Platform.OS === "web"
    ? createWebOnboardingSeenDriver()
    : createNativeOnboardingSeenDriver()
);

export function useOnboardingSeenStatus(
  store: OnboardingSeenStore = onboardingSeenStore
): OnboardingSeenStatus {
  const [ready, setReady] = useState(false);
  const [seen, setSeen] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const markedSeen = useRef(false);

  useEffect(() => {
    let active = true;
    setReady(false);
    setUnavailable(false);
    void store
      .load()
      .then((storedSeen) => {
        if (active && !markedSeen.current) {
          setSeen(storedSeen);
        }
      })
      .catch(() => {
        // A preference read must not block the first screen. The current
        // session remains usable and markSeen will retry persistence.
        if (active && !markedSeen.current) {
          setUnavailable(true);
        }
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [store]);

  const markSeen = useCallback(async () => {
    markedSeen.current = true;
    setSeen(true);
    setUnavailable(false);
    try {
      await store.markSeen();
    } catch {
      // Keep the session moving. A subsequent call retries the durable write.
    }
  }, [store]);

  return {
    status: !ready
      ? "loading"
      : seen
        ? "seen"
        : unavailable
          ? "unavailable"
          : "unseen",
    ready,
    seen,
    markSeen
  };
}
