import { isNativeWorkspace, type NativeWorkspace } from "@/domain/model";
import { RECOVERY_KIT_LIMITS } from "./container";
import {
  createAndStoreRecoveryKit,
  disposeRecoveredKit,
  readAndOpenRecoveryKit,
  restoreRecoveryKitAtomically
} from "./service";
import type {
  CreateRecoveryKitRequest,
  RecoveredKit,
  RecoveryCryptoPort,
  RecoveryKitStoragePort,
  RecoveryProtectedAttachmentReadPort,
  RecoveryRestorePort
} from "./types";
import { RecoveryKitError } from "./types";
import {
  RECOVERY_REPLACE_CONFIRMATION,
  type LocalRecoveryKitRecord,
  type RecoveryImportPreview,
  type RecoveryJourneyRuntime,
  type RecoveryKitVerification,
  validateRecoveryConfirmation
} from "./journey";

export interface PickedRecoveryKit {
  readonly reference: string;
  readonly fileName: string;
}

export interface RecoveryJourneyDependencies {
  readonly crypto: RecoveryCryptoPort;
  readonly attachments: RecoveryProtectedAttachmentReadPort;
  readonly storage: RecoveryKitStoragePort;
  readonly restore: RecoveryRestorePort;
  readonly createRequest: () => Promise<CreateRecoveryKitRequest>;
  readonly chooseEncryptedKit: () => Promise<PickedRecoveryKit | null>;
  readonly shareEncryptedKit: (reference: string) => Promise<void>;
  readonly listRecentEncryptedKits?: () => Promise<
    readonly LocalRecoveryKitRecord[]
  >;
  readonly confirmEncryptedKitExternalBackup?: (
    reference: string,
    confirmedAt: string
  ) => Promise<LocalRecoveryKitRecord>;
  readonly currentHouseholdId: () => string | null;
  readonly now?: () => string;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeHexEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function previewWorkspace(
  recovered: RecoveredKit,
  fileName: string,
  currentHouseholdId: string | null
): {
  readonly preview: RecoveryImportPreview;
  readonly workspace: NativeWorkspace;
} {
  if (!isNativeWorkspace(recovered.workspace)) {
    throw new RecoveryKitError(
      "UNSUPPORTED_VERSION",
      "This Recovery Kit contains an unsupported ALYR workspace."
    );
  }
  const workspace = recovered.workspace;
  if (
    currentHouseholdId &&
    workspace.household.id !== currentHouseholdId
  ) {
    throw new RecoveryKitError(
      "RESTORE_REJECTED",
      "This Recovery Kit belongs to a different household."
    );
  }
  if (
    recovered.workspaceSchemaVersion !== workspace.schemaVersion
  ) {
    throw new RecoveryKitError(
      "CORRUPT_CONTAINER",
      "Recovery Kit workspace metadata does not agree."
    );
  }
  return {
    workspace,
    preview: {
      previewId: `${recovered.kitId}:${recovered.containerSha256}`,
      fileName,
      kitIdSuffix: recovered.kitId.slice(-8),
      createdAt: recovered.createdAt,
      workspaceSchemaVersion: recovered.workspaceSchemaVersion,
      householdName: workspace.household.name,
      itemCount: workspace.assets.length,
      placeCount: workspace.places.length,
      proofCount:
        workspace.evidence.length +
        (workspace.placeDocuments?.length ?? 0),
      attachmentCount: recovered.attachments.length,
      containerSha256: recovered.containerSha256,
      authenticated: true
    }
  };
}

/**
 * Keeps decrypted import material in memory only. UI receives a sanitized
 * preview and an opaque handle; clearing/replacing the preview zeroes every
 * recovered key and protected-attachment buffer.
 */
export class RecoveryJourneyController implements RecoveryJourneyRuntime {
  readonly capability = {
    kind: "available",
    protection: "argon2id-aes-256-gcm"
  } as const;

  private preview:
    | {
        readonly id: string;
        readonly recovered: RecoveredKit;
      }
    | null = null;

