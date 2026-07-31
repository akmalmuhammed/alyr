import {
  API_ERROR_VERSION,
  type ApiErrorCode,
  type HouseholdStorageUsagePort,
  type HouseholdStorageUsageResponse,
  type ProviderRequestContext,
  type Result
} from "@alyr/contracts";

import {
  assertProviderRequestActive,
  rethrowProviderCancellation
} from "@/adapters/providerRequest";
import {
  isHouseholdStorageByteCount,
  isHouseholdStorageMeasurementTime
} from "@/domain/vaultStorage";
import type {
  AccessTokenProvider,
  SyncFetch
} from "./httpSyncTransport";

export interface HttpHouseholdStorageOptions {
  readonly baseUrl: string;
  readonly getAccessToken: AccessTokenProvider;
  readonly fetchImpl?: SyncFetch;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const responseKeys = [
  "allowanceBytes",
  "householdId",
  "measuredAt",
  "source",
  "usedBytes"
] as const;
const MAX_HOUSEHOLD_STORAGE_RESPONSE_BYTES = 2_048;

function failure<T>(
  code: ApiErrorCode,
  message: string,
  retryable: boolean
): Result<T> {
  return {
    ok: false,
    error: {
      errorVersion: API_ERROR_VERSION,
      code,
      message,
      retryable
    }
  };
}

function normalizeHttpsBase(value: string): string {
  const normalized = value.trim().replace(/\/+$/u, "");
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("The household storage API base URL must be valid HTTPS.");
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("The household storage API base URL must be valid HTTPS.");
  }
  return parsed.toString().replace(/\/+$/u, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNoStore(response: Response): boolean {
  return Boolean(
    response.headers
      .get("Cache-Control")
      ?.split(",")
      .some((directive) => directive.trim().toLowerCase() === "no-store")
  );
}

function hasJsonContentType(response: Response): boolean {
  const contentType = response.headers.get("Content-Type");
  if (!contentType) return false;
  const [mediaType, ...parameters] = contentType.split(";");
  if (mediaType?.trim().toLowerCase() !== "application/json") {
    return false;
  }
  return parameters.every((parameter) => {
    const [rawName, ...rawValue] = parameter.split("=");
    if (rawName?.trim().toLowerCase() !== "charset") return true;
    const charset = rawValue
      .join("=")
      .trim()
      .replace(/^"|"$/gu, "")
      .toLowerCase();
    return charset === "utf-8" || charset === "utf8";
  });
}

function utf8ByteLength(value: string): number {
  let byteLength = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    byteLength +=
      codePoint <= 0x7f
        ? 1
        : codePoint <= 0x7ff
          ? 2
          : codePoint <= 0xffff
            ? 3
            : 4;
  }
  return byteLength;
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Rejection is already final; transport cleanup is best effort.
  }
}

async function readBoundedResponseText(
  response: Response,
  context?: ProviderRequestContext
): Promise<string | null> {
  const declaredHeader = response.headers.get("Content-Length");
  let declaredLength: number | null = null;
  if (declaredHeader !== null) {
    if (!/^\d+$/u.test(declaredHeader)) {
      await cancelResponseBody(response);
      return null;
    }
    declaredLength = Number(declaredHeader);
    if (
      !Number.isSafeInteger(declaredLength) ||
      declaredLength < 1 ||
      declaredLength > MAX_HOUSEHOLD_STORAGE_RESPONSE_BYTES
    ) {
      await cancelResponseBody(response);
      return null;
    }
  }

  const stream = response.body;
  if (stream && typeof stream.getReader === "function") {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;
    try {
      while (true) {
        assertProviderRequestActive(context);
        const result = await reader.read();
        if (result.done) break;
        const chunk = result.value;
        receivedBytes += chunk.byteLength;
        if (receivedBytes > MAX_HOUSEHOLD_STORAGE_RESPONSE_BYTES) {
          await reader.cancel();
          return null;
        }
        chunks.push(chunk);
      }
    } catch (error) {
      rethrowProviderCancellation(error, context);
      return null;
    } finally {
      reader.releaseLock();
    }
    if (
      receivedBytes < 1 ||
      (declaredLength !== null && receivedBytes !== declaredLength)
    ) {
      return null;
    }
    let text = "";
    for (const chunk of chunks) {
      text += String.fromCharCode(...chunk);
    }
    return text;
  }

  // React Native implementations without response streaming must provide a
  // bounded Content-Length before the body is materialized in JavaScript.
  if (declaredLength === null) return null;
  try {
    const text = await response.text();
    assertProviderRequestActive(context);
    return utf8ByteLength(text) === declaredLength ? text : null;
  } catch (error) {
    rethrowProviderCancellation(error, context);
    return null;
  }
}

