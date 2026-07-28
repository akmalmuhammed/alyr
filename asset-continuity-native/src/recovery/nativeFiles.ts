import * as Crypto from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import {
  RECOVERY_KIT_EXTENSION,
  RECOVERY_KIT_LIMITS,
  RECOVERY_KIT_MIME_TYPE
} from "./container";
import type { RecoveryKitStoragePort } from "./types";
import { RecoveryKitError } from "./types";
import type { PickedRecoveryKit } from "./journeyController";
import type { LocalRecoveryKitRecord } from "./journey";

const FILE_NAME_PATTERN =
  /^ALYR-Recovery-\d{4}-\d{2}-\d{2}\.alyrkit$/u;

function recoveryDirectory(): Directory {
  return new Directory(Paths.document, "alyr-recovery-kits");
}

function assertEncryptedKitName(fileName: string): void {
  if (!FILE_NAME_PATTERN.test(fileName)) {
    throw new RecoveryKitError(
      "INVALID_INPUT",
      "Recovery Kit file name is invalid."
    );
  }
}

function externalBackupReceipt(fileName: string): File {
  return new File(
    recoveryDirectory(),
    `.${fileName}.external-copy-confirmed`
  );
}

function validIsoTimestamp(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T/u.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

async function confirmedAtFor(
  fileName: string
): Promise<string | null> {
  const receipt = externalBackupReceipt(fileName);
  if (!receipt.exists || receipt.size <= 0 || receipt.size > 64) {
    return null;
  }
  try {
    const value = (await receipt.text()).trim();
    return validIsoTimestamp(value) ? value : null;
  } catch {
    return null;
  }
}

async function recordFor(
  file: File
): Promise<LocalRecoveryKitRecord> {
  const timestamp =
    file.lastModified ?? file.creationTime ?? Date.now();
  return {
    reference: file.uri,
    fileName: file.name,
    byteSize: file.size,
    createdAt: new Date(timestamp).toISOString(),
    externalBackupConfirmedAt: await confirmedAtFor(file.name)
  };
}

function localEncryptedKits(): File[] {
  const directory = recoveryDirectory();
  if (!directory.exists) return [];
  return directory
    .list()
    .filter(
      (entry): entry is File =>
        entry instanceof File &&
        entry.exists &&
        entry.size > 0 &&
        FILE_NAME_PATTERN.test(entry.name)
    );
}

export async function listRecentLocalRecoveryKits(
  limit = 3
): Promise<readonly LocalRecoveryKitRecord[]> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20) {
    throw new RecoveryKitError(
      "INVALID_INPUT",
      "Recovery Kit history limit is invalid."
    );
  }
  const records = await Promise.all(
    localEncryptedKits().map(recordFor)
  );
  return records
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);
}

export async function confirmRecoveryKitExternalBackup(
  reference: string,
  confirmedAt: string
): Promise<LocalRecoveryKitRecord> {
  if (!validIsoTimestamp(confirmedAt)) {
    throw new RecoveryKitError(
      "INVALID_INPUT",
      "Recovery Kit backup confirmation time is invalid."
    );
  }
  const file = localEncryptedKits().find(
    (candidate) => candidate.uri === reference
  );
  if (!file) {
    throw new RecoveryKitError(
      "STORAGE_FAILED",
      "The encrypted Recovery Kit is no longer available on this device."
    );
  }
  const receipt = externalBackupReceipt(file.name);
  receipt.create({ overwrite: true, intermediates: true });
  receipt.write(confirmedAt);
  if (
    !receipt.exists ||
    receipt.size <= 0 ||
    (await receipt.text()).trim() !== confirmedAt
  ) {
    throw new RecoveryKitError(
      "STORAGE_FAILED",
      "The external-copy confirmation could not be stored."
    );
  }
  return {
    ...(await recordFor(file)),
    externalBackupConfirmedAt: confirmedAt
  };
}

/**
 * The only bytes written by this adapter are the final AEAD container bytes.
 * The `.partial` file is still encrypted; no decrypted workspace, attachment
 * key, manifest, or proof bytes cross the filesystem boundary.
 */
