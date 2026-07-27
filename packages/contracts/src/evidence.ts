import type {
  AssetId,
  EvidenceId,
  EvidenceVersionId,
  HouseholdId,
  IsoDateTime,
  MemberId,
  PlaceDocumentId,
  PlaceDocumentVersionId,
  PlaceId,
  SpaceId,
} from "./core.js";

export type EvidenceKind =
  | "paper"
  | "artifact"
  | "media"
  | "record"
  | "note"
  | "link";

export type EvidenceRelation =
  | "ownership"
  | "identity"
  | "service"
  | "provenance"
  | "condition"
  | "insurance"
  | "valuation"
  | "legal"
  | "access"
  | "context"
  | "other";

export type EvidenceReviewStatus = "pending" | "reviewed" | "rejected";

export type EvidenceStorageState =
  | "on-device"
  | "queued"
  | "uploading"
  | "processing"
  | "cloud-acknowledged"
  | "missing-original"
  | "failed"
  | "quarantined";

export type MaterialStorageStatus =
  | "known"
  | "needs-detail"
  | "unknown"
  | "not-applicable"
  | "external-custodian";

export interface MaterialStorageDescriptor {
  readonly status: MaterialStorageStatus;
  readonly placeId: PlaceId | null;
  readonly spaceId: SpaceId | null;
  readonly locatorText: string | null;
  readonly custodianMemberId: MemberId | null;
  readonly externalLabel: string | null;
}

export interface EvidenceVersionDescriptor {
  readonly id: EvidenceVersionId;
  readonly householdId: HouseholdId;
  readonly evidenceId: EvidenceId;
  readonly blobObjectId: string | null;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly checksumSha256: string;
  readonly storageState: EvidenceStorageState;
  readonly capturedAt: IsoDateTime;
  readonly createdByMemberId: MemberId;
  readonly createdAt: IsoDateTime;
}

export interface EvidenceDescriptor {
  readonly id: EvidenceId;
  readonly householdId: HouseholdId;
  readonly assetId: AssetId;
  readonly type: string;
  readonly kind: EvidenceKind;
  readonly relation: EvidenceRelation;
  readonly reviewStatus: EvidenceReviewStatus;
  readonly currentVersionId: EvidenceVersionId | null;
  readonly linkUrl: string | null;
  readonly note: string | null;
  readonly materialStorage: MaterialStorageDescriptor | null;
  readonly reviewedAt: IsoDateTime | null;
  readonly reviewedByMemberId: MemberId | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

/**
 * A Place-scoped document is intentionally distinct from asset Evidence in
 * the domain contract, even though both share the same encrypted blob and
 * immutable-version infrastructure.
 */
export interface PlaceDocumentDescriptor {
  readonly id: PlaceDocumentId;
  readonly householdId: HouseholdId;
  readonly placeId: PlaceId;
  readonly kind: EvidenceKind;
  readonly relation: EvidenceRelation;
  readonly title: string;
  readonly reviewStatus: EvidenceReviewStatus;
  readonly storageState: EvidenceStorageState;
  readonly version: number;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
}

export interface PlaceDocumentVersionDescriptor {
  readonly id: PlaceDocumentVersionId;
  readonly householdId: HouseholdId;
  readonly placeDocumentId: PlaceDocumentId;
  readonly blobObjectId: string;
  readonly versionNumber: number;
  readonly fileName: string;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly checksumSha256: string;
  readonly storageState: EvidenceStorageState;
  readonly createdByMemberId: MemberId;
  readonly createdAt: IsoDateTime;
}
