import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import {
  createChunkedSecureSessionStorage,
  type SupabaseSessionStorage
} from "./secureSessionStorage";

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
};

/**
 * Production Supabase session storage. Access and refresh tokens exist only
 * inside encrypted, device-bound SecureStore records and the Supabase client
 * call stack; this adapter never touches AsyncStorage or React state.
 */
export function createExpoSecureSessionStorage(): SupabaseSessionStorage {
  return createChunkedSecureSessionStorage({
    driver: {
      async getItem(key) {
        return SecureStore.getItemAsync(key, secureStoreOptions);
      },
      async setItem(key, value) {
        await SecureStore.setItemAsync(key, value, secureStoreOptions);
      },
      async removeItem(key) {
        await SecureStore.deleteItemAsync(key, secureStoreOptions);
      }
    },
    digest: async (value) =>
      Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        value,
        { encoding: Crypto.CryptoEncoding.HEX }
      ),
    createGeneration: () => Crypto.randomUUID()
  });
}
