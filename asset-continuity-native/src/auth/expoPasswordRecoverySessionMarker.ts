import * as SecureStore from "expo-secure-store";

import {
  createPasswordRecoverySessionMarkerStore,
  type PasswordRecoverySessionMarkerStore
} from "./passwordRecoverySessionMarker";

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
};

/**
 * Device-bound recovery marker that is written before Supabase may persist a
 * PKCE recovery session. A signed bootstrap audits this record before any
 * account session is allowed to reach routing or the encrypted vault.
 */
export function createExpoPasswordRecoverySessionMarkerStore(): PasswordRecoverySessionMarkerStore {
  return createPasswordRecoverySessionMarkerStore({
    async getItem(key) {
      return SecureStore.getItemAsync(key, secureStoreOptions);
    },
    async setItem(key, value) {
      await SecureStore.setItemAsync(key, value, secureStoreOptions);
    },
    async removeItem(key) {
      await SecureStore.deleteItemAsync(key, secureStoreOptions);
    }
  });
}
