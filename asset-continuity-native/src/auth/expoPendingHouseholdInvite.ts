import * as SecureStore from "expo-secure-store";

import {
  createPendingHouseholdInviteStore,
  type PendingHouseholdInviteStore
} from "./pendingHouseholdInvite";

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
};

/**
 * Device-bound storage for the one invitation that is actively crossing the
 * authentication boundary. The code is removed after acceptance, rejection,
 * explicit cancellation, sign-out, or account deletion.
 */
export function createExpoPendingHouseholdInviteStore(): PendingHouseholdInviteStore {
  return createPendingHouseholdInviteStore({
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
