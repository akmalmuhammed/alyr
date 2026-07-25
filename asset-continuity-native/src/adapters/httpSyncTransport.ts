import {
  API_ERROR_VERSION,
  CONTRACT_API_VERSION,
  type ApiErrorCode,
  type ContractError,
  type HouseholdId,
  type JsonObject,
  type JsonPrimitive,
  type Result,
  type SyncChange,
  type SyncConflict,
  type SyncCursor,
  type SyncOperation,
  type SyncPullResponse,
  type SyncPushRequest,
  type SyncPushResponse,
  type SyncTransport
} from "@alyr/contracts"

export type AccessTokenProvider = () => Promise<string>
export type SyncFetch = (url: string, init: RequestInit) => Promise<Response>

export interface HttpSyncTransportOptions {
  readonly baseUrl: string
  readonly getAccessToken: AccessTokenProvider
  readonly fetchImpl?: SyncFetch
}

const apiErrorCodes: readonly ApiErrorCode[] = [
  "AUTHENTICATION_REQUIRED",
  "AUTHORIZATION_DENIED",
  "CONFLICT_REQUIRES_REVIEW",
  "IDEMPOTENCY_CONFLICT",
  "INVALID_COMMAND",
  "INVALID_CURSOR",
  "INVALID_FILE",
  "NOT_FOUND",
  "OFFLINE",
  "QUOTA_EXCEEDED",
  "RATE_LIMITED",
  "SESSION_EXPIRED",
  "STORAGE_UNAVAILABLE",
  "UNSUPPORTED_CONTRACT_VERSION",
  "VALIDATION_FAILED"
]

const conflictKinds: readonly SyncConflict["conflictKind"][] = [
  "location",
  "ownership",
  "permission",
  "value",
  "identifier",
  "lifecycle"
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return (
    typeof value === "string" && apiErrorCodes.some((code) => code === value)
  )
}

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return (
    value === null ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "boolean"
  )
}

function isSafeIntegerAtLeast(
  value: unknown,
  minimum: number
): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum
  )
}

function isJsonPrimitiveRecord(
  value: unknown
): value is Readonly<Record<string, JsonPrimitive>> {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) => isJsonPrimitive(entry))
  )
}

function isContractError(value: unknown): value is ContractError {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.errorVersion === API_ERROR_VERSION &&
    isApiErrorCode(value.code) &&
    typeof value.message === "string" &&
    typeof value.retryable === "boolean" &&
    (!Object.prototype.hasOwnProperty.call(value, "details") ||
      isJsonPrimitiveRecord(value.details))
  )
}

function contractErrorFrom(value: unknown): ContractError | null {
  if (isRecord(value) && isContractError(value.error)) {
    return value.error
  }

  return isContractError(value) ? value : null
}

function isSyncCursor(value: unknown): value is SyncCursor {
  return (
    isRecord(value) &&
    value.cursorVersion === 1 &&
    (typeof value.value === "string" || value.value === null) &&
    (typeof value.issuedAt === "string" || value.issuedAt === null)
  )
}

function isConflictKind(
  value: unknown
): value is SyncConflict["conflictKind"] {
  return (
    typeof value === "string" &&
    conflictKinds.some((conflictKind) => conflictKind === value)
  )
}

function isSyncConflict(value: unknown): value is SyncConflict {
  return (
    isRecord(value) &&
    typeof value.operationId === "string" &&
    typeof value.entityId === "string" &&
    isConflictKind(value.conflictKind) &&
    isSafeIntegerAtLeast(value.serverVersion, 0) &&
    typeof value.message === "string"
  )
}

function isJsonValue(value: unknown): boolean {
  if (isJsonPrimitive(value)) {
    return true
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry))
  }

  return (
    isRecord(value) && Object.values(value).every((entry) => isJsonValue(entry))
  )
}

function isJsonObject(value: unknown): value is JsonObject {
  return (
    isRecord(value) && Object.values(value).every((entry) => isJsonValue(entry))
  )
}

