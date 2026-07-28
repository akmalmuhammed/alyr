import * as SecureStore from "expo-secure-store";

import {
  createPendingHouseholdProvisionStore,
  type PendingHouseholdProvisionStore
} from "./pendingHouseholdProvision";

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
};

/**
 * Device-bound storage for a caller-stable household creation operation.
 * The record is removed only after the refreshed provider session proves the
 * complete owner tuple, or after an explicit signed-account exit.
 */
export function createExpoPendingHouseholdProvisionStore(): PendingHouseholdProvisionStore {
  return createPendingHouseholdProvisionStore({
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
