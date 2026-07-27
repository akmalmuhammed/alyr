import type {
  AssetReadiness,
  AssetReadinessItem,
  NativeAsset,
  NativePlace
} from "./model";

export type TodayCommandState = "empty" | "incomplete" | "ready";
export type TodayPinConfirmation = "confirmed" | "confirmation-needed";

export interface TodayPlacePin {
  readonly place: NativePlace;
  readonly latitude: number;
  readonly longitude: number;
  readonly confirmation: TodayPinConfirmation;
}

export interface TodayPlacePinStatus {
  readonly pins: readonly TodayPlacePin[];
  readonly confirmedCount: number;
  readonly confirmationNeededCount: number;
}

export interface TodayAttentionEntry {
  readonly asset: NativeAsset;
  readonly readiness: AssetReadiness;
}

const ATTENTION_GAP_PRIORITY: Readonly<
  Record<AssetReadinessItem["id"], number>
> = {
  location: 4,
  evidence: 3,
  photo: 2,
  identity: 1
};

/**
 * Produces one stable "next best action" queue instead of inheriting database
 * insertion order. Lower readiness comes first; ties favor retrieval location,
 * then proof, then photo and identity. Older records win the remaining tie so
 * one newly edited item does not continually displace long-standing gaps.
 */
export function rankTodayAttention(
  entries: readonly TodayAttentionEntry[]
): readonly TodayAttentionEntry[] {
  return entries
    .filter(
      (
        entry
      ): entry is TodayAttentionEntry & {
        readonly readiness: AssetReadiness & {
          readonly nextItem: AssetReadinessItem;
        };
      } => entry.readiness.nextItem !== null
    )
    .sort(
      (left, right) =>
        left.readiness.percent - right.readiness.percent ||
        ATTENTION_GAP_PRIORITY[right.readiness.nextItem.id] -
          ATTENTION_GAP_PRIORITY[left.readiness.nextItem.id] ||
        Date.parse(left.asset.updatedAt) -
          Date.parse(right.asset.updatedAt) ||
        left.asset.id.localeCompare(right.asset.id)
    );
}

export function selectTodayCommandState(
  activeAssetCount: number,
  incompleteAssetCount: number
): TodayCommandState {
  if (activeAssetCount === 0) return "empty";
  return incompleteAssetCount > 0 ? "incomplete" : "ready";
}

/**
 * Selects every displayable coordinate once and derives both labels from that
 * same set. A coordinate is confirmed only after the user confirmation time
 * has been persisted.
 */
export function selectTodayPlacePinStatus(
  places: readonly NativePlace[]
): TodayPlacePinStatus {
  const pins = places
    .filter(
      (
        place
      ): place is NativePlace & {
        readonly latitude: number;
        readonly longitude: number;
      } =>
        place.latitude !== null &&
        Number.isFinite(place.latitude) &&
        place.longitude !== null &&
        Number.isFinite(place.longitude)
    )
    .map((place): TodayPlacePin => ({
      place,
      latitude: place.latitude,
      longitude: place.longitude,
      confirmation: place.confirmedAt
        ? "confirmed"
        : "confirmation-needed"
    }));

  return {
    pins,
    confirmedCount: pins.filter(
      (pin) => pin.confirmation === "confirmed"
    ).length,
    confirmationNeededCount: pins.filter(
      (pin) => pin.confirmation === "confirmation-needed"
    ).length
  };
}