  constructor(private readonly dependencies: RecoveryJourneyDependencies) {}

  async create(passphrase: string): Promise<RecoveryKitVerification> {
    const request = await this.dependencies.createRequest();
    try {
      const stored = await createAndStoreRecoveryKit(request, passphrase, {
        crypto: this.dependencies.crypto,
        attachments: this.dependencies.attachments,
        storage: this.dependencies.storage
      });

      let persisted: Uint8Array | null = null;
      try {
        persisted = await this.dependencies.storage.readEncryptedKit(
          stored.reference,
          RECOVERY_KIT_LIMITS.maxEncryptedKitBytes
        );
        const digest = await this.dependencies.crypto.sha256(persisted);
        const checksum = bytesToHex(digest);
        digest.fill(0);
        if (
          persisted.byteLength !== stored.byteSize ||
          !timingSafeHexEqual(checksum, stored.sha256)
        ) {
          throw new RecoveryKitError(
            "STORAGE_FAILED",
            "The stored Recovery Kit did not pass its post-write verification."
          );
        }
      } finally {
        persisted?.fill(0);
      }

      const now =
        this.dependencies.now ?? (() => new Date().toISOString());
      return {
        ...stored,
        createdAt: request.createdAt,
        verifiedAt: now(),
        protection: "Argon2id + AES-256-GCM",
        externalBackupConfirmedAt: null
      };
    } finally {
      request.attachmentVaultKey?.fill(0);
    }
  }

  async share(reference: string): Promise<void> {
    await this.dependencies.shareEncryptedKit(reference);
  }

  async listRecent(): Promise<readonly LocalRecoveryKitRecord[]> {
    return this.dependencies.listRecentEncryptedKits?.() ?? [];
  }

  async confirmExternalBackup(
    reference: string
  ): Promise<LocalRecoveryKitRecord> {
    const now =
      this.dependencies.now ?? (() => new Date().toISOString());
    if (!this.dependencies.confirmEncryptedKitExternalBackup) {
      throw new RecoveryKitError(
        "STORAGE_FAILED",
        "External-copy confirmation is unavailable in this build."
      );
    }
    return this.dependencies.confirmEncryptedKitExternalBackup(
      reference,
      now()
    );
  }

  async chooseAndPreview(
    passphrase: string
  ): Promise<RecoveryImportPreview | null> {
    this.clearPreview();
    const picked = await this.dependencies.chooseEncryptedKit();
    if (!picked) return null;

    let recovered: RecoveredKit | null = null;
    try {
      recovered = await readAndOpenRecoveryKit(
        picked.reference,
        passphrase,
        {
          crypto: this.dependencies.crypto,
          storage: this.dependencies.storage
        }
      );
      const { preview } = previewWorkspace(
        recovered,
        picked.fileName,
        this.dependencies.currentHouseholdId()
      );
      this.preview = {
        id: preview.previewId,
        recovered
      };
      recovered = null;
      return preview;
    } finally {
      if (recovered) disposeRecoveredKit(recovered);
    }
  }

  async restore(
    previewId: string,
    confirmation: string
  ): Promise<void> {
    if (!validateRecoveryConfirmation(confirmation)) {
      throw new RecoveryKitError(
        "RESTORE_REJECTED",
        `Type ${RECOVERY_REPLACE_CONFIRMATION} to confirm replacement.`
      );
    }
    if (!this.preview || this.preview.id !== previewId) {
      throw new RecoveryKitError(
        "RESTORE_REJECTED",
        "The verified Recovery Kit preview has expired."
      );
    }
    const recovered = this.preview.recovered;
    try {
      await restoreRecoveryKitAtomically(
        recovered,
        this.dependencies.restore
      );
    } finally {
      this.clearPreview();
    }
  }

  clearPreview(): void {
    if (this.preview) {
      disposeRecoveredKit(this.preview.recovered);
      this.preview = null;
    }
  }
}