function isSyncChange(value: unknown): value is SyncChange {
  return (
    isRecord(value) &&
    isSafeIntegerAtLeast(value.sequence, 1) &&
    typeof value.entityType === "string" &&
    typeof value.entityId === "string" &&
    typeof value.householdId === "string" &&
    isSafeIntegerAtLeast(value.version, 1) &&
    typeof value.tombstoned === "boolean" &&
    (value.body === null || isJsonObject(value.body)) &&
    typeof value.changedAt === "string"
  )
}

function isSyncPushResponse(value: unknown): value is SyncPushResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.acknowledgedOperationIds) &&
    value.acknowledgedOperationIds.every(
      (operationId) => typeof operationId === "string"
    ) &&
    Array.isArray(value.conflicts) &&
    value.conflicts.every((conflict) => isSyncConflict(conflict)) &&
    isSyncCursor(value.cursor)
  )
}

function isSyncPullResponse(value: unknown): value is SyncPullResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.changes) &&
    value.changes.every((change) => isSyncChange(change)) &&
    isSyncCursor(value.cursor)
  )
}

function offlineFailure<T>(): Result<T> {
  return {
    ok: false,
    error: {
      errorVersion: API_ERROR_VERSION,
      code: "OFFLINE",
      message: "The sync service could not be reached.",
      retryable: true
    }
  }
}

function validationFailure<T>(): Result<T> {
  return {
    ok: false,
    error: {
      errorVersion: API_ERROR_VERSION,
      code: "VALIDATION_FAILED",
      message: "The sync service returned a malformed response.",
      retryable: false
    }
  }
}

type ResponseGuard<T> = (value: unknown) => value is T

export class HttpSyncTransport implements SyncTransport {
  private readonly baseUrl: string
  private readonly getAccessToken: AccessTokenProvider
  private readonly fetchImpl: SyncFetch

  constructor(options: HttpSyncTransportOptions) {
    this.baseUrl = options.baseUrl.trim().replace(/\/+$/, "")
    this.getAccessToken = options.getAccessToken
    this.fetchImpl =
      options.fetchImpl ??
      ((input, init) => {
        return globalThis.fetch(input, init)
      })
  }

  async push(
    operations: readonly SyncOperation[]
  ): Promise<Result<SyncPushResponse>> {
    const request: SyncPushRequest = {
      apiVersion: CONTRACT_API_VERSION,
      operations
    }

    return this.request(
      `${this.baseUrl}/sync/push`,
      "POST",
      JSON.stringify(request),
      isSyncPushResponse
    )
  }

  async pull(
    householdId: HouseholdId,
    cursor: SyncCursor
  ): Promise<Result<SyncPullResponse>> {
    const query =
      `householdId=${encodeURIComponent(householdId)}` +
      `&cursor=${encodeURIComponent(cursor.value ?? "")}`

    return this.request(
      `${this.baseUrl}/sync/pull?${query}`,
      "GET",
      undefined,
      isSyncPullResponse
    )
  }

  private async request<T>(
    url: string,
    method: "GET" | "POST",
    body: string | undefined,
    isSuccess: ResponseGuard<T>
  ): Promise<Result<T>> {
    let accessToken: string
    try {
      accessToken = (await this.getAccessToken()).trim()
    } catch {
      return offlineFailure()
    }

    if (accessToken.length === 0) {
      return {
        ok: false,
        error: {
          errorVersion: API_ERROR_VERSION,
          code: "AUTHENTICATION_REQUIRED",
          message: "Sign in before syncing.",
          retryable: false
        }
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`
    }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json"
    }

    let response: Response
    try {
      response = await this.fetchImpl(
        url,
        body === undefined
          ? { method, headers }
          : { method, headers, body }
      )
    } catch {
      return offlineFailure()
    }

    let responseText: string
    try {
      responseText = await response.text()
    } catch {
      return offlineFailure()
    }

    let payload: unknown
    try {
      payload = JSON.parse(responseText) as unknown
    } catch {
      return validationFailure()
    }

    if (!response.ok) {
      const error = contractErrorFrom(payload)
      return error === null ? validationFailure() : { ok: false, error }
    }

    return isSuccess(payload)
      ? { ok: true, value: payload }
      : validationFailure()
  }
}
