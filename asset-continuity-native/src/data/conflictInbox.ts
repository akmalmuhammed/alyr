import type {
  JsonValue,
  SyncChange,
  SyncConflict,
  SyncOperation
} from "@alyr/contracts";

import type { LanguageCode, NativeWorkspace } from "@/domain/model";
import {
  getPortfolioValueRecords,
  portfolioValueSubject
} from "@/domain/portfolio";
import {
  formatRecordedValue,
  type ValueVisibility
} from "@/privacy/ValueVisibility";

export type ConflictResolutionChoice =
  | "keep-cloud"
  | "reapply-local"
  | "review-manually";

export interface ConflictResolutionMarker {
  readonly kind: "reapply-local";
  readonly replacementOperationId: string;
  readonly requestedAt: string;
}

export interface ConflictClientContext {
  readonly contextVersion: 1;
  readonly householdId: string;
  readonly localOperation: SyncOperation;
  readonly serverChange: SyncChange | null;
  readonly receivedAt: string;
  readonly resolution: ConflictResolutionMarker | null;
}

export interface DurableSyncConflict extends SyncConflict {
  readonly clientContext: ConflictClientContext;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function serverChangeMatchesVersion(
  change: SyncChange,
  serverVersion: number,
  commandType?: SyncOperation["command"]["type"]
): boolean {
  const body = change.body;
  const result =
    isObject(body) && isObject(body.result) ? body.result : null;
  if (commandType === "asset.move") {
    return result?.locationVersion === serverVersion;
  }
  if (commandType === "evidence.version.add") {
    return result?.evidenceVersionNumber === serverVersion;
  }
  if (change.version === serverVersion) return true;
  if (!result) return false;
  return (
    result.locationVersion === serverVersion ||
    result.evidenceVersionNumber === serverVersion
  );
}

export function isDurableSyncConflict(
  value: SyncConflict,
  householdId?: string
): value is DurableSyncConflict {
  const context = (value as { clientContext?: unknown }).clientContext;
  if (!isObject(context) || context.contextVersion !== 1) return false;
  if (
    typeof context.householdId !== "string" ||
    (householdId !== undefined && context.householdId !== householdId) ||
    typeof context.receivedAt !== "string" ||
    !isObject(context.localOperation)
  ) {
    return false;
  }
  const operation = context.localOperation as unknown as SyncOperation;
  if (
    operation.operationId !== value.operationId ||
    operation.householdId !== context.householdId ||
    operation.command.householdId !== context.householdId ||
    operation.command.aggregateId !== value.entityId
  ) {
    return false;
  }
  const serverChange = context.serverChange as SyncChange | null;
  if (
    serverChange !== null &&
    (!isObject(serverChange) ||
      serverChange.householdId !== context.householdId ||
      serverChange.entityId !== value.entityId ||
      !serverChangeMatchesVersion(
        serverChange,
        value.serverVersion,
        operation.command.type
      ))
  ) {
    return false;
  }
  const resolution = context.resolution as
    | ConflictResolutionMarker
    | null;
  return (
    resolution === null ||
    (isObject(resolution) &&
      resolution.kind === "reapply-local" &&
      typeof resolution.replacementOperationId === "string" &&
      resolution.replacementOperationId.length > 0 &&
      typeof resolution.requestedAt === "string")
  );
}

function matchingServerChange(
  conflict: SyncConflict,
  changes: readonly SyncChange[],
  householdId: string,
  operation: SyncOperation
): SyncChange | null {
  const exact = changes
    .filter(
      (change) =>
        change.householdId === householdId &&
        change.entityId === conflict.entityId &&
        serverChangeMatchesVersion(
          change,
          conflict.serverVersion,
          operation.command.type
        )
    )
    .at(-1);
  return exact ?? null;
}

export function captureConflictContexts(
  incoming: readonly SyncConflict[],
  pushed: readonly SyncOperation[],
  changes: readonly SyncChange[],
  householdId: string,
  receivedAt: string
): readonly DurableSyncConflict[] {
  const operations = new Map(
    pushed.map((operation) => [operation.operationId, operation])
  );
  return incoming.map((conflict) => {
    const operation = operations.get(conflict.operationId);
    if (
      !operation ||
      operation.householdId !== householdId ||
      operation.command.householdId !== householdId ||
      operation.command.aggregateId !== conflict.entityId
    ) {
      throw new Error(
        "The sync conflict does not match a local household operation."
      );
    }
    return {
      ...conflict,
      clientContext: {
        contextVersion: 1,
        householdId,
        localOperation: operation,
        serverChange: matchingServerChange(
          conflict,
          changes,
          householdId,
          operation
        ),
        receivedAt,
        resolution: null
      }
    };
  });
}

export function conflictReplacementOperationId(
  conflict: SyncConflict
): string | null {
  return isDurableSyncConflict(conflict)
    ? conflict.clientContext.resolution?.replacementOperationId ?? null
    : null;
}

export function markConflictReapplying(
  conflict: DurableSyncConflict,
  replacementOperationId: string,
  requestedAt: string
): DurableSyncConflict {
  return {
    ...conflict,
    clientContext: {
      ...conflict.clientContext,
      resolution: {
        kind: "reapply-local",
        replacementOperationId,
        requestedAt
      }
    }
  };
}

const REAPPLY_COMMANDS = new Set([
  "place.update",
  "space.update",
  "asset.update",
  "asset.move",
  "asset.archive",
  "asset.restore",
  "evidence.review",
  "value.update",
  "value.delete"
]);

export function conflictResolutionOptions(
  conflict: SyncConflict
): readonly ConflictResolutionChoice[] {
  const options: ConflictResolutionChoice[] = [];
  if (
    isDurableSyncConflict(conflict) &&
    conflict.clientContext.serverChange !== null &&
    conflict.conflictKind !== "permission"
  ) {
    options.push("keep-cloud");
  }
  if (
    isDurableSyncConflict(conflict) &&
    conflict.conflictKind !== "permission" &&
    conflict.conflictKind !== "ownership" &&
    conflict.conflictKind !== "identifier" &&
    REAPPLY_COMMANDS.has(conflict.clientContext.localOperation.command.type)
  ) {
    options.push("reapply-local");
  }
  options.push("review-manually");
  return options;
}

export function createConflictReapplyOperation(
  conflict: DurableSyncConflict,
  operationId: string,
  requestedAt: string
): SyncOperation {
  if (!conflictResolutionOptions(conflict).includes("reapply-local")) {
    throw new Error("This conflict requires manual review.");
  }
  const original = conflict.clientContext.localOperation;
  return {
    ...original,
    operationId,
    command: {
      ...original.command,
      commandId: operationId,
      idempotencyKey: operationId,
      observedVersion: conflict.serverVersion,
      occurredAt: requestedAt
    },
    status: "on-device",
    attemptCount: 0,
    nextAttemptAt: null,
    lastErrorCode: null,
    createdAt: requestedAt,
    updatedAt: requestedAt
  };
}

export function conflictRecordLabel(
  conflict: SyncConflict,
  workspace: NativeWorkspace
): string {
  const asset = workspace.assets.find(
    (candidate) => candidate.id === conflict.entityId
  );
  if (asset) return asset.name;
  const place = workspace.places.find(
    (candidate) => candidate.id === conflict.entityId
  );
  if (place) return place.name;
  for (const candidate of workspace.places) {
    const room = candidate.rooms.find(
      (entry) => entry.id === conflict.entityId
    );
    if (room) return `${candidate.name} · ${room.name}`;
  }
  const value = getPortfolioValueRecords(workspace).find(
    (candidate) => candidate.id === conflict.entityId
  );
  if (value) {
    const subject = portfolioValueSubject(value);
    if (subject?.kind === "asset") {
      return (
        workspace.assets.find(
          (candidate) => candidate.id === subject.assetId
        )?.name ?? "Recorded value"
      );
    }
  }
  return `Record ${conflict.entityId.slice(0, 8)}`;
}

export function conflictFieldLabel(conflict: SyncConflict): string {
  if (conflict.conflictKind === "permission") return "Household access";
  if (conflict.conflictKind === "ownership") return "Ownership";
  if (conflict.conflictKind === "identifier") return "Identifier";
  if (conflict.conflictKind === "value") return "Recorded value";
  if (!isDurableSyncConflict(conflict)) {
    return conflict.conflictKind === "location" ? "Location" : "Record";
  }
  const type = conflict.clientContext.localOperation.command.type;
  const payload = conflict.clientContext.localOperation.command.payload;
  if (type === "asset.move") return "Location";
  if (type === "asset.update") {
    return typeof payload.name === "string" ? "Item name" : "Item details";
  }
  if (type === "place.update") {
    return ["latitude", "longitude", "locationSource"].some(
      (key) => Object.prototype.hasOwnProperty.call(payload, key)
    )
      ? "Location"
      : "Place details";
  }
  if (type === "space.update") return "Space details";
  if (type === "asset.archive" || type === "asset.restore") {
    return "Lifecycle";
  }
  if (type === "evidence.review") return "Evidence review";
  return "Record details";
}

function commandPayload(
  conflict: DurableSyncConflict
): Readonly<Record<string, JsonValue>> {
  return conflict.clientContext.localOperation.command.payload;
}

function serverPayload(
  conflict: DurableSyncConflict
): Readonly<Record<string, JsonValue>> | null {
  const body = conflict.clientContext.serverChange?.body;
  if (!isObject(body) || !isObject(body.payload)) return null;
  return body.payload as Readonly<Record<string, JsonValue>>;
}

function coordinateSummary(
  payload: Readonly<Record<string, JsonValue>>
): string | null {
  const latitude = payload.latitude;
  const longitude = payload.longitude;
  return typeof latitude === "number" && typeof longitude === "number"
    ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
    : null;
}

function valueSummary(
  payload: Readonly<Record<string, JsonValue>>,
  options?: {
    readonly accessibility?: boolean;
    readonly language: LanguageCode;
    readonly visibility: ValueVisibility;
  }
): string | null {
  const amountMinor = payload.amountMinor;
  const currency = payload.currency;
  const asOf = payload.asOf;
  if (typeof amountMinor !== "number" || typeof currency !== "string") {
    return null;
  }
  const resolvedOptions: {
    readonly accessibility?: boolean;
    readonly language: LanguageCode;
    readonly visibility: ValueVisibility;
  } = options ?? {
    language: "en",
    visibility: "hidden"
  };
  const formatted = formatRecordedValue({
    amountMinor,
    currency,
    language: resolvedOptions.language,
    visibility: resolvedOptions.visibility
  });
  const amount = resolvedOptions.accessibility
    ? formatted.accessibilityLabel
    : formatted.text;
  return `${amount}${typeof asOf === "string" ? ` · ${asOf}` : ""}`;
}

function locationSummary(
  payload: Readonly<Record<string, JsonValue>>
): string | null {
  return (
    coordinateSummary(payload) ??
    (typeof payload.locationDetail === "string" &&
    payload.locationDetail.trim()
      ? payload.locationDetail.trim()
      : typeof payload.locatorText === "string" &&
          payload.locatorText.trim()
        ? payload.locatorText.trim()
      : typeof payload.placeId === "string"
        ? `Place ${payload.placeId.slice(0, 8)}`
        : payload.placeId === null
          ? "Location not set"
          : null)
  );
}

function lifecycleSummary(
  conflict: DurableSyncConflict,
  local: boolean
): string | null {
  const type = local
    ? conflict.clientContext.localOperation.command.type
    : (() => {
        const body = conflict.clientContext.serverChange?.body;
        return isObject(body) && typeof body.command === "string"
          ? body.command
          : null;
      })();
  if (type === "asset.archive") return "Archived";
  if (type === "asset.restore") return "Active";
  return null;
}

function detailSummary(
  payload: Readonly<Record<string, JsonValue>>,
  commandType: string | null
): string | null {
  if (commandType === "asset.update") {
    if (typeof payload.name === "string" && payload.name.trim()) {
      return payload.name.trim();
    }
    if (
      typeof payload.categoryId === "string" &&
      payload.categoryId.trim()
    ) {
      return payload.categoryId.trim().replace(/[._-]+/gu, " ");
    }
  }
  if (commandType === "place.update") {
    const location = locationSummary(payload);
    if (location) return location;
    const parts = [payload.name, payload.regionLabel, payload.addressSummary]
      .filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0
      )
      .map((value) => value.trim());
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  if (commandType === "space.update") {
    const parts = [payload.name, payload.kind]
      .filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0
      )
      .map((value) => value.trim());
    return parts.length > 0 ? parts.join(" · ") : null;
  }
  if (commandType === "evidence.review") {
    return payload.reviewStatus === "reviewed"
      ? "Reviewed"
      : payload.reviewStatus === "pending"
        ? "Pending review"
        : null;
  }
  return null;
}

