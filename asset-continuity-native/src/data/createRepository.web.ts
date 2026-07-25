import { MemoryWorkspaceRepository } from "./memoryRepository";
import type { NativeWorkspaceRepository } from "./repository";

export async function createDefaultRepository(): Promise<NativeWorkspaceRepository> {
  return new MemoryWorkspaceRepository();
}
