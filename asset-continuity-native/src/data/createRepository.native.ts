import { MemoryWorkspaceRepository } from "./memoryRepository";
import type { NativeWorkspaceRepository } from "./repository";
import { ExpoSecureKeyStore } from "./secureKeyStore";
import { SQLiteWorkspaceRepository } from "./sqliteRepository";
import { isExpoGoPreview } from "@/runtime/environment";

export async function createDefaultRepository(): Promise<NativeWorkspaceRepository> {
  if (isExpoGoPreview) {
    return new MemoryWorkspaceRepository();
  }
  const repository = new SQLiteWorkspaceRepository(
    new ExpoSecureKeyStore()
  );
  await repository.initialize();
  return repository;
}
