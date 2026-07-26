import { MemoryWorkspaceRepository } from "@/data/memoryRepository";
import type { NativeWorkspaceRepository } from "@/data/repository";

export async function createDefaultRepository(): Promise<NativeWorkspaceRepository> {
  return new MemoryWorkspaceRepository();
}
