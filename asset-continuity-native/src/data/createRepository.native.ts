import { MemoryWorkspaceRepository } from "./memoryRepository";
import type { NativeWorkspaceRepository } from "./repository";
import { ExpoSecureKeyStore } from "./secureKeyStore";
import { SQLiteWorkspaceRepository } from "./sqliteRepository";
import { isExpoGoPreview } from "@/runtime/environment";
import {
  assertValidVaultScope,
  DEVICE_PREVIEW_VAULT_SCOPE,
  isDevicePreviewVaultScope,
  type VaultScope
} from "./vaultScope";

export async function createDefaultRepository(
  requestedScope: VaultScope = DEVICE_PREVIEW_VAULT_SCOPE
): Promise<NativeWorkspaceRepository> {
  const scope = assertValidVaultScope(requestedScope);
  if (isExpoGoPreview) {
    return new MemoryWorkspaceRepository(scope);
  }
  if (isDevicePreviewVaultScope(scope)) {
    throw new Error(
      "A signed local vault requires either the isolated sample scope or a verified account and household scope."
    );
  }
  // Both the signed-out sample and authenticated household layouts are
  // explicit, encrypted scopes. The legacy device-preview layout remains
  // blocked here so a signed build never opens it as a plaintext fallback.
  const repository = new SQLiteWorkspaceRepository(
    new ExpoSecureKeyStore(),
    scope
  );
  await repository.initialize();
  return repository;
}
