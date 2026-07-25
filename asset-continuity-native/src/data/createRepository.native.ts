import { MemoryWorkspaceRepository } from "./memoryRepository";
import type { NativeWorkspaceRepository } from "./repository";
import { ExpoSecureKeyStore } from "./secureKeyStore";
import { SQLiteWorkspaceRepository } from "./sqliteRepository";

export async function createDefaultRepository(): Promise<NativeWorkspaceRepository> {
  try {
    const repository = new SQLiteWorkspaceRepository(
      new ExpoSecureKeyStore()
    );
    await repository.initialize();
    return repository;
  } catch (error) {
    console.warn(
      "Encrypted SQLite is unavailable; using a session-only repository.",
      error
    );
    return new MemoryWorkspaceRepository();
  }
}
