import {
  INSTALLATION_DEVICE_ID_KEY,
  SESSION_PREVIEW_DEVICE_ID,
  createSessionPreviewDeviceIdentity,
  createStoredInstallationDeviceIdentity,
  isValidInstallationDeviceId,
  type InstallationDeviceIdentityDriver
} from "@/data/installationDeviceIdentity";

const FIRST_ID = "10000000-0000-4000-8000-000000000001";
const SECOND_ID = "20000000-0000-4000-8000-000000000002";

function memoryDriver(initial?: string): {
  readonly values: Map<string, string>;
  readonly driver: InstallationDeviceIdentityDriver;
  readonly setItem: jest.Mock;
} {
  const values = new Map<string, string>();
  if (initial !== undefined) {
    values.set(INSTALLATION_DEVICE_ID_KEY, initial);
  }
  const setItem = jest.fn(async (key: string, value: string) => {
    values.set(key, value);
  });
  return {
    values,
    setItem,
    driver: {
      async getItem(key) {
        return values.get(key) ?? null;
      },
      setItem
    }
  };
}

describe("installation-scoped device identity", () => {
  it("reuses the same SecureStore UUID after a process restart", async () => {
    const storage = memoryDriver();
    const firstGenerator = jest.fn(() => FIRST_ID);
    const firstProcess = createStoredInstallationDeviceIdentity({
      driver: storage.driver,
      createId: firstGenerator
    });

    await expect(firstProcess.getOrCreate()).resolves.toBe(FIRST_ID);
    await expect(firstProcess.getOrCreate()).resolves.toBe(FIRST_ID);
    expect(firstGenerator).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledTimes(1);

    const restartedGenerator = jest.fn(() => SECOND_ID);
    const restartedProcess = createStoredInstallationDeviceIdentity({
      driver: storage.driver,
      createId: restartedGenerator
    });
    await expect(restartedProcess.getOrCreate()).resolves.toBe(
      FIRST_ID
    );
    expect(restartedGenerator).not.toHaveBeenCalled();
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it("fails closed instead of replacing a malformed stored identity", async () => {
    const storage = memoryDriver("not-a-device-uuid");
    const createId = jest.fn(() => FIRST_ID);
    const identity = createStoredInstallationDeviceIdentity({
      driver: storage.driver,
      createId
    });

    await expect(identity.getOrCreate()).rejects.toThrow(
      "protected installation identity is invalid"
    );
    expect(createId).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.values.get(INSTALLATION_DEVICE_ID_KEY)).toBe(
      "not-a-device-uuid"
    );
  });

  it("recovers a transient verification read without rotating the UUID", async () => {
    const values = new Map<string, string>();
    let reads = 0;
    const createId = jest.fn(() => FIRST_ID);
    const identity = createStoredInstallationDeviceIdentity({
      driver: {
        async getItem(key) {
          reads += 1;
          if (reads === 2) return null;
          return values.get(key) ?? null;
        },
        async setItem(key, value) {
          values.set(key, value);
        }
      },
      createId
    });

    await expect(identity.getOrCreate()).rejects.toThrow(
      "was not retained"
    );
    await expect(identity.getOrCreate()).resolves.toBe(FIRST_ID);
    expect(createId).toHaveBeenCalledTimes(1);
  });

  it("keeps preview identity deterministic and session-only", async () => {
    const preview = createSessionPreviewDeviceIdentity();
    expect(preview.scope).toBe("session");
    await expect(preview.getOrCreate()).resolves.toBe(
      SESSION_PREVIEW_DEVICE_ID
    );
    expect(isValidInstallationDeviceId(SESSION_PREVIEW_DEVICE_ID)).toBe(
      true
    );
  });
});
