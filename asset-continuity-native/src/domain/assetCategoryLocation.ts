import { getLocationPolicy } from "@alyr/domain";

import type { ExistingAssetLocationInput } from "./model";

export type CategoryLocationTransition =
  | "physical-to-virtual"
  | "virtual-to-physical";

const unresolvedLocation: ExistingAssetLocationInput = {
  locationStatus: "unknown",
  placeId: null,
  roomId: null,
  locatorText: null
};

/**
 * Category changes that cross the physical-location boundary must never retain
 * a stale Place, space, retrieval clue, or property-pin association.
 */
export function categoryLocationTransition(
  previousCategoryId: string,
  nextCategoryId: string
): CategoryLocationTransition | null {
  const previousRequiresPhysicalLocation =
    getLocationPolicy(previousCategoryId).requiresPhysicalLocator;
  const nextRequiresPhysicalLocation =
    getLocationPolicy(nextCategoryId).requiresPhysicalLocator;

  if (
    previousRequiresPhysicalLocation === nextRequiresPhysicalLocation
  ) {
    return null;
  }

  return previousRequiresPhysicalLocation
    ? "physical-to-virtual"
    : "virtual-to-physical";
}

export function unresolvedLocationForCategoryTransition(
  transition: CategoryLocationTransition | null
): ExistingAssetLocationInput | null {
  return transition ? { ...unresolvedLocation } : null;
}
