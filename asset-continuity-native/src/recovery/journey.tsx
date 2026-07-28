import {
  createContext,
  type PropsWithChildren,
  useContext,
  useMemo
} from "react";

import { runtimeProfile, type RuntimeProfile } from "@/runtime/environment";
import { RecoveryKitError } from "./types";

export const RECOVERY_REPLACE_CONFIRMATION = "REPLACE";

export type RecoveryUnavailableReason =
  | "preview-runtime"
  | "argon2id-unavailable"
  | "vault-locked";

export type RecoveryCapability =
  | {
      readonly kind: "available";
      readonly protection: "argon2id-aes-256-gcm";
    }
  | {
      readonly kind: "unavailable";
      readonly reason: RecoveryUnavailableReason;
      readonly title: string;
      readonly description: string;
      readonly nextStep: string;
    };

export interface RecoveryKitVerification {
  readonly reference: string;
  readonly fileName: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly attachmentCount: number;
  readonly createdAt: string;
  readonly verifiedAt: string;
  readonly protection: "Argon2id + AES-256-GCM";
  /**
   * User-confirmed evidence that another copy was saved outside ALYR's
   * application sandbox. A locally created file alone is never called backup.
   */
  readonly externalBackupConfirmedAt: string | null;
}

export interface LocalRecoveryKitRecord {
  readonly reference: string;
  readonly fileName: string;
  readonly byteSize: number;
  readonly createdAt: string;
  readonly externalBackupConfirmedAt: string | null;
}

export interface RecoveryImportPreview {
  /**
   * An opaque in-memory handle. It contains no workspace or key material and
   * becomes invalid as soon as the preview is cleared.
   */
  readonly previewId: string;
  readonly fileName: string;
  readonly kitIdSuffix: string;
  readonly createdAt: string;
  readonly workspaceSchemaVersion: number;
  readonly householdName: string;
  readonly itemCount: number;
  readonly placeCount: number;
  readonly proofCount: number;
  readonly attachmentCount: number;
  readonly containerSha256: string;
  readonly authenticated: true;
}

export interface RecoveryJourneyRuntime {
  readonly capability: RecoveryCapability;
  create(passphrase: string): Promise<RecoveryKitVerification>;
  share(reference: string): Promise<void>;
  listRecent(): Promise<readonly LocalRecoveryKitRecord[]>;
  confirmExternalBackup(
    reference: string
  ): Promise<LocalRecoveryKitRecord>;
  chooseAndPreview(passphrase: string): Promise<RecoveryImportPreview | null>;
  restore(previewId: string, confirmation: string): Promise<void>;
  clearPreview(): void;
}

function unavailableMessage(
  profile: RuntimeProfile
): Extract<RecoveryCapability, { readonly kind: "unavailable" }> {
  if (profile === "expo-go-preview" || profile === "web-preview") {
    return {
      kind: "unavailable",
      reason: "preview-runtime",
      title: "Recovery Kit is available in the installed ALYR app",
      description:
        "This personal preview does not include the device-grade encryption and protected storage required for a Recovery Kit. Nothing has been exported or restored.",
      nextStep:
        "Continue testing the rest of ALYR here. Recovery stays off in this preview."
    };
  }
  return {
    kind: "unavailable",
    reason: "argon2id-unavailable",
    title: "Recovery protection is not available in this build",
    description:
      "This build is missing the device-grade protection required to create or open a Recovery Kit. Nothing has been exported or restored.",
    nextStep:
      "Install a newer signed ALYR build before using Recovery Kit."
  };
}

export function createUnavailableRecoveryRuntime(
  profile: RuntimeProfile = runtimeProfile
): RecoveryJourneyRuntime {
  const capability = unavailableMessage(profile);
  const unavailable = async (): Promise<never> => {
    throw new RecoveryKitError(
      "CRYPTO_UNAVAILABLE",
      capability.description
    );
  };
  return {
    capability,
    create: unavailable,
    share: unavailable,
    listRecent: async () => [],
    confirmExternalBackup: unavailable,
    chooseAndPreview: unavailable,
    restore: unavailable,
    clearPreview() {}
  };
}

const defaultRuntime = createUnavailableRecoveryRuntime();
const RecoveryJourneyContext =
  createContext<RecoveryJourneyRuntime>(defaultRuntime);

export function RecoveryJourneyProvider({
  children,
  runtime
}: PropsWithChildren<{ readonly runtime?: RecoveryJourneyRuntime }>) {
  const value = useMemo(
    () => runtime ?? defaultRuntime,
    [runtime]
  );
  return (
    <RecoveryJourneyContext.Provider value={value}>
      {children}
    </RecoveryJourneyContext.Provider>
  );
}

export function useRecoveryJourney(): RecoveryJourneyRuntime {
  return useContext(RecoveryJourneyContext);
}

export function validateRecoveryConfirmation(value: string): boolean {
  return value.trim() === RECOVERY_REPLACE_CONFIRMATION;
}
