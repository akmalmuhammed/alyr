import { RecoveryKitError } from "./types";

export function recoveryErrorMessage(error: unknown): string {
  if (!(error instanceof RecoveryKitError)) {
    return "Recovery Kit did not finish. Your current data was preserved.";
  }
  switch (error.code) {
    case "AUTHENTICATION_FAILED":
      return "The passphrase is wrong or the Recovery Kit has changed. Nothing was restored.";
    case "CORRUPT_CONTAINER":
      return "This file is not an intact ALYR Recovery Kit. Nothing was restored.";
    case "UNSUPPORTED_VERSION":
      return "This Recovery Kit needs a newer compatible ALYR build.";
    case "INVALID_PASSPHRASE":
      return "Use a passphrase with at least 12 characters.";
    case "LIMIT_EXCEEDED":
      return "This Recovery Kit exceeds the pilot size limits.";
    case "CRYPTO_UNAVAILABLE":
      return "Recovery protection is not available in this build.";
    case "RESTORE_REJECTED":
      return error.message;
    case "STORAGE_FAILED":
      return "The encrypted Recovery Kit could not be read or saved. Your current data was preserved.";
    default:
      return "Recovery Kit verification did not finish. Your current data was preserved.";
  }
}