export class ExpoRecoveryKitStorage implements RecoveryKitStoragePort {
  async writeEncryptedKitAtomically(input: {
    readonly bytes: Uint8Array;
    readonly fileName: string;
    readonly mimeType: typeof RECOVERY_KIT_MIME_TYPE;
  }) {
    assertEncryptedKitName(input.fileName);
    if (
      input.mimeType !== RECOVERY_KIT_MIME_TYPE ||
      input.bytes.byteLength <= 0 ||
      input.bytes.byteLength > RECOVERY_KIT_LIMITS.maxEncryptedKitBytes
    ) {
      throw new RecoveryKitError(
        "INVALID_INPUT",
        "Encrypted Recovery Kit output is invalid."
      );
    }

    const directory = recoveryDirectory();
    directory.create({ idempotent: true, intermediates: true });
    const token = Crypto.randomUUID().replaceAll("-", "");
    const temporary = new File(
      directory,
      `.encrypted-${token}${RECOVERY_KIT_EXTENSION}.partial`
    );
    const destination = new File(directory, input.fileName);
    try {
      temporary.create({ overwrite: false, intermediates: true });
      temporary.write(input.bytes);
      if (
        !temporary.exists ||
        temporary.size !== input.bytes.byteLength
      ) {
        throw new Error("Encrypted temporary file size did not match.");
      }
      await temporary.move(destination, { overwrite: true });
      if (
        !destination.exists ||
        destination.size !== input.bytes.byteLength
      ) {
        throw new Error("Encrypted Recovery Kit size did not match.");
      }
      const previousReceipt = externalBackupReceipt(input.fileName);
      if (previousReceipt.exists) previousReceipt.delete();
      return {
        reference: destination.uri,
        fileName: input.fileName,
        byteSize: destination.size
      };
    } catch (error) {
      if (temporary.exists) temporary.delete();
      throw error;
    }
  }

  async readEncryptedKit(
    reference: string,
    maxBytes: number
  ): Promise<Uint8Array> {
    if (
      !reference ||
      !Number.isSafeInteger(maxBytes) ||
      maxBytes <= 0 ||
      maxBytes > RECOVERY_KIT_LIMITS.maxEncryptedKitBytes
    ) {
      throw new RecoveryKitError(
        "INVALID_INPUT",
        "Recovery Kit read request is invalid."
      );
    }
    const file = new File(reference);
    if (
      !file.exists ||
      file.size <= 0 ||
      file.size > maxBytes ||
      !file.name.toLowerCase().endsWith(RECOVERY_KIT_EXTENSION)
    ) {
      throw new RecoveryKitError(
        "LIMIT_EXCEEDED",
        "Choose one ALYR Recovery Kit within the 64 MB limit."
      );
    }
    return file.bytes();
  }
}

export async function chooseEncryptedRecoveryKit(): Promise<
  PickedRecoveryKit | null
> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      RECOVERY_KIT_MIME_TYPE,
      "application/octet-stream",
      "application/zip"
    ],
    copyToCacheDirectory: true,
    multiple: false
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (
    !asset ||
    !asset.name.toLowerCase().endsWith(RECOVERY_KIT_EXTENSION) ||
    (typeof asset.size === "number" &&
      (asset.size <= 0 ||
        asset.size > RECOVERY_KIT_LIMITS.maxEncryptedKitBytes))
  ) {
    throw new RecoveryKitError(
      "INVALID_INPUT",
      "Choose one .alyrkit file within the 64 MB limit."
    );
  }
  return {
    reference: asset.uri,
    fileName: asset.name
  };
}

export async function shareEncryptedRecoveryKit(
  reference: string
): Promise<void> {
  const file = new File(reference);
  if (
    !file.exists ||
    file.size <= 0 ||
    !file.name.toLowerCase().endsWith(RECOVERY_KIT_EXTENSION)
  ) {
    throw new RecoveryKitError(
      "STORAGE_FAILED",
      "The encrypted Recovery Kit is no longer available on this device."
    );
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new RecoveryKitError(
      "STORAGE_FAILED",
      "The system share sheet is unavailable on this device."
    );
  }
  await Sharing.shareAsync(file.uri, {
    dialogTitle: "Save encrypted ALYR Recovery Kit",
    mimeType: RECOVERY_KIT_MIME_TYPE,
    UTI: "com.alyr.recovery-kit"
  });
}
