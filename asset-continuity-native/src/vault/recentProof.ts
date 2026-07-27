import type {
  LanguageCode,
  NativeAsset,
  NativeEvidence,
  NativePlace,
  NativePlaceDocument,
  NativeWorkspace
} from "@/domain/model";
import { formatLocalizedNumber } from "@/i18n/coreJourneyCopy";

export const RECENT_PROOF_INITIAL_LIMIT = 4;

export type RecentProofEntry =
  | {
      readonly kind: "asset-evidence";
      readonly id: string;
      readonly capturedAt: string;
      readonly asset: NativeAsset;
      readonly evidence: NativeEvidence;
    }
  | {
      readonly kind: "place-document";
      readonly id: string;
      readonly capturedAt: string;
      readonly place: NativePlace;
      readonly document: NativePlaceDocument;
    };

function capturedTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

/**
 * Returns only proof records whose parent record still belongs to the active
 * workspace. That keeps every visible row actionable and avoids exposing an
 * inconsistent orphan reference while local reconciliation is in progress.
 */
export function getRecentProofEntries(
  workspace: NativeWorkspace
): RecentProofEntry[] {
  const assetsById = new Map(
    workspace.assets.map((asset) => [asset.id, asset])
  );
  const placesById = new Map(
    workspace.places.map((place) => [place.id, place])
  );

  const assetEvidence: RecentProofEntry[] = workspace.evidence.flatMap(
    (evidence) => {
      const asset = assetsById.get(evidence.assetId);
      return asset
        ? [
            {
              kind: "asset-evidence" as const,
              id: evidence.id,
              capturedAt: evidence.capturedAt,
              asset,
              evidence
            }
          ]
        : [];
    }
  );
  const placeDocuments: RecentProofEntry[] = (
    workspace.placeDocuments ?? []
  ).flatMap((document) => {
    const place = placesById.get(document.placeId);
    return place
      ? [
          {
            kind: "place-document" as const,
            id: document.id,
            capturedAt: document.capturedAt,
            place,
            document
          }
        ]
      : [];
  });

  return [...assetEvidence, ...placeDocuments].sort((left, right) => {
    const leftTimestamp = capturedTimestamp(left.capturedAt);
    const rightTimestamp = capturedTimestamp(right.capturedAt);
    if (leftTimestamp !== rightTimestamp) {
      return rightTimestamp > leftTimestamp ? 1 : -1;
    }
    return left.id.localeCompare(right.id);
  });
}

export function recentProofCountLabel(
  count: number,
  language: LanguageCode
): string {
  const formatted = formatLocalizedNumber(count, language);
  if (language === "en") {
    return `${formatted} ${count === 1 ? "file" : "files"}`;
  }
  if (count === 0) return "لا ملفات";
  if (count === 1) return "ملف واحد";
  if (count === 2) return "ملفان";
  if (count >= 3 && count <= 10) return `${formatted} ملفات`;
  return `${formatted} ملفًا`;
}

export function isolateRecentProofIdentifier(value: string): string {
  return `\u2068${value}\u2069`;
}
