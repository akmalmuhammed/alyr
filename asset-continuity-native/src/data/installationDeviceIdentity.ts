import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import { isSessionPreview } from "@/runtime/environment";

/**
 * One device identifier is shared by every account and household on the same
 * ALYR installation. It is deliberately not derived from a vault scope.
 */
export const INSTALLATION_DEVICE_ID_KEY =
  "alyr.installation-device-id.v1";

/**
 * Preview identities never enter SecureStore or survive a preview process.
 * A fixed UUID also keeps browser/Expo Go fixtures reproducible.
 */
export const SESSION_PREVIEW_DEVICE_ID =
  "00000000-0000-4000-8000-000000000020";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface InstallationDeviceIdentity {
  readonly scope: "installation" | "session";
  getOrCreate(): Promise<string>;
}

export interface InstallationDeviceIdentityDriver {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

interface StoredInstallationDeviceIdentityOptions {
  readonly driver: InstallationDeviceIdentityDriver;
  readonly createId?: () => string;
}

export class InstallationDeviceIdentityError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "InstallationDeviceIdentityError";
  }
}

export function isValidInstallationDeviceId(value: string): boolean {
  return UUID_V4_PATTERN.test(value);
}

function assertValidInstallationDeviceId(
  value: string,
  source: "generated" | "stored"
): string {
  if (!isValidInstallationDeviceId(value)) {
    throw new InstallationDeviceIdentityError(
      source === "stored"
        ? "The protected installation identity is invalid. Device sync remains locked."
        : "A valid installation identity could not be created. Device sync remains locked.",
      false
    );
  }
  return value.toLowerCase();
}

/**
 * Creates the persistent identity boundary. Missing state is initialized once;
 * malformed or unverifiable state is never silently replaced. A failed read or
 * write clears only the in-flight promise so an explicit retry can recover from
 * a transient Keychain interruption without changing the UUID.
 */
export function createStoredInstallationDeviceIdentity({
  driver,
  createId = () => Crypto.randomUUID()
}: StoredInstallationDeviceIdentityOptions): InstallationDeviceIdentity {
  let cached: string | null = null;
  let inFlight: Promise<string> | null = null;

  const resolve = async (): Promise<string> => {
    try {
      const existing = await driver.getItem(
        INSTALLATION_DEVICE_ID_KEY
      );
      if (existing !== null) {
        return assertValidInstallationDeviceId(existing, "stored");
      }

      const created = assertValidInstallationDeviceId(
        createId(),
        "generated"
      );
      await driver.setItem(INSTALLATION_DEVICE_ID_KEY, created);

      // Read-after-write is the durability boundary. Continuing with an
      // unverified in-memory UUID could assign a different device on restart.
      const verified = await driver.getItem(
        INSTALLATION_DEVICE_ID_KEY
      );
      if (verified === null) {
        throw new InstallationDeviceIdentityError(
          "The protected installation identity was not retained. Device sync remains locked.",
          true
        );
      }
      const validated = assertValidInstallationDeviceId(
        verified,
        "stored"
      );
      if (validated !== created) {
        throw new InstallationDeviceIdentityError(
          "The protected installation identity changed while it was being saved. Device sync remains locked.",
          false
        );
      }
      return validated;
    } catch (caught) {
      if (caught instanceof InstallationDeviceIdentityError) {
        throw caught;
      }
      throw new InstallationDeviceIdentityError(
        "The protected installation identity could not be read. Device sync remains locked.",
        true
      );
    }
  };

  return {
    scope: "installation",
    async getOrCreate() {
      if (cached !== null) return cached;
      if (inFlight !== null) return inFlight;

      const pending = resolve()
        .then((value) => {
          cached = value;
          return value;
        })
        .finally(() => {
          if (inFlight === pending) {
            inFlight = null;
          }
        });
      inFlight = pending;
      return pending;
    }
  };
}

export function createExpoInstallationDeviceIdentity(): InstallationDeviceIdentity {
  const secureStoreOptions: SecureStore.SecureStoreOptions = {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
  };
  return createStoredInstallationDeviceIdentity({
    driver: {
      getItem(key) {
        return SecureStore.getItemAsync(key, secureStoreOptions);
      },
      async setItem(key, value) {
        await SecureStore.setItemAsync(
          key,
          value,
          secureStoreOptions
        );
      }
    }
  });
}

export function createSessionPreviewDeviceIdentity(): InstallationDeviceIdentity {
  return {
    scope: "session",
    async getOrCreate() {
      return SESSION_PREVIEW_DEVICE_ID;
    }
  };
}

export const defaultInstallationDeviceIdentity: InstallationDeviceIdentity =
  isSessionPreview
    ? createSessionPreviewDeviceIdentity()
    : createExpoInstallationDeviceIdentity();
