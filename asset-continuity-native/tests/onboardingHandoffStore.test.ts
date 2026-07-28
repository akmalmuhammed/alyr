import {
  createOnboardingHandoffStore,
  type OnboardingHandoffStoreDriver
} from "@/deviceAuth/onboardingHandoffStore";

function memoryDriver(initial: string | null = null) {
  let value = initial;
  const driver: OnboardingHandoffStoreDriver = {
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

describe("subject-scoped onboarding handoff store", () => {
  it("persists and clears the exact first-record intent for its subject", async () => {
    const memory = memoryDriver();
    const store = createOnboardingHandoffStore(memory.driver);

    await store.save("account-a:household-a", "place", 10_000);
    await expect(
      store.load("account-a:household-a")
    ).resolves.toBe("place");
    await store.clear("account-a:household-a");
    await expect(
      store.load("account-a:household-a")
    ).resolves.toBeNull();
    expect(memory.driver.remove).toHaveBeenCalledTimes(1);
  });

  it("does not reveal or delete another subject's continuation", async () => {
    const memory = memoryDriver();
    const store = createOnboardingHandoffStore(memory.driver);
    await store.save("account-a:household-a", "item", 20_000);
    const original = memory.value();

    await expect(
      store.load("account-b:household-b")
    ).resolves.toBeNull();
    await store.clear("account-b:household-b");

    expect(memory.value()).toBe(original);
    expect(memory.driver.remove).not.toHaveBeenCalled();
    await expect(
      store.load("account-a:household-a")
    ).resolves.toBe("item");
  });

  it("ignores malformed or unversioned records", async () => {
    const malformed = memoryDriver(
      JSON.stringify({
        version: 2,
        subjectId: "account-a:household-a",
        intent: "place",
        createdAt: 10
      })
    );
    const malformedStore = createOnboardingHandoffStore(
      malformed.driver
    );
    await expect(
      malformedStore.load("account-a:household-a")
    ).resolves.toBeNull();

    const invalidJson = memoryDriver("{not-json");
    const invalidStore = createOnboardingHandoffStore(
      invalidJson.driver
    );
    await expect(
      invalidStore.load("account-a:household-a")
    ).resolves.toBeNull();
  });

  it("serializes reads behind writes and recovers its queue after a failed operation", async () => {
    let value: string | null = null;
    let releaseFirstWrite: () => void = () => undefined;
    let failNextWrite = false;
    const driver: OnboardingHandoffStoreDriver = {
      get: jest.fn(async () => value),
      set: jest.fn(async (_key, nextValue) => {
        if (failNextWrite) {
          failNextWrite = false;
          throw new Error("write failed");
        }
        await new Promise<void>((resolve) => {
          releaseFirstWrite = resolve;
        });
        value = nextValue;
      }),
      remove: jest.fn(async () => {
        value = null;
      })
    };
    const store = createOnboardingHandoffStore(driver);
    const save = store.save(
      "account-a:household-a",
      "place",
      30_000
    );
    const load = store.load("account-a:household-a");
    await Promise.resolve();
    expect(driver.get).not.toHaveBeenCalled();
    releaseFirstWrite();
    await expect(save).resolves.toBeUndefined();
    await expect(load).resolves.toBe("place");

    failNextWrite = true;
    await expect(
      store.save("account-a:household-a", "item", 40_000)
    ).rejects.toThrow("write failed");

    let releaseRecoveryWrite: () => void = () => undefined;
    (driver.set as jest.Mock).mockImplementationOnce(
      async (_key: string, nextValue: string) => {
        await new Promise<void>((resolve) => {
          releaseRecoveryWrite = resolve;
        });
        value = nextValue;
      }
    );
    const recovery = store.save(
      "account-a:household-a",
      "item",
      50_000
    );
    await Promise.resolve();
    releaseRecoveryWrite();
    await expect(recovery).resolves.toBeUndefined();
    await expect(
      store.load("account-a:household-a")
    ).resolves.toBe("item");
  });
});
