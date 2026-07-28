import {
  assertValidFinalAssetMutation,
  normalizeAssetMutationName,
  normalizeAssetMutationReference
} from "@alyr/domain";

import {
  CATEGORY_CHOICES,
  type CapturedFile,
  type NativeWorkspace,
  type NewAssetInput
} from "@/domain/model";
import {
  deriveNativeAssetLocationTruth,
  placePinFromNativePlace
} from "@/domain/readiness";

function normalizeCapturedFile(file: CapturedFile): CapturedFile {
  return {
    ...file,
    localUri: file.localUri.trim(),
    fileName: file.fileName.trim(),
    mimeType: file.mimeType.trim().toLowerCase(),
    ...(file.protectedUri !== undefined
      ? {
          protectedUri:
            normalizeAssetMutationReference(file.protectedUri)
        }
      : {}),
    ...(file.checksumSha256 !== undefined
      ? {
          checksumSha256:
            normalizeAssetMutationReference(file.checksumSha256)
              ?.toLowerCase() ?? null
        }
      : {})
  };
}

/**
 * The native projection of the shared final-asset invariant. The returned
 * value is the only NewAssetInput accepted by the workspace mutation, so raw
 * screen state and restored drafts never become durable records directly.
 */
export function validateNewAssetInput(
  workspace: NativeWorkspace,
  input: NewAssetInput
): NewAssetInput {
  const placeId = normalizeAssetMutationReference(input.placeId);
  const roomId = normalizeAssetMutationReference(input.roomId);
  const locatorText = normalizeAssetMutationReference(
    input.locatorText
  );
  const place = workspace.places.find(
    (candidate) => candidate.id === placeId
  );
  const locationStatus = deriveNativeAssetLocationTruth({
    categoryId: input.categoryId,
    requestedStatus: input.locationStatus,
    place,
    roomId,
    locatorText
  }).status;

  assertValidFinalAssetMutation(
    {
      name: input.name,
      categoryId: input.categoryId,
      locationStatus,
      placeId,
      spaceId: roomId,
      locationDetail: locatorText,
      photo: input.photo,
      evidence: input.evidence
    },
    {
      householdId: workspace.household.id,
      supportedCategoryIds: CATEGORY_CHOICES.map(
        (candidate) => candidate.id
      ),
      places: workspace.places.map((place) => ({
        id: place.id,
        householdId: place.householdId,
        spaceIds: place.rooms.map((room) => room.id),
        pin: placePinFromNativePlace(place)
      }))
    }
  );

  // Runtime assertion precedes every string method so a corrupted caller gets
  // the same typed, localized failure instead of a raw TypeError.
  const categoryId = input.categoryId.trim();
  const category = CATEGORY_CHOICES.find(
    (candidate) => candidate.id === categoryId
  );
  const name = normalizeAssetMutationName(input.name);
  // The assertion above proves this lookup. Keep the fallback unreachable and
  // side-effect free in case the native catalog ever drifts from the shared
  // allow-list during development.
  if (!category) {
    throw new Error("The supported item category catalog is inconsistent.");
  }

  return {
    ...input,
    name,
    categoryId: category.id,
    categoryLabel: category.label,
    locationStatus,
    placeId,
    roomId,
    locatorText,
    photo: input.photo ? normalizeCapturedFile(input.photo) : null,
    evidence: input.evidence
      ? normalizeCapturedFile(input.evidence)
      : null
  };
}
