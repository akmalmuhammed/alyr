import type {
  AssetId,
  HouseholdId,
  IsoDateTime,
  MemberId,
  PlaceId,
  SpaceId,
} from "./core.js";

export type LocationMode =
  | "physical"
  | "virtual"
  | "unknown"
  | "not-applicable";

export type LocationStatus = "known" | "needs-detail" | "unknown";

export type LocationSource =
  | "device_gps"
  | "user_pin"
  | "geocoder"
  | "manual_coordinates"
  | "photo_exif"
  | "imported"
  | "not_set";

export type LocationPrecision =
  | "exact"
  | "user_placed"
  | "approximate"
  | "locality_only";

export type LocationConfirmationState =
  | "suggested"
  | "user-confirmed"
  | "stale"
  | "disputed";

export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export interface PlacePin extends Coordinates {
  readonly source: LocationSource;
  readonly precision: LocationPrecision;
  readonly horizontalAccuracyMeters: number | null;
  readonly observedAt: IsoDateTime;
  readonly confirmedAt: IsoDateTime | null;
}

export interface LocationPlaceSnapshot {
  readonly id: PlaceId;
  readonly name: string;
  readonly addressSummary: string | null;
  readonly pin: PlacePin | null;
}

export interface LocationSpaceSnapshot {
  readonly id: SpaceId;
  readonly name: string;
  readonly kind: "room" | "zone" | "container";
}

export interface LocationRevision {
  readonly id: string;
  readonly householdId: HouseholdId;
  readonly assetId: AssetId;
  readonly mode: LocationMode;
  readonly status: LocationStatus;
  readonly placeId: PlaceId | null;
  readonly spaceId: SpaceId | null;
  readonly placeSnapshot: LocationPlaceSnapshot | null;
  readonly spacePathSnapshot: readonly LocationSpaceSnapshot[];
  readonly locatorText: string | null;
  readonly confirmationState: LocationConfirmationState;
  readonly source: LocationSource;
  readonly observedAt: IsoDateTime;
  readonly validFrom: IsoDateTime;
  readonly validTo: IsoDateTime | null;
  readonly createdByMemberId: MemberId | null;
  readonly reason: string | null;
  readonly createdAt: IsoDateTime;
}
