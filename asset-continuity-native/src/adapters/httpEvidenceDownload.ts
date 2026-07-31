import {
  CryptoDigestAlgorithm,
  digest
} from "expo-crypto";

import {
  API_ERROR_VERSION,
  type ApiErrorCode,
  type ContractError,
  type EvidenceDownloadIntentResponse,
  type JsonPrimitive,
  type ProviderRequestContext,
  type Result
} from "@alyr/contracts";

import type {
  EvidenceDownloadDescriptor,
  EvidenceDownloadPort
} from "@/data/evidenceDownload";
import type {
  AccessTokenProvider,
  SyncFetch
} from "@/adapters/httpSyncTransport";
import {
  assertProviderRequestActive,
  rethrowProviderCancellation
} from "@/adapters/providerRequest";
import { parseSignedBlobDownloadTarget } from "@/adapters/signedBlobTarget";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const EXPIRY_SAFETY_WINDOW_MS = 5_000;
const CHECKSUM_PATTERN = /^[a-f0-9]{64}$/u;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
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

export type EvidenceByteDigest = (
  bytes: Uint8Array
) => Promise<string>;

export interface HttpEvidenceDownloadOptions {
  readonly apiBaseUrl: string;
  readonly getAccessToken: AccessTokenProvider;
  readonly fetchImpl?: SyncFetch;
  readonly digestBytes?: EvidenceByteDigest;
}

