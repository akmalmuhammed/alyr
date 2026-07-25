import type {
  EvidenceDescriptor,
  EvidenceKind,
  EvidenceVersionDescriptor,
  IsoDateTime,
  MemberId,
} from "@alyr/contracts";

import { DomainInvariantError } from "./errors.js";

const SHA_256_PATTERN = /^[a-f0-9]{64}$/u;

export function isSha256(value: string): boolean {
  return SHA_256_PATTERN.test(value.trim().toLowerCase());
}

export function evidenceVersionIdForChecksum(checksumSha256: string): string {
  const checksum = checksumSha256.trim().toLowerCase();
  if (!isSha256(checksum)) {
    throw new DomainInvariantError(
      "INVALID_CHECKSUM",
      "Evidence versions require a lowercase SHA-256 checksum.",
    );
  }
  return `ov_${checksum}`;
}

export function isSafeReferenceUrl(value: string | null): boolean {
  if (!value || value.length > 2_048) return false;
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

function hasMaterialStorageSource(
  evidence: EvidenceDescriptor,
): boolean {
  const storage = evidence.materialStorage;
  if (!storage) return false;
  if (storage.status === "known" || storage.status === "needs-detail") {
    return Boolean(
      storage.placeId || storage.spaceId || storage.locatorText?.trim(),
    );
  }
  if (storage.status === "external-custodian") {
    return Boolean(
      storage.custodianMemberId ||
        storage.externalLabel?.trim() ||
        storage.locatorText?.trim(),
    );
  }
  return false;
}

function sourceIsPresent(
  evidence: EvidenceDescriptor,
  version: EvidenceVersionDescriptor | null,
): boolean {
  const hasFile = Boolean(version);
  switch (evidence.kind) {
    case "paper":
    case "media":
      return hasFile;
    case "note":
      return Boolean(evidence.note?.trim());
    case "link":
      return isSafeReferenceUrl(evidence.linkUrl);
    case "artifact":
      return (
        hasFile ||
        Boolean(evidence.note?.trim()) ||
        hasMaterialStorageSource(evidence)
      );
    case "record":
      return (
        hasFile ||
        Boolean(evidence.note?.trim()) ||
        isSafeReferenceUrl(evidence.linkUrl) ||
        hasMaterialStorageSource(evidence)
      );
  }
}

export function isEvidenceVersionUsable(
  version: EvidenceVersionDescriptor | null,
): boolean {
  return Boolean(
    version &&
      version.fileName.trim() &&
      version.mimeType.trim() &&
      Number.isSafeInteger(version.byteSize) &&
      version.byteSize > 0 &&
      isSha256(version.checksumSha256) &&
      (version.storageState === "on-device" ||
        version.storageState === "cloud-acknowledged"),
  );
}

export function isEvidenceReviewable(
  evidence: EvidenceDescriptor,
  version: EvidenceVersionDescriptor | null,
): boolean {
  if (
    version &&
    (version.id !== evidence.currentVersionId ||
      version.evidenceId !== evidence.id)
  ) {
    return false;
  }
  if (!sourceIsPresent(evidence, version)) return false;
  return version ? isEvidenceVersionUsable(version) : true;
}

export function applyEvidenceVersion(
  evidence: EvidenceDescriptor,
  version: EvidenceVersionDescriptor,
  updatedAt: IsoDateTime,
): EvidenceDescriptor {
  if (
    version.evidenceId !== evidence.id ||
    version.householdId !== evidence.householdId
  ) {
    throw new DomainInvariantError(
      "EVIDENCE_VERSION_PARENT_MISMATCH",
      "An evidence version must belong to the same material and household.",
    );
  }
  if (
    !isSha256(version.checksumSha256) ||
    version.id !== evidenceVersionIdForChecksum(version.checksumSha256) ||
    !version.fileName.trim() ||
    !version.mimeType.trim() ||
    !Number.isSafeInteger(version.byteSize) ||
    version.byteSize <= 0
  ) {
    throw new DomainInvariantError(
      "INVALID_EVIDENCE_VERSION",
      "Evidence version identity must match its immutable original metadata.",
    );
  }
  const versionChanged = evidence.currentVersionId !== version.id;
  return {
    ...evidence,
    currentVersionId: version.id,
    reviewStatus: versionChanged ? "pending" : evidence.reviewStatus,
    reviewedAt: versionChanged ? null : evidence.reviewedAt,
    reviewedByMemberId: versionChanged
      ? null
      : evidence.reviewedByMemberId,
    updatedAt,
  };
}

export function reviewEvidence(
  evidence: EvidenceDescriptor,
  version: EvidenceVersionDescriptor | null,
  reviewedByMemberId: MemberId,
  reviewedAt: IsoDateTime,
): EvidenceDescriptor {
  if (!isEvidenceReviewable(evidence, version)) {
    throw new DomainInvariantError(
      "EVIDENCE_NOT_REVIEWABLE",
      "The material source and current original must pass the integrity gate.",
    );
  }
  if (evidence.reviewStatus === "reviewed") return evidence;
  return {
    ...evidence,
    reviewStatus: "reviewed",
    reviewedAt,
    reviewedByMemberId,
    updatedAt: reviewedAt,
  };
}

export interface EvidenceRequirement {
  readonly type: string;
  readonly satisfied: boolean;
  readonly reviewedEvidenceIds: readonly string[];
  readonly pendingEvidenceIds: readonly string[];
}

export interface EvidenceRequirementSummary {
  readonly requirements: readonly EvidenceRequirement[];
  readonly satisfiedCount: number;
  readonly total: number;
  readonly percentage: number;
  readonly complete: boolean;
}

export function evaluateEvidenceRequirements(
  requiredTypes: readonly string[],
  evidence: readonly EvidenceDescriptor[],
  versions: readonly EvidenceVersionDescriptor[],
): EvidenceRequirementSummary {
  const versionsById = new Map(versions.map((version) => [version.id, version]));
  const requirements = requiredTypes.map((type) => {
    const matches = evidence.filter(
      (item) => item.type.toLowerCase() === type.toLowerCase(),
    );
    const reviewed = matches.filter((item) => {
      const version = item.currentVersionId
        ? versionsById.get(item.currentVersionId) ?? null
        : null;
      return (
        item.reviewStatus === "reviewed" &&
        isEvidenceReviewable(item, version)
      );
    });
    return {
      type,
      satisfied: reviewed.length > 0,
      reviewedEvidenceIds: reviewed.map((item) => item.id),
      pendingEvidenceIds: matches
        .filter((item) => item.reviewStatus === "pending")
        .map((item) => item.id),
    };
  });
  const satisfiedCount = requirements.filter(
    (requirement) => requirement.satisfied,
  ).length;
  return {
    requirements,
    satisfiedCount,
    total: requirements.length,
    percentage:
      requirements.length === 0
        ? 100
        : Math.round((satisfiedCount / requirements.length) * 100),
    complete:
      requirements.length === 0 ||
      satisfiedCount === requirements.length,
  };
}

export function evidenceKindRequiresOriginal(kind: EvidenceKind): boolean {
  return kind === "paper" || kind === "media";
}
