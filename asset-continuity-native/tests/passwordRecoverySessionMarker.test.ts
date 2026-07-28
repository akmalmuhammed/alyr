import {
  createPasswordRecoverySessionMarkerStore,
  type PasswordRecoverySessionMarkerStoreDriver
} from "@/auth/passwordRecoverySessionMarker";

const EXCHANGE_ID = "00000000-0000-4000-8000-000000000091";
const STARTED_AT = "2026-07-28T12:00:00.000Z";

function memoryDriver() {
  const values = new Map<string, string>();
  const driver: PasswordRecoverySessionMarkerStoreDriver = {
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

describe("password recovery session marker", () => {
  it("persists an exchange scope before binding the provider account", async () => {
    const memory = memoryDriver();
    const store = createPasswordRecoverySessionMarkerStore(
      memory.driver
    );

    await store.begin(EXCHANGE_ID, STARTED_AT);
    await expect(store.read()).resolves.toEqual({
      version: 1,
      exchangeId: EXCHANGE_ID,
      phase: "exchanging",
      scope: {
        kind: "exchange",
        exchangeId: EXCHANGE_ID
      },
      startedAt: STARTED_AT
    });

    await store.bindAccount(EXCHANGE_ID, " account-owner ");
    await expect(store.read()).resolves.toEqual({
      version: 1,
      exchangeId: EXCHANGE_ID,
      phase: "session-active",
      scope: {
        kind: "account",
        accountId: "account-owner"
      },
      startedAt: STARTED_AT
    });

    await store.clear();
    await expect(store.read()).resolves.toBeNull();
  });

  it("does not bind a different or missing exchange", async () => {
    const memory = memoryDriver();
    const store = createPasswordRecoverySessionMarkerStore(
      memory.driver
    );
    await store.begin(EXCHANGE_ID, STARTED_AT);

    await expect(
      store.bindAccount(
        "00000000-0000-4000-8000-000000000092",
        "account-owner"
      )
    ).rejects.toThrow("no longer matches");
    await store.clear();
    await expect(
      store.bindAccount(EXCHANGE_ID, "account-owner")
    ).rejects.toThrow("no longer matches");
  });

  it("fails closed on a malformed protected record instead of deleting it", async () => {
    const memory = memoryDriver();
    const store = createPasswordRecoverySessionMarkerStore(
      memory.driver
    );
    memory.values.set(
      "alyr.password-recovery-session-marker.v1",
      '{"version":1,"phase":"session-active"}'
    );

    await expect(store.read()).rejects.toThrow(
      "protected password-recovery marker"
    );
    expect(memory.values.size).toBe(1);
  });

  it("rejects invalid exchange and account scopes before storage", async () => {
    const memory = memoryDriver();
    const store = createPasswordRecoverySessionMarkerStore(
      memory.driver
    );

    await expect(
      store.begin("not-an-exchange", STARTED_AT)
    ).rejects.toThrow("valid password-recovery exchange");
    await store.begin(EXCHANGE_ID, STARTED_AT);
    await expect(
      store.bindAccount(EXCHANGE_ID, "\u0000account")
    ).rejects.toThrow("valid password-recovery account");
  });
});