function failure(
  code: ContractError["code"],
  message: string,
  retryable: boolean
): ContractError {
  return {
    errorVersion: API_ERROR_VERSION,
    code,
    message,
    retryable
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return (
    typeof value === "string" &&
    apiErrorCodes.some((candidate) => candidate === value)
  );
}

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return (
    value === null ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "boolean"
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

function errorFromPayload(value: unknown): ContractError | null {
  if (isRecord(value) && isContractError(value.error)) {
    return value.error;
  }
  return isContractError(value) ? value : null;
}

function normalizeHttpsBase(value: string): string {
  const normalized = value.trim().replace(/\/+$/u, "");
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("The Evidence API base URL must be valid HTTPS.");
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("The Evidence API base URL must be valid HTTPS.");
  }
  return parsed.toString().replace(/\/+$/u, "");
}

function validDescriptor(
  descriptor: EvidenceDownloadDescriptor
): boolean {
  return (
    descriptor.apiVersion === 1 &&
    UUID_PATTERN.test(descriptor.householdId) &&
    UUID_PATTERN.test(descriptor.evidenceId) &&
    UUID_PATTERN.test(descriptor.evidenceVersionId) &&
    UUID_PATTERN.test(descriptor.blobId) &&
    descriptor.fileName.trim().length > 0 &&
    descriptor.fileName.length <= 255 &&
    !/[\/\\\u0000-\u001f]/u.test(descriptor.fileName) &&
    descriptor.mimeType.trim().length > 0 &&
    descriptor.mimeType.length <= 160 &&
    Number.isSafeInteger(descriptor.byteSize) &&
    descriptor.byteSize >= 1 &&
    descriptor.byteSize <= MAX_ATTACHMENT_BYTES &&
    CHECKSUM_PATTERN.test(descriptor.checksumSha256)
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function defaultDigest(bytes: Uint8Array): Promise<string> {
  const checksum = await digest(
    CryptoDigestAlgorithm.SHA256,
    new Uint8Array(bytes)
  );
  return bytesToHex(new Uint8Array(checksum));
}

function offline(): Result<Uint8Array> {
  return {
    ok: false,
    error: failure(
      "OFFLINE",
      "The Evidence download service could not be reached.",
      true
    )
  };
}

function malformed(): Result<Uint8Array> {
  return {
    ok: false,
    error: failure(
      "VALIDATION_FAILED",
      "The Evidence download service returned a malformed response.",
      false
    )
  };
}

/**
 * Authenticated API adapter. Service credentials never cross this boundary.
 * The reviewed API returns one short-lived, provider-neutral GET target; the
 * target is validated and used without the account bearer, and the downloaded
 * bytes are SHA-256 verified before they enter the encrypted local vault.
 */
export class HttpEvidenceDownloadPort implements EvidenceDownloadPort {
  private readonly apiBaseUrl: string;
  private readonly trustedSupabaseOrigin: string;
  private readonly getAccessToken: AccessTokenProvider;
  private readonly fetchImpl: SyncFetch;
  private readonly digestBytes: EvidenceByteDigest;

  constructor(options: HttpEvidenceDownloadOptions) {
    this.apiBaseUrl = normalizeHttpsBase(options.apiBaseUrl);
    this.trustedSupabaseOrigin = new URL(this.apiBaseUrl).origin;
    this.getAccessToken = options.getAccessToken;
    this.fetchImpl =
      options.fetchImpl ??
      ((url, init) => globalThis.fetch(url, init));
    this.digestBytes = options.digestBytes ?? defaultDigest;
  }

  async download(
    descriptor: EvidenceDownloadDescriptor,
    context?: ProviderRequestContext
  ): Promise<Result<Uint8Array>> {
    assertProviderRequestActive(context);
    if (!validDescriptor(descriptor)) {
      return {
        ok: false,
        error: failure(
          "INVALID_FILE",
          "The Evidence download metadata is invalid.",
          false
        )
      };
    }

    let accessToken: string;
    try {
      accessToken = (await this.getAccessToken()).trim();
      assertProviderRequestActive(context);
    } catch (error) {
      rethrowProviderCancellation(error, context);
      return offline();
    }
    if (!accessToken) {
      return {
        ok: false,
        error: failure(
          "AUTHENTICATION_REQUIRED",
          "Sign in before downloading Evidence.",
          false
        )
      };
    }

    let intentResponse: Response;
    try {
      intentResponse = await this.fetchImpl(
        `${this.apiBaseUrl}/evidence/download`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(descriptor),
          ...(context ? { signal: context.signal } : {})
        }
      );
      assertProviderRequestActive(context);
    } catch (error) {
      rethrowProviderCancellation(error, context);
      return offline();
    }

    if (!intentResponse.ok) {
      let payload: unknown;
      try {
        payload = JSON.parse(await intentResponse.text()) as unknown;
        assertProviderRequestActive(context);
      } catch (error) {
        rethrowProviderCancellation(error, context);
        return malformed();
      }
      const error = errorFromPayload(payload);
      return error ? { ok: false, error } : malformed();
    }

    let intentPayload: unknown;
    try {
      intentPayload = JSON.parse(await intentResponse.text()) as unknown;
      assertProviderRequestActive(context);
    } catch (error) {
      rethrowProviderCancellation(error, context);
      return malformed();
    }
    if (
      !isRecord(intentPayload) ||
      !isRecord(intentPayload.downloadTarget) ||
      typeof intentPayload.downloadTarget.expiresAt !== "string"
    ) {
      return malformed();
    }
    const expectedObjectKey =
      `${descriptor.householdId}/${descriptor.blobId}/` +
      descriptor.evidenceVersionId;
    const target = parseSignedBlobDownloadTarget(
      intentPayload.downloadTarget,
      {
        objectKey: expectedObjectKey,
        expiresAt: intentPayload.downloadTarget.expiresAt,
        trustedSupabaseOrigin: this.trustedSupabaseOrigin
      }
    );
    if (
      target === null ||
      Date.parse(target.expiresAt) - Date.now() <= EXPIRY_SAFETY_WINDOW_MS
    ) {
      return malformed();
    }
    const intent: EvidenceDownloadIntentResponse = {
      downloadTarget: target
    };

    let response: Response;
    try {
      response = await this.fetchImpl(intent.downloadTarget.url, {
        method: intent.downloadTarget.method,
        headers: intent.downloadTarget.requiredHeaders,
        ...(context ? { signal: context.signal } : {})
      });
      assertProviderRequestActive(context);
    } catch (error) {
      rethrowProviderCancellation(error, context);
      return offline();
    }
    if (!response.ok) {
      return {
        ok: false,
        error: failure(
          response.status === 404 ? "NOT_FOUND" : "STORAGE_UNAVAILABLE",
          response.status === 404
            ? "The Evidence file is no longer available."
            : "The signed Evidence download target expired or was rejected.",
          response.status !== 404
        )
      };
    }

    const declaredLength = response.headers.get("Content-Length");
    if (declaredLength !== null) {
      const parsedLength = Number(declaredLength);
      if (
        !Number.isSafeInteger(parsedLength) ||
        parsedLength !== descriptor.byteSize ||
        parsedLength < 1 ||
        parsedLength > MAX_ATTACHMENT_BYTES
      ) {
        return {
          ok: false,
          error: failure(
            "INVALID_FILE",
            "The Evidence download size does not match its immutable record.",
            false
          )
        };
      }
    }

    const responseType =
      response.headers.get("Content-Type")?.split(";", 1)[0]?.trim() ?? "";
    if (
      responseType &&
      responseType !== "application/octet-stream" &&
      responseType !== descriptor.mimeType
    ) {
      return malformed();
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await response.arrayBuffer());
      assertProviderRequestActive(context);
    } catch (error) {
      rethrowProviderCancellation(error, context);
      return offline();
    }
    if (bytes.byteLength !== descriptor.byteSize) {
      bytes.fill(0);
      return {
        ok: false,
        error: failure(
          "INVALID_FILE",
          "The Evidence download size does not match its immutable record.",
          false
        )
      };
    }

    let checksum: string;
    try {
      checksum = (await this.digestBytes(bytes)).toLowerCase();
      assertProviderRequestActive(context);
    } catch (error) {
      bytes.fill(0);
      rethrowProviderCancellation(error, context);
      return malformed();
    }
    if (
      !CHECKSUM_PATTERN.test(checksum) ||
      checksum !== descriptor.checksumSha256
    ) {
      bytes.fill(0);
      return {
        ok: false,
        error: failure(
          "INVALID_FILE",
          "The Evidence download failed SHA-256 verification.",
          false
        )
      };
    }

    return { ok: true, value: bytes };
  }
}
