import {
  createPendingHouseholdProvisionStore,
  isPendingHouseholdProvisionReadError,
  PENDING_HOUSEHOLD_PROVISION_UNREADABLE,
  PendingHouseholdProvisionReadError,
  type PendingHouseholdProvisionStoreDriver
} from "@/auth/pendingHouseholdProvision";

const operationId = "00000000-0000-4000-8000-000000000071";
const householdId = "00000000-0000-4000-8000-000000000072";

function memoryDriver(values = new Map<string, string>()) {
  const driver: PendingHouseholdProvisionStoreDriver = {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    }
  };
  return { driver, values };
}

describe("pending household provision storage", () => {
  it("round-trips the caller-stable operation across store instances", async () => {
    const { driver, values } = memoryDriver();
    const firstProcess =
      createPendingHouseholdProvisionStore(driver);
    await firstProcess.write({
      accountId: "account-owner",
      operationId,
      householdId,
      name: "  Rahman household  ",
      createdAt: "2026-07-28T10:00:00.000Z"
    });

    const restartedProcess =
      createPendingHouseholdProvisionStore(driver);
    await expect(restartedProcess.read()).resolves.toEqual({
      accountId: "account-owner",
      operationId,
      householdId,
      name: "Rahman household",
      createdAt: "2026-07-28T10:00:00.000Z"
    });
    expect(values.size).toBe(1);

    await restartedProcess.clear();
    expect(values.size).toBe(0);
  });

  it("fails closed without erasing a malformed operation identity", async () => {
    const { driver, values } = memoryDriver(
      new Map([
        [
          "alyr.pending-household-provision.v1",
          JSON.stringify({
            version: 2,
            accountId: "account-owner",
            operationId: "not-a-uuid",
            householdId,
            name: "Rahman household",
            createdAt: "2026-07-28T10:00:00.000Z"
          })
        ]
      ])
    );
    const store = createPendingHouseholdProvisionStore(driver);

    await expect(store.read()).rejects.toMatchObject({
      name: "PendingHouseholdProvisionReadError",
      code: PENDING_HOUSEHOLD_PROVISION_UNREADABLE
    });
    expect(values.size).toBe(1);
  });

  it("keeps torn durable bytes blocked across process restarts", async () => {
    const storageKey = "alyr.pending-household-provision.v1";
    const { driver, values } = memoryDriver(
      new Map([[storageKey, '{"version":2,"accountId":"account-owner"']])
    );

    const firstProcess = createPendingHouseholdProvisionStore(driver);
    const firstRead = firstProcess.read().catch((error: unknown) => error);
    await expect(firstRead).resolves.toBeInstanceOf(
      PendingHouseholdProvisionReadError
    );
    expect(values.get(storageKey)).toBe(
      '{"version":2,"accountId":"account-owner"'
    );

    const restartedProcess =
      createPendingHouseholdProvisionStore(driver);
    const restartedRead = await restartedProcess
      .read()
      .catch((error: unknown) => error);
    expect(isPendingHouseholdProvisionReadError(restartedRead)).toBe(true);
    expect(values.has(storageKey)).toBe(true);
  });

  it("allows explicit signed-account cleanup to clear an unreadable marker", async () => {
    const storageKey = "alyr.pending-household-provision.v1";
    const { driver, values } = memoryDriver(
      new Map([[storageKey, "torn-ciphertext"]])
    );
    const store = createPendingHouseholdProvisionStore(driver);

    await expect(store.read()).rejects.toBeInstanceOf(
      PendingHouseholdProvisionReadError
    );
    expect(values.has(storageKey)).toBe(true);

    await store.clear();

    expect(values.has(storageKey)).toBe(false);
    await expect(store.read()).resolves.toBeNull();
  });

  it("normalizes a protected-storage read failure into the typed blocker", async () => {
    const removeItem = jest.fn(async () => undefined);
    const store = createPendingHouseholdProvisionStore({
      async getItem() {
        throw new Error("device key temporarily unavailable");
      },
      async setItem() {
        throw new Error("not used");
      },
      removeItem
    });

    const readFailure = await store.read().catch((error: unknown) => error);

    expect(isPendingHouseholdProvisionReadError(readFailure)).toBe(true);
    expect(removeItem).not.toHaveBeenCalled();
  });
});