function parseUsage(
  value: unknown,
  expectedHouseholdId: string
): HouseholdStorageUsageResponse | null {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== responseKeys.length ||
    responseKeys.some(
      (key) => !Object.prototype.hasOwnProperty.call(value, key)
    ) ||
    value.householdId !== expectedHouseholdId ||
    !uuidPattern.test(
      typeof value.householdId === "string" ? value.householdId : ""
    ) ||
    value.source !== "server-confirmed" ||
    !isHouseholdStorageByteCount(value.usedBytes, { positive: false }) ||
    !isHouseholdStorageByteCount(value.allowanceBytes, {
      positive: true
    }) ||
    !isHouseholdStorageMeasurementTime(value.measuredAt)
  ) {
    return null;
  }
  return {
    householdId: value.householdId,
    source: value.source,
    usedBytes: value.usedBytes,
    allowanceBytes: value.allowanceBytes,
    measuredAt: value.measuredAt
  };
}

function responseFailure<T>(status: number): Result<T> {
  if (status === 401) {
    return failure(
      "SESSION_EXPIRED",
      "Sign in again before checking household storage.",
      true
    );
  }
  if (status === 403) {
    return failure(
      "AUTHORIZATION_DENIED",
      "This household does not allow storage usage access.",
      false
    );
  }
  if (status === 404) {
    return failure(
      "NOT_FOUND",
      "Household storage usage was not found.",
      false
    );
  }
  if (status === 429) {
    return failure(
      "RATE_LIMITED",
      "Household storage usage is temporarily rate limited.",
      true
    );
  }
  return failure(
    status >= 500 ? "STORAGE_UNAVAILABLE" : "VALIDATION_FAILED",
    "Household storage usage was not available.",
    status >= 500
  );
}

export class HttpHouseholdStorage implements HouseholdStorageUsagePort {
  private readonly baseUrl: string;
  private readonly getAccessToken: AccessTokenProvider;
  private readonly fetchImpl: SyncFetch;

  constructor(options: HttpHouseholdStorageOptions) {
    this.baseUrl = normalizeHttpsBase(options.baseUrl);
    this.getAccessToken = options.getAccessToken;
    this.fetchImpl =
      options.fetchImpl ??
      ((input, init) => globalThis.fetch(input, init));
  }

  async getUsage(
    householdId: string,
    context?: ProviderRequestContext
  ): Promise<Result<HouseholdStorageUsageResponse>> {
    if (!uuidPattern.test(householdId)) {
      return failure(
        "VALIDATION_FAILED",
        "Choose a valid household before checking storage.",
        false
      );
    }
    const normalizedHouseholdId = householdId.toLowerCase();
    assertProviderRequestActive(context);

    let accessToken: string;
    try {
      accessToken = (await this.getAccessToken()).trim();
      assertProviderRequestActive(context);
    } catch (error) {
      rethrowProviderCancellation(error, context);
      return failure(
        "SESSION_EXPIRED",
        "Sign in again before checking household storage.",
        true
      );
    }
    if (!accessToken) {
      return failure(
        "AUTHENTICATION_REQUIRED",
        "Sign in before checking household storage.",
        false
      );
    }

    let response: Response;
    try {
      response = await this.fetchImpl(
        `${this.baseUrl}/household-storage?householdId=${encodeURIComponent(
          normalizedHouseholdId
        )}`,
        {
          method: "GET",
          cache: "no-store",
          redirect: "error",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
            "Cache-Control": "no-store"
          },
          ...(context ? { signal: context.signal } : {})
        }
      );
      assertProviderRequestActive(context);
    } catch (error) {
      rethrowProviderCancellation(error, context);
      return failure(
        "OFFLINE",
        "The household storage service could not be reached.",
        true
      );
    }

    // Caching is forbidden for both usage and authorization/error responses;
    // otherwise a shared intermediary could replay household state or access
    // outcomes. Close every rejected/error body without parsing it.
    if (!hasNoStore(response)) {
      await cancelResponseBody(response);
      return failure(
        "VALIDATION_FAILED",
        "The household storage service returned a malformed response.",
        false
      );
    }

    if (!response.ok) {
      await cancelResponseBody(response);
      return responseFailure(response.status);
    }

    if (!hasJsonContentType(response)) {
      await cancelResponseBody(response);
      return failure(
        "VALIDATION_FAILED",
        "The household storage service returned a malformed response.",
        false
      );
    }

    let payload: unknown;
    try {
      const responseText = await readBoundedResponseText(response, context);
      if (responseText === null) {
        return failure(
          "VALIDATION_FAILED",
          "The household storage service returned a malformed response.",
          false
        );
      }
      payload = JSON.parse(responseText) as unknown;
      assertProviderRequestActive(context);
    } catch (error) {
      rethrowProviderCancellation(error, context);
      return failure(
        "VALIDATION_FAILED",
        "The household storage service returned a malformed response.",
        false
      );
    }
    const usage = parseUsage(payload, normalizedHouseholdId);
    return usage
      ? { ok: true, value: usage }
      : failure(
          "VALIDATION_FAILED",
          "The household storage service returned a malformed response.",
          false
        );
  }
}
