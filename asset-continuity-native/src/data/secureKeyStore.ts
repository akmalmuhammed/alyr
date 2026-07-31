import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import type { SecureKeyStore } from "@alyr/contracts";

import {
  assertValidVaultScope,
  DEVICE_PREVIEW_VAULT_SCOPE,
  type VaultScope
} from "./vaultScope";

/** Backward-compatible aliases for the explicit device-preview vault. */
export const DATABASE_KEY_NAME =
  DEVICE_PREVIEW_VAULT_SCOPE.databaseKeyName;
export const ATTACHMENT_KEY_NAME =
  DEVICE_PREVIEW_VAULT_SCOPE.attachmentKeyName;

const AES_256_KEY_BYTES = 32;

/**
 * SecureStore does not expose compare-and-set. React effects, account
 * transitions, and adjacent providers can therefore request the same new
 * vault key concurrently. Without one process-wide queue, two callers can
 * both observe a missing key, generate different values, and leave SQLCipher
 * bound to one value while SecureStore retains the other.
 *
 * Queue by the opaque SecureStore key name rather than by store instance:
 * production resource factories create independent ExpoSecureKeyStore
 * wrappers over the same native store. Removal joins the same queue so purge
 * cannot interleave with first creation inside this process. The Android
 * release manifest is separately tested to declare no secondary process; a
 * future `android:process` component requires native/interprocess locking.
 */
const keyOperationTails = new Map<string, Promise<unknown>>();

async function runKeyOperationExclusive<T>(
  keyName: string,
  operation: () => Promise<T>
): Promise<T> {
  const preceding = keyOperationTails.get(keyName) ?? Promise.resolve();
  const current = preceding.catch(() => undefined).then(operation);
  keyOperationTails.set(keyName, current);
  try {
    return await current;
  } finally {
    if (keyOperationTails.get(keyName) === current) {
      keyOperationTails.delete(keyName);
    }
  }
}

async function getOrCreateKey(
  store: SecureKeyStore,
  keyName: string,
  invalidExistingMessage: string
): Promise<Uint8Array> {
  return runKeyOperationExclusive(keyName, async () => {
    const existing = await store.get(keyName);
    if (existing) {
      if (existing.length !== AES_256_KEY_BYTES) {
        throw new Error(invalidExistingMessage);
      }
      return new Uint8Array(existing);
    }
    const created = Crypto.getRandomBytes(AES_256_KEY_BYTES);
    if (created.length !== AES_256_KEY_BYTES) {
      throw new Error("The generated device-bound vault key was invalid.");
    }
    await store.set(keyName, created);
    return new Uint8Array(created);
  });
}

function encodeBase64(value: Uint8Array): string {
  let binary = "";
  value.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return globalThis.btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = globalThis.atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export class ExpoSecureKeyStore implements SecureKeyStore {
  async get(key: string): Promise<Uint8Array | null> {
    const value = await SecureStore.getItemAsync(key, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
    });
    return value ? decodeBase64(value) : null;
  }

  async set(key: string, value: Uint8Array): Promise<void> {
    await SecureStore.setItemAsync(key, encodeBase64(value), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
    });
  }

  async remove(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  }
}

export async function getOrCreateDatabaseKey(
  store: SecureKeyStore,
  scope: VaultScope = DEVICE_PREVIEW_VAULT_SCOPE
): Promise<Uint8Array> {
  const keyName = assertValidVaultScope(scope).databaseKeyName;
  return getOrCreateKey(
    store,
    keyName,
    "The protected local database key is invalid."
  );
}

/**
 * Returns the device-bound AES-256 attachment key, creating it only for a new
 * attachment vault. An existing key with an unexpected length is treated as
 * corrupt instead of being silently replaced, because replacing it would make
 * every previously encrypted attachment unreadable.
 */
export async function getOrCreateAttachmentKey(
  store: SecureKeyStore,
  scope: VaultScope = DEVICE_PREVIEW_VAULT_SCOPE
): Promise<Uint8Array> {
  const keyName = assertValidVaultScope(scope).attachmentKeyName;
  return getOrCreateKey(
    store,
    keyName,
    "The protected attachment key is invalid."
  );
}

export async function removeDatabaseKey(
  store: SecureKeyStore,
  scope: VaultScope = DEVICE_PREVIEW_VAULT_SCOPE
): Promise<void> {
  const keyName = assertValidVaultScope(scope).databaseKeyName;
  await runKeyOperationExclusive(keyName, () => store.remove(keyName));
}

export async function removeAttachmentKey(
  store: SecureKeyStore,
  scope: VaultScope = DEVICE_PREVIEW_VAULT_SCOPE
): Promise<void> {
  const keyName = assertValidVaultScope(scope).attachmentKeyName;
  await runKeyOperationExclusive(keyName, () => store.remove(keyName));
}
