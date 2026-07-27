import { MemoryWorkspaceRepository } from "./memoryRepository";
import type { NativeWorkspaceRepository } from "./repository";
import {
  DEVICE_PREVIEW_VAULT_SCOPE,
  type VaultScope
} from "./vaultScope";

export async function createDefaultRepository(
  scope: VaultScope = DEVICE_PREVIEW_VAULT_SCOPE
): Promise<NativeWorkspaceRepository> {
  return new MemoryWorkspaceRepository(scope);
}