function serverCommandType(conflict: DurableSyncConflict): string | null {
  const body = conflict.clientContext.serverChange?.body;
  return isObject(body) && typeof body.command === "string"
    ? body.command
    : null;
}

export function conflictProvenanceValues(
  conflict: SyncConflict,
  valueOptions?: {
    readonly accessibility?: boolean;
    readonly language: LanguageCode;
    readonly visibility: ValueVisibility;
  }
): {
  readonly local: string;
  readonly cloud: string;
  readonly cloudVerified: boolean;
} {
  if (!isDurableSyncConflict(conflict)) {
    return {
      local: "Local change preserved on this device",
      cloud: `Cloud version ${conflict.serverVersion}`,
      cloudVerified: false
    };
  }
  const localPayload = commandPayload(conflict);
  const cloudPayload = serverPayload(conflict);
  const localCommand =
    conflict.clientContext.localOperation.command.type;
  const cloudCommand = serverCommandType(conflict);
  const localIsLocation =
    localCommand === "asset.move" ||
    (localCommand === "place.update" &&
      ["latitude", "longitude", "locationSource"].some((key) =>
        Object.prototype.hasOwnProperty.call(localPayload, key)
      ));
  const cloudIsLocation =
    cloudCommand === "asset.move" ||
    (cloudCommand === "place.update" &&
      cloudPayload !== null &&
      ["latitude", "longitude", "locationSource"].some((key) =>
        Object.prototype.hasOwnProperty.call(cloudPayload, key)
      ));
  const local =
    conflict.conflictKind === "value"
      ? valueSummary(localPayload, valueOptions)
      : localIsLocation
        ? locationSummary(localPayload)
        : lifecycleSummary(conflict, true) ??
          detailSummary(localPayload, localCommand);
  const cloud =
    cloudPayload === null
      ? null
      : conflict.conflictKind === "value"
        ? valueSummary(cloudPayload, valueOptions)
        : cloudIsLocation
          ? locationSummary(cloudPayload)
          : lifecycleSummary(conflict, false) ??
            detailSummary(cloudPayload, cloudCommand);
  return {
    local: local ?? "Local edited record",
    cloud: cloud ?? `Cloud version ${conflict.serverVersion}`,
    cloudVerified: cloud !== null
  };
}

export function conflictManualReviewRoute(
  conflict: SyncConflict,
  workspace: NativeWorkspace
): string {
  if (conflict.conflictKind === "permission") return "/family";
  const asset = workspace.assets.find(
    (candidate) => candidate.id === conflict.entityId
  );
  if (asset) return `/asset/${asset.id}`;
  const place = workspace.places.find(
    (candidate) => candidate.id === conflict.entityId
  );
  if (place) return `/place/${place.id}`;
  for (const candidate of workspace.places) {
    if (
      candidate.rooms.some((entry) => entry.id === conflict.entityId)
    ) {
      return `/place/${candidate.id}`;
    }
  }
  const value = getPortfolioValueRecords(workspace).find(
    (candidate) => candidate.id === conflict.entityId
  );
  const subject = value ? portfolioValueSubject(value) : null;
  if (subject?.kind === "asset") return `/asset/${subject.assetId}`;
  return "/vault";
}

export function conflictServerOperationId(
  conflict: DurableSyncConflict
): string | null {
  const body = conflict.clientContext.serverChange?.body;
  return isObject(body) && typeof body.operationId === "string"
    ? body.operationId
    : null;
}
