import {
  CryptoDigestAlgorithm,
  digest
} from "expo-crypto";

import {
  API_ERROR_VERSION,
  type ApiErrorCode,
  type ContractError,
  type ExportStatusResponse,
  type JsonPrimitive,
  type RenderedExport,
  type Result
} from "@alyr/contracts";

import type {
  CloudExportCreateRequest,
  CloudExportPort
} from "@/data/cloudExport";
import type {
  AccessTokenProvider,
  SyncFetch
} from "./httpSyncTransport";

const MAX_EXPORT_BYTES = 5 * 1024 * 1024;
const checksumPattern = /^[a-f0-9]{64}$/u;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const idempotencyKeyPattern = /^[A-Za-z0-9._:-]{16,128}$/u;
const exportFileNamePattern = /^[A-Za-z0-9._-]{1,160}$/u;
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
];

type CompleteExportStatus = ExportStatusResponse & {
  readonly fileName: string | null;
  readonly mimeType: string | null;
  readonly byteSize: number | null;
  readonly checksumSha256: string | null;
  readonly completedAt: string | null;
};

export type ExportByteDigest = (
  bytes: Uint8Array
) => Promise<string>;

export interface HttpCloudExportOptions {
  readonly baseUrl: string;
  readonly getAccessToken: AccessTokenProvider;
  readonly fetchImpl?: SyncFetch;
  readonly digestBytes?: ExportByteDigest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return (
    value === null ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "boolean"
  );
}

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return (
    typeof value === "string" &&
    apiErrorCodes.some((candidate) => candidate === value)
  );
}

function isContractError(value: unknown): value is ContractError {
  return (
    isRecord(value) &&
    value.errorVersion === API_ERROR_VERSION &&
    isApiErrorCode(value.code) &&
    typeof value.message === "string" &&
    typeof value.retryable === "boolean" &&
    (!Object.prototype.hasOwnProperty.call(value, "details") ||
      (isRecord(value.details) &&
        Object.values(value.details).every(isJsonPrimitive)))
  );
}

function parseContractError(value: unknown): ContractError | null {
  if (isRecord(value) && isContractError(value.error)) {
    return value.error;
  }
  return isContractError(value) ? value : null;
}

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
    throw new Error("The Export API base URL must be valid HTTPS.");
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("The Export API base URL must be valid HTTPS.");
  }
  return parsed.toString().replace(/\/+$/u, "");
}

function isIsoDateTimeOrNull(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      value.includes("T") &&
      Number.isFinite(Date.parse(value)))
  );
}

function parseStatus(value: unknown): CompleteExportStatus | null {
  if (!isRecord(value)) return null;
  const status = value.status;
  const validStatus =
    status === "queued" ||
    status === "processing" ||
    status === "ready" ||
    status === "failed" ||
    status === "expired";
  const error =
    value.error === null
      ? null
      : isContractError(value.error)
        ? value.error
        : undefined;
  if (
    !uuidPattern.test(
      typeof value.exportId === "string" ? value.exportId : ""
    ) ||
    !validStatus ||
    !(typeof value.blobObjectId === "string" ||
      value.blobObjectId === null) ||
    !isIsoDateTimeOrNull(value.expiresAt) ||
    !isIsoDateTimeOrNull(value.completedAt) ||
    error === undefined ||
    !(typeof value.fileName === "string" || value.fileName === null) ||
    !(typeof value.mimeType === "string" || value.mimeType === null) ||
    !(typeof value.byteSize === "number" || value.byteSize === null) ||
    !(typeof value.checksumSha256 === "string" ||
      value.checksumSha256 === null)
  ) {
    return null;
  }

  if (status === "ready") {
    if (
      typeof value.fileName !== "string" ||
      !exportFileNamePattern.test(value.fileName) ||
      (value.mimeType !== "application/json" &&
        value.mimeType !== "application/pdf") ||
      typeof value.byteSize !== "number" ||
      !Number.isSafeInteger(value.byteSize) ||
      value.byteSize < 1 ||
      value.byteSize > MAX_EXPORT_BYTES ||
      typeof value.checksumSha256 !== "string" ||
      !checksumPattern.test(value.checksumSha256) ||
      typeof value.expiresAt !== "string" ||
      typeof value.completedAt !== "string" ||
      error !== null
    ) {
      return null;
    }
  } else if (
    value.fileName !== null ||
    value.mimeType !== null ||
    value.byteSize !== null ||
    value.checksumSha256 !== null
  ) {
    return null;
  }

  return {
    exportId: value.exportId as string,
    status,
    blobObjectId: value.blobObjectId as string | null,
    fileName: value.fileName,
    mimeType: value.mimeType,
    byteSize: value.byteSize,
    checksumSha256: value.checksumSha256,
    expiresAt: value.expiresAt,
    completedAt: value.completedAt,
    error
  };
}

