import {
  AESEncryptionKey,
  aesEncryptAsync,
  CryptoDigestAlgorithm,
  digest,
  getRandomBytes
} from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";

import type { CapturedFile } from "@/domain/model";
import {
  ExpoSecureKeyStore
} from "@/data/secureKeyStore";
import { isExpoGoPreview } from "@/runtime/environment";

const ATTACHMENT_KEY_NAME = "alyr.native.attachment-key.v1";

export interface AttachmentStore {
  readonly kind: "encrypted-files" | "memory-preview";
  readonly encryptedAtRest: boolean;
  ingest(file: CapturedFile): Promise<CapturedFile>;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

class MemoryPreviewAttachmentStore implements AttachmentStore {
  readonly kind = "memory-preview" as const;
  readonly encryptedAtRest = false;

  async ingest(file: CapturedFile): Promise<CapturedFile> {
    return {
      ...file,
      protectedUri: null,
      checksumSha256: null,
      encryptedAtRest: false
    };
  }
}

class EncryptedFileAttachmentStore implements AttachmentStore {
  readonly kind = "encrypted-files" as const;
  readonly encryptedAtRest = true;
  private readonly secureStore = new ExpoSecureKeyStore();

  async ingest(file: CapturedFile): Promise<CapturedFile> {
    if (file.encryptedAtRest && file.protectedUri && file.checksumSha256) {
      return file;
    }

    const source = new File(file.localUri);
    const plaintext = new Uint8Array(await source.arrayBuffer());
    if (plaintext.byteLength > 10 * 1024 * 1024) {
      throw new Error("Files over 10 MB are not accepted in the pilot.");
    }
    const checksumBuffer = await digest(
      CryptoDigestAlgorithm.SHA256,
      plaintext
    );
    const checksumSha256 = bytesToHex(new Uint8Array(checksumBuffer));

    let keyBytes = await this.secureStore.get(ATTACHMENT_KEY_NAME);
    if (!keyBytes) {
      keyBytes = getRandomBytes(32);
      await this.secureStore.set(ATTACHMENT_KEY_NAME, keyBytes);
    }
    const key = await AESEncryptionKey.import(keyBytes);
    const sealed = await aesEncryptAsync(plaintext, key);
    const encrypted = await sealed.combined();
    if (typeof encrypted === "string") {
      throw new Error("Native attachment encryption returned an invalid payload.");
    }

    const directory = new Directory(Paths.document, "alyr-attachments");
    directory.create({ idempotent: true, intermediates: true });
    const destination = new File(
      directory,
      `${checksumSha256}.alyrblob`
    );
    destination.create({ overwrite: true, intermediates: true });
    destination.write(encrypted);

    if (!destination.exists || destination.size !== encrypted.byteLength) {
      throw new Error("The encrypted attachment could not be verified on disk.");
    }

    if (
      source.exists &&
      source.uri.startsWith(Paths.cache.uri) &&
      source.uri !== destination.uri
    ) {
      source.delete();
    }

    return {
      ...file,
      localUri: destination.uri,
      protectedUri: destination.uri,
      checksumSha256,
      encryptedAtRest: true
    };
  }
}

export function createDefaultAttachmentStore(): AttachmentStore {
  if (
    Platform.OS === "web" ||
    process.env.NODE_ENV === "test" ||
    isExpoGoPreview
  ) {
    return new MemoryPreviewAttachmentStore();
  }
  return new EncryptedFileAttachmentStore();
}
