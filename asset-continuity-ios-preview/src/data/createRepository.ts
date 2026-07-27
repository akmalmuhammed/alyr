import { MemoryWorkspaceRepository } from "@/data/memoryRepository";
import type { NativeWorkspaceRepository } from "@/data/repository";
import {
  DEVICE_PREVIEW_VAULT_SCOPE,
  type VaultScope
} from "@/data/vaultScope";

export async function createDefaultRepository(
  scope: VaultScope = DEVICE_PREVIEW_VAULT_SCOPE
): Promise<NativeWorkspaceRepository> {
  return new MemoryWorkspaceRepository(scope);
}