function validCreateRequest(
  request: CloudExportCreateRequest
): boolean {
  return (
    request.apiVersion === 1 &&
    uuidPattern.test(request.householdId) &&
    (request.format === "pdf" ||
      request.format === "json-manifest") &&
    request.assetIds.length <= 500 &&
    request.assetIds.every((assetId) => uuidPattern.test(assetId)) &&
    new Set(request.assetIds).size === request.assetIds.length &&
    typeof request.redacted === "boolean" &&
    idempotencyKeyPattern.test(request.idempotencyKey)
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function defaultDigest(bytes: Uint8Array): Promise<string> {
  return bytesToHex(
    new Uint8Array(
      await digest(
        CryptoDigestAlgorithm.SHA256,
        new Uint8Array(bytes)
      )
    )
  );
}

export class HttpCloudExport implements CloudExportPort {
  private readonly baseUrl: string;
  private readonly getAccessToken: AccessTokenProvider;
  private readonly fetchImpl: SyncFetch;
  private readonly digestBytes: ExportByteDigest;

  constructor(options: HttpCloudExportOptions) {
    this.baseUrl = normalizeHttpsBase(options.baseUrl);
    this.getAccessToken = options.getAccessToken;
    this.fetchImpl =
      options.fetchImpl ??
      ((input, init) => globalThis.fetch(input, init));
    this.digestBytes = options.digestBytes ?? defaultDigest;
  }

  private async bearer<T>(): Promise<
    { readonly ok: true; readonly value: string } | Result<T>
  > {
    let accessToken: string;
    try {
      accessToken = (await this.getAccessToken()).trim();
    } catch {
      return failure(
        "OFFLINE",
        "The Export service could not be reached.",
        true
      );
    }
    if (!accessToken) {
      return failure(
        "AUTHENTICATION_REQUIRED",
        "Sign in before creating an export.",
        false
      );
    }
    return { ok: true, value: accessToken };
  }

  private malformed<T>(): Result<T> {
    return failure(
      "VALIDATION_FAILED",
      "The Export service returned a malformed response.",
      false
    );
  }

  private async statusResponse(
    response: Response
  ): Promise<Result<ExportStatusResponse>> {
    let payload: unknown;
    try {
      payload = JSON.parse(await response.text()) as unknown;
    } catch {
      return this.malformed();
    }
    if (!response.ok) {
      const error = parseContractError(payload);
      return error ? { ok: false, error } : this.malformed();
    }
    const status = parseStatus(payload);
    return status
      ? { ok: true, value: status }
      : this.malformed();
  }

  async create(
    request: CloudExportCreateRequest
  ): Promise<Result<ExportStatusResponse>> {
    if (!validCreateRequest(request)) {
      return failure(
        "VALIDATION_FAILED",
        "Choose a valid household and export scope.",
        false
      );
    }
    const bearer = await this.bearer<ExportStatusResponse>();
    if (!bearer.ok) return bearer;
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/exports`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${bearer.value}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(request)
      });
    } catch {
      return failure(
        "OFFLINE",
        "The Export service could not be reached.",
        true
      );
    }
    return this.statusResponse(response);
  }

  async get(
    exportId: string
  ): Promise<Result<ExportStatusResponse>> {
    if (!uuidPattern.test(exportId)) {
      return failure(
        "VALIDATION_FAILED",
        "The export identifier is invalid.",
        false
      );
    }
    const bearer = await this.bearer<ExportStatusResponse>();
    if (!bearer.ok) return bearer;
    let response: Response;
    try {
      response = await this.fetchImpl(
        `${this.baseUrl}/exports/${encodeURIComponent(exportId)}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${bearer.value}`
          }
        }
      );
    } catch {
      return failure(
        "OFFLINE",
        "The Export service could not be reached.",
        true
      );
    }
    return this.statusResponse(response);
  }

  async download(
    descriptor: ExportStatusResponse
  ): Promise<Result<RenderedExport>> {
    const complete = parseStatus(descriptor);
    if (
      !complete ||
      complete.status !== "ready" ||
      !complete.fileName ||
      !complete.mimeType ||
      complete.byteSize === null ||
      !complete.checksumSha256
    ) {
      return failure(
        "CONFLICT_REQUIRES_REVIEW",
        "This export is not ready to download.",
        false
      );
    }
    const bearer = await this.bearer<RenderedExport>();
    if (!bearer.ok) return bearer;
    let response: Response;
    try {
      response = await this.fetchImpl(
        `${this.baseUrl}/exports/${encodeURIComponent(
          complete.exportId
        )}/download`,
        {
          method: "GET",
          headers: {
            Accept: complete.mimeType,
            Authorization: `Bearer ${bearer.value}`
          }
        }
      );
    } catch {
      return failure(
        "OFFLINE",
        "The Export download could not be reached.",
        true
      );
    }
    if (!response.ok) {
      let payload: unknown;
      try {
        payload = JSON.parse(await response.text()) as unknown;
      } catch {
        return this.malformed();
      }
      const error = parseContractError(payload);
      return error ? { ok: false, error } : this.malformed();
    }

    const declaredLength = Number(
      response.headers.get("Content-Length") ?? "NaN"
    );
    const responseMimeType =
      response.headers
        .get("Content-Type")
        ?.split(";", 1)[0]
        ?.trim() ?? "";
    const responseChecksum =
      response.headers
        .get("X-ALYR-Checksum-SHA256")
        ?.toLowerCase() ?? "";
    if (
      declaredLength !== complete.byteSize ||
      responseMimeType !== complete.mimeType ||
      responseChecksum !== complete.checksumSha256
    ) {
      return failure(
        "INVALID_FILE",
        "The Export download metadata does not match its immutable record.",
        false
      );
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch {
      return failure(
        "OFFLINE",
        "The Export download was interrupted.",
        true
      );
    }
    if (bytes.byteLength !== complete.byteSize) {
      bytes.fill(0);
      return failure(
        "INVALID_FILE",
        "The Export download size does not match its immutable record.",
        false
      );
    }
    let checksum: string;
    try {
      checksum = (await this.digestBytes(bytes)).toLowerCase();
    } catch {
      bytes.fill(0);
      return this.malformed();
    }
    if (
      !checksumPattern.test(checksum) ||
      checksum !== complete.checksumSha256
    ) {
      bytes.fill(0);
      return failure(
        "INVALID_FILE",
        "The Export download failed SHA-256 verification.",
        false
      );
    }
    return {
      ok: true,
      value: {
        fileName: complete.fileName,
        mimeType: complete.mimeType,
        bytes
      }
    };
  }
}
