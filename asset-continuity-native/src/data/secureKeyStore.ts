import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import type { SecureKeyStore } from "@alyr/contracts";

export const DATABASE_KEY_NAME = "alyr.native.database-key.v1";

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
  store: SecureKeyStore
): Promise<Uint8Array> {
  const existing = await store.get(DATABASE_KEY_NAME);
  if (existing && existing.length === 32) {
    return existing;
  }
  const created = Crypto.getRandomBytes(32);
  await store.set(DATABASE_KEY_NAME, created);
  return created;
}
