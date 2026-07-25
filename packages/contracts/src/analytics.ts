export const ANALYTICS_SCHEMA_VERSION = 1 as const;

export const ANALYTICS_EVENT_ALLOW_LIST = {
  pilot_invitation_accepted: [
    "schemaVersion",
    "platform",
    "appVersion",
    "locale",
    "occurredOffline",
    "invitationChannel",
  ],
  household_created: [
    "schemaVersion",
    "platform",
    "appVersion",
    "locale",
    "occurredOffline",
    "creationMode",
  ],
  first_asset_passport_created: [
    "schemaVersion",
    "platform",
    "appVersion",
    "locale",
    "occurredOffline",
    "captureSource",
    "elapsedTimeBand",
  ],
  asset_location_confirmed: [
    "schemaVersion",
    "platform",
    "appVersion",
    "locale",
    "occurredOffline",
    "locationPrecision",
    "hierarchyDepth",
  ],
  first_evidence_reviewed: [
    "schemaVersion",
    "platform",
    "appVersion",
    "locale",
    "occurredOffline",
    "evidenceKind",
    "hasOriginal",
  ],
  critical_register_25_completed: [
    "schemaVersion",
    "platform",
    "appVersion",
    "locale",
    "occurredOffline",
    "completionTimeBand",
  ],
  asset_retrieval_completed: [
    "schemaVersion",
    "platform",
    "appVersion",
    "locale",
    "occurredOffline",
    "resultEntityType",
    "retrievalSource",
  ],
  access_grant_created: [
    "schemaVersion",
    "platform",
    "appVersion",
    "locale",
    "occurredOffline",
    "role",
    "expiryBand",
  ],
  continuity_snapshot_exported: [
    "schemaVersion",
    "platform",
    "appVersion",
    "locale",
    "occurredOffline",
    "format",
    "assetCountBand",
    "redacted",
  ],
  household_returned_day_30_45: [
    "schemaVersion",
    "platform",
    "appVersion",
    "locale",
    "occurredOffline",
    "returnDayBand",
  ],
  reservation_paid: [
    "schemaVersion",
    "platform",
    "appVersion",
    "locale",
    "occurredOffline",
    "planCode",
    "currency",
    "amountBand",
  ],
  pilot_contract_signed: [
    "schemaVersion",
    "platform",
    "appVersion",
    "locale",
    "occurredOffline",
    "partnerType",
    "annualizedValueBand",
  ],
} as const;

export type AnalyticsEventName = keyof typeof ANALYTICS_EVENT_ALLOW_LIST;

export interface AnalyticsCommonPayload {
  readonly schemaVersion: typeof ANALYTICS_SCHEMA_VERSION;
  readonly platform: "ios" | "android" | "web";
  readonly appVersion: string;
  readonly locale: "en" | "ar";
  readonly occurredOffline: boolean;
}

export interface AnalyticsPayloadByEvent {
  readonly pilot_invitation_accepted: AnalyticsCommonPayload & {
    readonly invitationChannel: "manual-code" | "deep-link";
  };
  readonly household_created: AnalyticsCommonPayload & {
    readonly creationMode: "sample" | "personal";
  };
  readonly first_asset_passport_created: AnalyticsCommonPayload & {
    readonly captureSource:
      | "camera"
      | "image-library"
      | "document-import"
      | "manual";
    readonly elapsedTimeBand:
      | "under-2-minutes"
      | "under-5-minutes"
      | "5-10-minutes"
      | "over-10-minutes";
  };
  readonly asset_location_confirmed: AnalyticsCommonPayload & {
    readonly locationPrecision:
      | "exact"
      | "user_placed"
      | "approximate"
      | "locality_only"
      | "unknown";
    readonly hierarchyDepth: number;
  };
  readonly first_evidence_reviewed: AnalyticsCommonPayload & {
    readonly evidenceKind:
      | "paper"
      | "artifact"
      | "media"
      | "record"
      | "note"
      | "link";
    readonly hasOriginal: boolean;
  };
  readonly critical_register_25_completed: AnalyticsCommonPayload & {
    readonly completionTimeBand:
      | "same-day"
      | "2-7-days"
      | "8-30-days"
      | "over-30-days";
  };
  readonly asset_retrieval_completed: AnalyticsCommonPayload & {
    readonly resultEntityType:
      | "asset"
      | "place"
      | "space"
      | "evidence"
      | "member";
    readonly retrievalSource:
      | "search"
      | "asset-list"
      | "place-view"
      | "deep-link";
  };
  readonly access_grant_created: AnalyticsCommonPayload & {
    readonly role: "owner" | "editor" | "viewer";
    readonly expiryBand:
      | "24-hours"
      | "7-days"
      | "30-days"
      | "no-expiry";
  };
  readonly continuity_snapshot_exported: AnalyticsCommonPayload & {
    readonly format: "pdf" | "json-manifest";
    readonly assetCountBand: "1-5" | "6-24" | "25-49" | "50-plus";
    readonly redacted: boolean;
  };
  readonly household_returned_day_30_45: AnalyticsCommonPayload & {
    readonly returnDayBand: "30-34" | "35-39" | "40-45";
  };
  readonly reservation_paid: AnalyticsCommonPayload & {
    readonly planCode: "pilot-household" | "pilot-partner";
    readonly currency: string;
    readonly amountBand:
      | "under-100"
      | "100-499"
      | "500-4999"
      | "5000-plus";
  };
  readonly pilot_contract_signed: AnalyticsCommonPayload & {
    readonly partnerType:
      | "broker"
      | "insurer"
      | "adviser"
      | "family-office"
      | "estate-professional"
      | "residence-manager"
      | "other";
    readonly annualizedValueBand:
      | "under-5000"
      | "5000-9999"
      | "10000-24999"
      | "25000-plus";
  };
}

export type AnalyticsPayload<
  TName extends AnalyticsEventName = AnalyticsEventName,
> = AnalyticsPayloadByEvent[TName];

export type AnalyticsEvent<
  TName extends AnalyticsEventName = AnalyticsEventName,
> = {
  readonly [TEventName in TName]: {
    readonly name: TEventName;
    readonly payload: AnalyticsPayloadByEvent[TEventName];
  };
}[TName];

export const ANALYTICS_PROHIBITED_KEY_FRAGMENTS = [
  "assetname",
  "address",
  "coordinate",
  "latitude",
  "longitude",
  "valueamount",
  "serial",
  "identifier",
  "search",
  "query",
  "document",
  "content",
  "filename",
  "checksum",
  "householdid",
  "memberid",
  "deviceid",
  "email",
  "phone",
  "invitecode",
] as const;
