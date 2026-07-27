import type { NativeWorkspace } from "@/domain/model";
import {
  createWorkspace,
  type WorkspaceIdentity
} from "@/domain/sample";

/**
 * Builds a clean personal record from the sample boundary. The interface
 * language is the only sample preference carried across; sample household
 * identity, records, proof, values and activity remain excluded.
 */
export function createPersonalWorkspaceReplacement(
  sample: NativeWorkspace,
  now: string,
  identity: WorkspaceIdentity
): NativeWorkspace {
  if (sample.mode !== "sample") {
    throw new Error(
      "Only a sample workspace can be converted to a personal workspace."
    );
  }
  return {
    ...createWorkspace("personal", now, identity),
    language: sample.language
  };
}
