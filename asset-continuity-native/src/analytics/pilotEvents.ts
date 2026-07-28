import { createPrivacySafeEvent } from "@alyr/analytics";
import type {
  AnalyticsCommonPayload,
  AnalyticsEvent
} from "@alyr/contracts";

import type { NewAssetInput } from "@/domain/model";

export type PilotAnalyticsCommon = AnalyticsCommonPayload;
export type AssetRetrievalSource =
  | "search"
  | "asset-list"
  | "place-view"
  | "deep-link";

function elapsedBand(
  startedAt: string,
  completedAt: string
):
  | "under-2-minutes"
  | "under-5-minutes"
  | "5-10-minutes"
  | "over-10-minutes" {
  const elapsed = Math.max(
    0,
    Date.parse(completedAt) - Date.parse(startedAt)
  );
  if (elapsed < 2 * 60_000) return "under-2-minutes";
  if (elapsed < 5 * 60_000) return "under-5-minutes";
  if (elapsed < 10 * 60_000) return "5-10-minutes";
  return "over-10-minutes";
}

function completionBand(
  startedAt: string,
  completedAt: string
): "same-day" | "2-7-days" | "8-30-days" | "over-30-days" {
  const elapsedDays = Math.max(
    0,
    (Date.parse(completedAt) - Date.parse(startedAt)) / 86_400_000
  );
  if (elapsedDays < 1) return "same-day";
  if (elapsedDays <= 7) return "2-7-days";
  if (elapsedDays <= 30) return "8-30-days";
  return "over-30-days";
}

export function assetCountBand(
  assetCount: number
): "1-5" | "6-24" | "25-49" | "50-plus" {
  if (assetCount <= 5) return "1-5";
  if (assetCount <= 24) return "6-24";
  if (assetCount <= 49) return "25-49";
  return "50-plus";
}

export function expiryBand(
  expiresInHours: number
): "24-hours" | "7-days" | "30-days" | "no-expiry" {
  if (expiresInHours <= 24) return "24-hours";
  if (expiresInHours <= 168) return "7-days";
  if (expiresInHours <= 720) return "30-days";
  return "no-expiry";
}

function captureSource(
  input: NewAssetInput
): "camera" | "image-library" | "document-import" | "manual" {
  if (input.captureSource) return input.captureSource;
  if (input.evidence && !input.photo) return "document-import";
  if (input.photo) return "image-library";
  return "manual";
}

export function householdCreatedEvent(
  common: PilotAnalyticsCommon
): AnalyticsEvent<"household_created"> {
  return createPrivacySafeEvent("household_created", {
    ...common,
    creationMode: "personal"
  });
}

export function firstAssetPassportCreatedEvent(
  common: PilotAnalyticsCommon,
  input: NewAssetInput,
  workspaceCreatedAt: string,
  assetCreatedAt: string
): AnalyticsEvent<"first_asset_passport_created"> {
  return createPrivacySafeEvent("first_asset_passport_created", {
    ...common,
    captureSource: captureSource(input),
    elapsedTimeBand: elapsedBand(
      workspaceCreatedAt,
      assetCreatedAt
    )
  });
}

export function criticalRegisterCompletedEvent(
  common: PilotAnalyticsCommon,
  workspaceCreatedAt: string,
  completedAt: string
): AnalyticsEvent<"critical_register_25_completed"> {
  return createPrivacySafeEvent("critical_register_25_completed", {
    ...common,
    completionTimeBand: completionBand(
      workspaceCreatedAt,
      completedAt
    )
  });
}

export function assetRetrievalCompletedEvent(
  common: PilotAnalyticsCommon,
  retrievalSource: AssetRetrievalSource
): AnalyticsEvent<"asset_retrieval_completed"> {
  return createPrivacySafeEvent("asset_retrieval_completed", {
    ...common,
    resultEntityType: "asset",
    retrievalSource
  });
}

export function accessGrantCreatedEvent(
  common: PilotAnalyticsCommon,
  role: "editor" | "viewer",
  expiresInHours: number
): AnalyticsEvent<"access_grant_created"> {
  return createPrivacySafeEvent("access_grant_created", {
    ...common,
    role,
    expiryBand: expiryBand(expiresInHours)
  });
}

export function continuitySnapshotExportedEvent(
  common: PilotAnalyticsCommon,
  format: "pdf" | "json-manifest",
  assetCount: number,
  redacted: boolean
): AnalyticsEvent<"continuity_snapshot_exported"> {
  return createPrivacySafeEvent("continuity_snapshot_exported", {
    ...common,
    format,
    assetCountBand: assetCountBand(assetCount),
    redacted
  });
}
