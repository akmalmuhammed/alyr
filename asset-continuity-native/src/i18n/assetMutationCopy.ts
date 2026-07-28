import type {
  AssetMutationErrorCode,
  AssetMutationValidationError
} from "@alyr/domain";

import type { LanguageCode } from "@/domain/model";
import { getCaptureCopy } from "@/i18n/captureCopy";

export interface AssetMutationRecoveryCopy {
  readonly message: string;
  readonly step: 0 | 1 | 2;
  readonly field:
    | "name"
    | "category"
    | "location"
    | "photo"
    | "evidence";
}

function recoveryTarget(
  code: AssetMutationErrorCode,
  fileRole: "photo" | "evidence" | undefined
): Pick<AssetMutationRecoveryCopy, "step" | "field"> {
  switch (code) {
    case "ASSET_NAME_REQUIRED":
      return { step: 0, field: "name" };
    case "ASSET_CATEGORY_UNSUPPORTED":
      return { step: 0, field: "category" };
    case "ASSET_FILE_METADATA_INVALID":
    case "ASSET_FILE_SIZE_INVALID":
      return {
        step: fileRole === "photo" ? 0 : 2,
        field: fileRole === "photo" ? "photo" : "evidence"
      };
    default:
      return { step: 1, field: "location" };
  }
}

/**
 * Localizes by stable reason code. Provider prose is deliberately excluded so
 * restored-draft validation remains specific in English and Arabic.
 */
export function localizedAssetMutationRecovery(
  error: AssetMutationValidationError,
  language: LanguageCode
): AssetMutationRecoveryCopy {
  const capture = getCaptureCopy(language);
  const target = recoveryTarget(
    error.issue.code,
    error.issue.fileRole
  );
  let message: string;

  switch (error.issue.code) {
    case "ASSET_NAME_REQUIRED":
      message = capture.nameError;
      break;
    case "ASSET_CATEGORY_UNSUPPORTED":
      message = capture.categoryError;
      break;
    case "ASSET_PLACE_INVALID":
      message = capture.placeError;
      break;
    case "ASSET_SPACE_INVALID":
    case "ASSET_EXACT_LOCATION_REQUIRED":
      message = capture.exactLocationError;
      break;
    case "ASSET_FILE_METADATA_INVALID":
    case "ASSET_FILE_SIZE_INVALID":
      message =
        error.issue.fileRole === "photo"
          ? `${capture.photoFailed}. ${capture.photoFailedRecovery}`
          : `${capture.documentFailed}. ${capture.documentFailedRecovery}`;
      break;
    default:
      message = capture.locationError;
  }

  return { ...target, message };
}
