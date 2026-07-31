import {
  act,
  renderHook,
  waitFor
} from "@testing-library/react-native";

import {
  createOnboardingSeenStore,
  createWebOnboardingSeenDriver,
  ONBOARDING_SEEN_KEY,
  type OnboardingSeenStore,
  type OnboardingSeenStoreDriver,
  type OnboardingSeenWebStorage,
  useOnboardingSeenStatus
} from "@/onboarding/onboardingSeenStore";

function memoryDriver(initial: string | null = null) {
  let value = initial;
  const driver: OnboardingSeenStoreDriver = {
    get: jest.fn(async () => value),
    set: jest.fn(async (_key, nextValue) => {
      value = nextValue;
    }),
    remove: jest.fn(async () => {
      value = null;
    })
  };
  return {
    driver,
    value: () => value
  };
}

describe("Worldline onboarding seen store", () => {
  it("persists completion idempotently and restores it after restart", async () => {
    const memory = memoryDriver();
    const firstProcess = createOnboardingSeenStore(memory.driver);

    await expect(firstProcess.load()).resolves.toBe(false);
    await firstProcess.markSeen();
    await firstProcess.markSeen();

    expect(memory.driver.set).toHaveBeenCalledTimes(1);
    expect(memory.driver.set).toHaveBeenCalledWith(
      ONBOARDING_SEEN_KEY,
      "seen"
    );

    const restartedProcess = createOnboardingSeenStore(
      memory.driver
    );
    await expect(restartedProcess.load()).resolves.toBe(true);
  });

  it("treats malformed state as unseen and allows an explicit reset", async () => {
    const memory = memoryDriver("{not-json");
    const store = createOnboardingSeenStore(memory.driver);

    await expect(store.load()).resolves.toBe(false);
    await store.markSeen();
    await store.reset();

    await expect(store.load()).resolves.toBe(false);
    expect(memory.driver.remove).toHaveBeenCalledWith(
      ONBOARDING_SEEN_KEY
    );
  });

  it("keeps a completed session seen when durable storage temporarily fails", async () => {
    let failWrite = true;
    const driver: OnboardingSeenStoreDriver = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => {
        if (failWrite) {
          failWrite = false;
          throw new Error("storage unavailable");
        }
      }),
      remove: jest.fn(async () => undefined)
    };
    const store = createOnboardingSeenStore(driver);

    await expect(store.markSeen()).rejects.toThrow(
      "storage unavailable"
    );
    await expect(store.load()).resolves.toBe(true);
    await expect(store.markSeen()).resolves.toBeUndefined();
    expect(driver.set).toHaveBeenCalledTimes(2);
  });

  it("can persist completion when a read is unavailable", async () => {
    const driver: OnboardingSeenStoreDriver = {
      get: jest.fn(async () => {
        throw new Error("read unavailable");
      }),
      set: jest.fn(async () => undefined),
      remove: jest.fn(async () => undefined)
    };
    const store = createOnboardingSeenStore(driver);

    await expect(store.load()).rejects.toThrow("read unavailable");
    await expect(store.markSeen()).resolves.toBeUndefined();
    expect(driver.set).toHaveBeenCalledWith(
      ONBOARDING_SEEN_KEY,
      "seen"
    );
  });

  it("uses the supplied browser localStorage implementation", async () => {
    const values = new Map<string, string>();
    const storage: OnboardingSeenWebStorage = {
      getItem: jest.fn((key) => values.get(key) ?? null),
      setItem: jest.fn((key, value) => {
        values.set(key, value);
      }),
      removeItem: jest.fn((key) => {
        values.delete(key);
      })
    };
    const driver = createWebOnboardingSeenDriver(storage);
    const store = createOnboardingSeenStore(driver);

    await store.markSeen();
    expect(values.has(ONBOARDING_SEEN_KEY)).toBe(true);
    await store.reset();
    expect(values.has(ONBOARDING_SEEN_KEY)).toBe(false);
  });
});

describe("useOnboardingSeenStatus", () => {
  it("hydrates persisted completion", async () => {
    const store: OnboardingSeenStore = {
      load: jest.fn(async () => true),
      markSeen: jest.fn(async () => undefined),
      reset: jest.fn(async () => undefined)
    };
    const hook = await renderHook(() =>
      useOnboardingSeenStatus(store)
    );

    await waitFor(() => {
      expect(hook.result.current).toMatchObject({
        status: "seen",
        ready: true,
        seen: true
      });
    });
  });

  it("moves immediately when persistence is unavailable", async () => {
    const store: OnboardingSeenStore = {
      load: jest.fn(async () => false),
      markSeen: jest.fn(async () => {
        throw new Error("storage unavailable");
      }),
      reset: jest.fn(async () => undefined)
    };
    const hook = await renderHook(() =>
      useOnboardingSeenStatus(store)
    );
    await waitFor(() => expect(hook.result.current.ready).toBe(true));

    await act(async () => {
      await hook.result.current.markSeen();
    });

    expect(hook.result.current.seen).toBe(true);
    expect(hook.result.current.status).toBe("seen");
    expect(store.markSeen).toHaveBeenCalledTimes(1);
  });

  it("does not let a late load overwrite an explicit completion", async () => {
    let finishLoad: (seen: boolean) => void = () => undefined;
    const store: OnboardingSeenStore = {
      load: jest.fn(
        () =>
          new Promise<boolean>((resolve) => {
            finishLoad = resolve;
          })
      ),
      markSeen: jest.fn(async () => undefined),
      reset: jest.fn(async () => undefined)
    };
    const hook = await renderHook(() =>
      useOnboardingSeenStatus(store)
    );

    await act(async () => {
      await hook.result.current.markSeen();
      finishLoad(false);
    });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));

    expect(hook.result.current.seen).toBe(true);
  });

  it("fails open with an unavailable status when hydration fails", async () => {
    const store: OnboardingSeenStore = {
      load: jest.fn(async () => {
        throw new Error("database unavailable");
      }),
      markSeen: jest.fn(async () => undefined),
      reset: jest.fn(async () => undefined)
    };
    const hook = await renderHook(() =>
      useOnboardingSeenStatus(store)
    );

    await waitFor(() =>
      expect(hook.result.current.status).toBe("unavailable")
    );
    expect(hook.result.current).toMatchObject({
      ready: true,
      seen: false
    });
  });
});
