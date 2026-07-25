import type { NativeWorkspaceRepository } from "./repository";
import { MemoryWorkspaceRepository } from "./memoryRepository";

export async function createDefaultRepository(): Promise<NativeWorkspaceRepository> {
  return new MemoryWorkspaceRepository();
}
