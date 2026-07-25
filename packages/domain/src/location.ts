import type {
  AssetId,
  HouseholdId,
  IsoDateTime,
  LocationConfirmationState,
  LocationMode,
  LocationPlaceSnapshot,
  LocationPrecision,
  LocationRevision,
  LocationSource,
  LocationSpaceSnapshot,
  LocationStatus,
  MemberId,
  PlacePin,
} from "@alyr/contracts";

import { DomainInvariantError } from "./errors.js";

export const MAX_EXACT_GPS_ACCURACY_METERS = 15;

export interface HonestPlacePinInput {
  readonly latitude: number;
  readonly longitude: number;
  readonly source: LocationSource;
  readonly horizontalAccuracyMeters?: number | null;
  readonly observedAt: IsoDateTime;
  readonly confirmedAt?: IsoDateTime | null;
}

function validCoordinate(
  value: number,
  minimum: number,
  maximum: number,
): boolean {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

export function createHonestPlacePin(input: HonestPlacePinInput): PlacePin {
  if (
    !validCoordinate(input.latitude, -90, 90) ||
    !validCoordinate(input.longitude, -180, 180)
  ) {
    throw new DomainInvariantError(
      "INVALID_COORDINATES",
      "Latitude or longitude is outside its valid range.",
    );
  }

  const suppliedAccuracy = input.horizontalAccuracyMeters;
  const validAccuracy =
    typeof suppliedAccuracy === "number" &&
    Number.isFinite(suppliedAccuracy) &&
    suppliedAccuracy >= 0
      ? suppliedAccuracy
      : null;

  let precision: LocationPrecision = "approximate";
  let horizontalAccuracyMeters: number | null = null;

  if (input.source === "device_gps") {
    horizontalAccuracyMeters = validAccuracy;
    precision =
      validAccuracy !== null &&
      validAccuracy <= MAX_EXACT_GPS_ACCURACY_METERS
        ? "exact"
        : "approximate";
  } else if (
    input.source === "user_pin" ||
    input.source === "manual_coordinates"
  ) {
    precision = "user_placed";
  } else if (input.source === "geocoder") {
    precision = "locality_only";
  }

  return {
    latitude: input.latitude,
    longitude: input.longitude,
    source: input.source,
    precision,
    horizontalAccuracyMeters,
    observedAt: input.observedAt,
    confirmedAt: input.confirmedAt ?? null,
  };
}

export function isConfirmedPrecisePlacePin(
  pin: PlacePin | null | undefined,
): boolean {
  return Boolean(
    pin &&
      (pin.precision === "exact" || pin.precision === "user_placed") &&
      pin.confirmedAt,
  );
}

export interface DeriveLocationTruthInput {
  readonly requiresPhysicalLocator: boolean;
  readonly allowsVirtual: boolean;
  readonly isRealEstate: boolean;
  readonly requestedMode: LocationMode;
  readonly requestedStatus: LocationStatus;
  readonly hasPlace: boolean;
  readonly hasIndoorLocator: boolean;
  readonly placePin: PlacePin | null;
}

export function deriveLocationTruth(
  input: DeriveLocationTruthInput,
): { readonly mode: LocationMode; readonly status: LocationStatus } {
  if (input.hasPlace) {
    const canBeKnown = input.isRealEstate
      ? isConfirmedPrecisePlacePin(input.placePin)
      : input.hasIndoorLocator;
    return {
      mode: "physical",
      status:
        input.requestedStatus === "known" && canBeKnown
          ? "known"
          : input.requestedStatus === "unknown"
            ? "unknown"
            : "needs-detail",
    };
  }

  if (input.requestedMode === "virtual" && input.allowsVirtual) {
    return { mode: "virtual", status: "unknown" };
  }
  if (input.requestedMode === "not-applicable") {
    return { mode: "not-applicable", status: "unknown" };
  }
  if (
    input.requiresPhysicalLocator &&
    input.requestedMode === "physical" &&
    input.requestedStatus === "needs-detail"
  ) {
    return { mode: "physical", status: "needs-detail" };
  }
  return { mode: "unknown", status: "unknown" };
}

export interface AppendLocationRevisionInput {
  readonly revisionId: string;
  readonly householdId: HouseholdId;
  readonly assetId: AssetId;
  readonly mode: LocationMode;
  readonly status: LocationStatus;
  readonly placeSnapshot: LocationPlaceSnapshot | null;
  readonly spacePathSnapshot: readonly LocationSpaceSnapshot[];
  readonly locatorText: string | null;
  readonly confirmationState: LocationConfirmationState;
  readonly source: LocationSource;
  readonly observedAt: IsoDateTime;
  readonly validFrom: IsoDateTime;
  readonly createdByMemberId: MemberId | null;
  readonly reason: string | null;
}

export function appendLocationRevision(
  history: readonly LocationRevision[],
  input: AppendLocationRevisionInput,
): readonly LocationRevision[] {
  const duplicate = history.find(
    (revision) => revision.id === input.revisionId,
  );
  if (duplicate) {
    const repeatedWithoutChange =
      duplicate.householdId === input.householdId &&
      duplicate.assetId === input.assetId &&
      duplicate.mode === input.mode &&
      duplicate.status === input.status &&
      duplicate.placeId === (input.placeSnapshot?.id ?? null) &&
      duplicate.spaceId ===
        (input.spacePathSnapshot[input.spacePathSnapshot.length - 1]?.id ??
          null) &&
      duplicate.locatorText === (input.locatorText?.trim() || null) &&
      duplicate.confirmationState === input.confirmationState &&
      duplicate.source === input.source &&
      duplicate.observedAt === input.observedAt &&
      duplicate.validFrom === input.validFrom &&
      duplicate.createdByMemberId === input.createdByMemberId &&
      duplicate.reason === (input.reason?.trim() || null);
    if (repeatedWithoutChange) return history;
    throw new DomainInvariantError(
      "LOCATION_REVISION_ID_CONFLICT",
      "A location revision ID cannot be reused with different content.",
    );
  }

  if (
    !Number.isFinite(Date.parse(input.validFrom)) ||
    !Number.isFinite(Date.parse(input.observedAt))
  ) {
    throw new DomainInvariantError(
      "INVALID_LOCATION_TIME",
      "Location revision times must be valid ISO date-time values.",
    );
  }
  if (
    input.mode === "physical" &&
    input.status === "known" &&
    !input.placeSnapshot
  ) {
    throw new DomainInvariantError(
      "KNOWN_LOCATION_REQUIRES_PLACE",
      "A known physical location requires a Place snapshot.",
    );
  }
  if (!input.placeSnapshot && input.spacePathSnapshot.length > 0) {
    throw new DomainInvariantError(
      "SPACE_REQUIRES_PLACE",
      "A room, zone, or container path requires a Place snapshot.",
    );
  }
  if (
    input.mode !== "physical" &&
    (input.placeSnapshot || input.spacePathSnapshot.length > 0)
  ) {
    throw new DomainInvariantError(
      "NON_PHYSICAL_LOCATION_HAS_PLACE",
      "Virtual, unknown, and not-applicable locations cannot retain a Place.",
    );
  }

  const activeForAsset = history.filter(
    (revision) =>
      revision.assetId === input.assetId && revision.validTo === null,
  );
  if (activeForAsset.length > 1) {
    throw new DomainInvariantError(
      "MULTIPLE_ACTIVE_LOCATIONS",
      "An asset cannot have more than one active location revision.",
    );
  }

  const prior = activeForAsset[0] ?? null;
  if (
    prior &&
    Date.parse(input.validFrom) < Date.parse(prior.validFrom)
  ) {
    throw new DomainInvariantError(
      "LOCATION_TIME_REVERSED",
      "A new location revision cannot begin before the active revision.",
    );
  }

  const closedHistory = history.map((revision) =>
    revision.id === prior?.id
      ? { ...revision, validTo: input.validFrom }
      : revision,
  );
  const placeId = input.placeSnapshot?.id ?? null;
  const spaceId =
    input.spacePathSnapshot[input.spacePathSnapshot.length - 1]?.id ?? null;
  const next: LocationRevision = {
    id: input.revisionId,
    householdId: input.householdId,
    assetId: input.assetId,
    mode: input.mode,
    status: input.status,
    placeId,
    spaceId,
    placeSnapshot: input.placeSnapshot,
    spacePathSnapshot: [...input.spacePathSnapshot],
    locatorText: input.locatorText?.trim() || null,
    confirmationState: input.confirmationState,
    source: input.source,
    observedAt: input.observedAt,
    validFrom: input.validFrom,
    validTo: null,
    createdByMemberId: input.createdByMemberId,
    reason: input.reason?.trim() || null,
    createdAt: input.validFrom,
  };
  return [...closedHistory, next];
}

export function locationPathText(
  revision: LocationRevision,
): string | null {
  const segments = [
    revision.placeSnapshot?.name,
    ...revision.spacePathSnapshot.map((space) => space.name),
    revision.locatorText,
  ].filter((segment): segment is string => Boolean(segment?.trim()));
  return segments.length > 0 ? segments.join(" / ") : null;
}
