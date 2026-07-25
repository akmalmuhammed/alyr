import type {
  AssetId,
  EvidenceDescriptor,
  EvidenceVersionDescriptor,
  HouseholdId,
  IsoDateTime,
  LocationMode,
  LocationPlaceSnapshot,
  LocationRevision,
  LocationStatus,
  MemberId,
  Money,
  PlaceId,
  PlacePin,
  SpaceId,
} from "@alyr/contracts";

import type { FocusedAssetKind } from "./categories.js";

export interface FocusedHouseholdRecord {
  readonly id: HouseholdId;
  readonly name: string;
  readonly locale: "en" | "ar";
  readonly defaultCurrency: string;
  readonly createdAt: IsoDateTime;
}

export interface FocusedMemberRecord {
  readonly id: MemberId;
  readonly householdId: HouseholdId;
  readonly displayName: string;
  readonly role: "owner" | "editor" | "viewer";
  readonly createdAt: IsoDateTime;
}

export interface FocusedPlaceRecord {
  readonly id: PlaceId;
  readonly householdId: HouseholdId;
  readonly name: string;
  readonly addressSummary: string | null;
  readonly pin: PlacePin | null;
  readonly status: "active" | "archived";
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface FocusedSpaceRecord {
  readonly id: SpaceId;
  readonly householdId: HouseholdId;
  readonly placeId: PlaceId;
  readonly parentSpaceId: SpaceId | null;
  readonly name: string;
  readonly kind: "room" | "zone" | "container";
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface FocusedAssetRecord {
  readonly id: AssetId;
  readonly householdId: HouseholdId;
  readonly name: string;
  readonly categoryId: string;
  readonly categoryLabel: string;
  readonly kind: FocusedAssetKind;
  readonly ownerMemberId: MemberId | null;
  readonly custodianMemberId: MemberId | null;
  readonly locationMode: LocationMode;
  readonly locationStatus: LocationStatus;
  readonly placeId: PlaceId | null;
  readonly spaceId: SpaceId | null;
  readonly locationDetail: string | null;
  readonly reference: string | null;
  readonly value: Money | null;
  readonly notes: string | null;
  readonly requiredProofTypes: readonly string[];
  readonly lifecycleStatus: "active" | "missing" | "loaned" | "archived";
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface FocusedWorkspace {
  readonly household: FocusedHouseholdRecord;
  readonly members: readonly FocusedMemberRecord[];
  readonly places: readonly FocusedPlaceRecord[];
  readonly spaces: readonly FocusedSpaceRecord[];
  readonly assets: readonly FocusedAssetRecord[];
  readonly evidence: readonly EvidenceDescriptor[];
  readonly evidenceVersions: readonly EvidenceVersionDescriptor[];
  readonly locationRevisions: readonly LocationRevision[];
}

export function toLocationPlaceSnapshot(
  place: FocusedPlaceRecord,
): LocationPlaceSnapshot {
  return {
    id: place.id,
    name: place.name,
    addressSummary: place.addressSummary,
    pin: place.pin,
  };
}
