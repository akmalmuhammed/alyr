/**
 * Expo Go exposes the Recovery Kit journey only to explain why encrypted
 * create/restore remains unavailable. Keep the signed-build crypto, file, and
 * restore adapters outside the SDK 54 module graph.
 */
import {
  createUnavailableRecoveryRuntime,
  type RecoveryJourneyRuntime
} from "../../../asset-continuity-native/src/recovery/journey";
import type { RuntimeProfile } from "../../../asset-continuity-native/src/runtime/environment";

export {
  RECOVERY_REPLACE_CONFIRMATION,
  RecoveryJourneyProvider,
  useRecoveryJourney,
  validateRecoveryConfirmation
} from "../../../asset-continuity-native/src/recovery/journey";
export type {
  RecoveryCapability,
  RecoveryImportPreview,
  RecoveryKitVerification,
  RecoveryUnavailableReason
} from "../../../asset-continuity-native/src/recovery/journey";
export { recoveryErrorMessage } from "../../../asset-continuity-native/src/recovery/uiMessages";
export { createUnavailableRecoveryRuntime };
export type { RecoveryJourneyRuntime };

/**
 * Mirrors the canonical factory name without importing its signed crypto and
 * filesystem graph. The generic accepts the complete dependency object passed
 * by WorkspaceProvider while the preview consumes only its runtime profile.
 */
export function createSignedRecoveryJourneyRuntime<
  T extends { readonly profile: RuntimeProfile }
>(dependencies: T): RecoveryJourneyRuntime {
  return createUnavailableRecoveryRuntime(dependencies.profile);
}
