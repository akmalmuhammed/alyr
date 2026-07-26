import type { CapturedFile } from "@/domain/model";

export interface AttachmentStore {
  readonly kind: "encrypted-files" | "memory-preview";
  readonly encryptedAtRest: boolean;
  ingest(file: CapturedFile): Promise<CapturedFile>;
}

class ExpoGoAttachmentStore implements AttachmentStore {
  readonly kind = "memory-preview" as const;
  readonly encryptedAtRest = false;

  async ingest(file: CapturedFile): Promise<CapturedFile> {
    if (file.byteSize > 10 * 1024 * 1024) {
      throw new Error("Files over 10 MB are not accepted in the pilot.");
    }
    return {
      ...file,
      protectedUri: null,
      checksumSha256: null,
      encryptedAtRest: false
    };
  }
}

export function createDefaultAttachmentStore(): AttachmentStore {
  return new ExpoGoAttachmentStore();
}
