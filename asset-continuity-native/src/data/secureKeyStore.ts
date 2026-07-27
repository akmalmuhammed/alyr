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
  const existing = await store.get(keyName);
  if (existing) {
    if (existing.length !== AES_256_KEY_BYTES) {
      throw new Error("The protected local database key is invalid.");
    }
    return existing;
  }
  const created = Crypto.getRandomBytes(AES_256_KEY_BYTES);
  await store.set(keyName, created);
  return created;
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
  const existing = await store.get(keyName);
  if (existing) {
    if (existing.length !== AES_256_KEY_BYTES) {
      throw new Error("The protected attachment key is invalid.");
    }
    return existing;
  }

  const created = Crypto.getRandomBytes(AES_256_KEY_BYTES);
  await store.set(keyName, created);
  return created;
}

export async function removeDatabaseKey(
  store: SecureKeyStore,
  scope: VaultScope = DEVICE_PREVIEW_VAULT_SCOPE
): Promise<void> {
  await store.remove(assertValidVaultScope(scope).databaseKeyName);
}

export async function removeAttachmentKey(
  store: SecureKeyStore,
  scope: VaultScope = DEVICE_PREVIEW_VAULT_SCOPE
): Promise<void> {
  await store.remove(assertValidVaultScope(scope).attachmentKeyName);
}
