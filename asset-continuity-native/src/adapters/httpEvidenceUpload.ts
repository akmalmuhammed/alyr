import {
  CryptoDigestAlgorithm,
  digest
} from "expo-crypto";
import { File } from "expo-file-system";

import {
  API_ERROR_VERSION,
  CONTRACT_API_VERSION,
  apiErrorRetryabilityIsValid,
  type ApiErrorCode,
  type ContractError,
  type ProviderRequestContext,
  type Result,
  type UploadCompletionRequest,
  type UploadCompletionResponse,
  type UploadIntentResponse
} from "@alyr/contracts";

import type {
  EvidenceUploadDescriptor,
  EvidenceUploadPort,
  EvidenceUploadTransfer
} from "@/data/evidenceUpload";
import type { MaterializedAttachment } from "@/data/attachmentStore";
import type {
  AccessTokenProvider,
  SyncFetch
} from "@/adapters/httpSyncTransport";
import {
  assertProviderRequestActive,
  rethrowProviderCancellation
} from "@/adapters/providerRequest";
import { parseSignedBlobUploadTarget } from "@/adapters/signedBlobTarget";

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

const CHECKSUM_PATTERN = /^[a-f0-9]{64}$/u;

export type MaterializedByteReader = (
  uri: string
) => Promise<Uint8Array>;
export type ByteDigest = (bytes: Uint8Array) => Promise<string>;

export interface HttpEvidenceUploadOptions {
  readonly apiBaseUrl: string;
  readonly projectUrl: string;
  readonly getAccessToken: AccessTokenProvider;
  readonly fetchImpl?: SyncFetch;
  readonly readBytes?: MaterializedByteReader;
  readonly digestBytes?: ByteDigest;
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

function isContractError(value: unknown): value is ContractError {
  return (
    isRecord(value) &&
    value.errorVersion === API_ERROR_VERSION &&
    isApiErrorCode(value.code) &&
    typeof value.message === "string" &&
    typeof value.retryable === "boolean" &&
    apiErrorRetryabilityIsValid(value.code, value.retryable)
  );
}

function errorFromPayload(value: unknown): ContractError | null {
  if (isRecord(value) && isContractError(value.error)) {
    return value.error;
  }
  return isContractError(value) ? value : null;
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

function offline<T>(): Result<T> {
  return {
    ok: false,
    error: failure(
      "OFFLINE",
      "The Evidence upload service could not be reached.",
      true
    )
  };
}

function malformed<T>(): Result<T> {
  return {
    ok: false,
    error: failure(
      "VALIDATION_FAILED",
      "The Evidence upload service returned a malformed response.",
      false
    )
  };
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

async function defaultReadBytes(uri: string): Promise<Uint8Array> {
  return new File(uri).bytes();
}

function normalizeHttpsBase(value: string, label: string): string {
  const normalized = value.trim().replace(/\/+$/u, "");
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL.`);
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${label} must be a valid HTTPS URL.`);
  }
  return parsed.toString().replace(/\/+$/u, "");
}

function isUploadIntentResponse(
  value: unknown
): value is UploadIntentResponse {
  return (
    isRecord(value) &&
    typeof value.uploadId === "string" &&
    typeof value.blobObjectId === "string" &&
    typeof value.expiresAt === "string" &&
    Number.isFinite(Date.parse(value.expiresAt)) &&
    isRecord(value.uploadTarget)
  );
}

function isUploadCompletionResponse(
  value: unknown
): value is UploadCompletionResponse {
  return (
    isRecord(value) &&
    isRecord(value.upload) &&
    typeof value.upload.id === "string" &&
    typeof value.upload.objectKey === "string" &&
    value.upload.status === "stored" &&
    typeof value.note === "string"
  );
}

/**
 * Upload adapter for signed native builds. Intent/completion calls use a fresh
 * user bearer. The raw byte transfer is sent only to a validated short-lived
 * provider target returned by the reviewed API; the bearer is deliberately
 * omitted from that request.
 */
export class HttpEvidenceUploadPort implements EvidenceUploadPort {
  private readonly apiBaseUrl: string;
  private readonly trustedSupabaseOrigin: string;
  private readonly getAccessToken: AccessTokenProvider;
  private readonly fetchImpl: SyncFetch;
  private readonly readBytes: MaterializedByteReader;
  private readonly digestBytes: ByteDigest;

  constructor(options: HttpEvidenceUploadOptions) {
    this.apiBaseUrl = normalizeHttpsBase(
      options.apiBaseUrl,
      "The API base URL"
    );
    const projectUrl = normalizeHttpsBase(
      options.projectUrl,
      "The Supabase project URL"
    );
    if (
      new URL(this.apiBaseUrl).origin !== new URL(projectUrl).origin
    ) {
      throw new Error(
        "The API and storage project must use the same trusted origin."
      );
    }
    this.trustedSupabaseOrigin = new URL(projectUrl).origin;
    this.getAccessToken = options.getAccessToken;
    this.fetchImpl =
      options.fetchImpl ??
      ((url, init) => globalThis.fetch(url, init));
    this.readBytes = options.readBytes ?? defaultReadBytes;
    this.digestBytes = options.digestBytes ?? defaultDigest;
  }

  async createIntent(
    descriptor: EvidenceUploadDescriptor,
    context?: ProviderRequestContext
  ): Promise<Result<UploadIntentResponse>> {
    return this.apiRequest(
      `${this.apiBaseUrl}/uploads/intents`,
      JSON.stringify(descriptor),
      isUploadIntentResponse,
      context
    );
  }

  async complete(
    descriptor: EvidenceUploadDescriptor,
    uploadId: string,
    context?: ProviderRequestContext
  ): Promise<Result<UploadCompletionResponse>> {
    const request: UploadCompletionRequest = {
      apiVersion: CONTRACT_API_VERSION,
      checksumSha256: descriptor.checksumSha256,
      byteSize: descriptor.byteSize
    };
    const result = await this.apiRequest(
      `${this.apiBaseUrl}/uploads/${encodeURIComponent(uploadId)}/complete`,
      JSON.stringify(request),
      isUploadCompletionResponse,
      context
    );
    if (!result.ok) return result;

    const expectedObjectKey =
      `${descriptor.householdId}/${descriptor.blobId}/` +
      descriptor.evidenceVersionId;
    if (
      result.value.upload.id !== descriptor.blobId ||
      result.value.upload.objectKey !== expectedObjectKey
    ) {
      return malformed();
    }
    return result;
  }

  async upload(
    descriptor: EvidenceUploadDescriptor,
    intent: UploadIntentResponse,
    attachment: MaterializedAttachment,
    context?: ProviderRequestContext
  ): Promise<Result<EvidenceUploadTransfer>> {
    assertProviderRequestActive(context);
    const expectedPath =
      `${descriptor.householdId}/${descriptor.blobId}/` +
      descriptor.evidenceVersionId;
    const target = parseSignedBlobUploadTarget(intent.uploadTarget, {
      objectKey: expectedPath,
      expiresAt: intent.expiresAt,
      mimeType: descriptor.mimeType,
      trustedSupabaseOrigin: this.trustedSupabaseOrigin
    });
    if (
      intent.uploadId !== descriptor.blobId ||
      intent.blobObjectId !== descriptor.blobId ||
      target === null ||
      !attachment.temporary ||
      attachment.integrity !== "aes-gcm-and-sha256"
    ) {
      return malformed();
    }

    let bytes: Uint8Array | null = null;
    let body: ArrayBuffer | null = null;
    try {
      try {
        bytes = await this.readBytes(attachment.uri);
        assertProviderRequestActive(context);
      } catch (error) {
        rethrowProviderCancellation(error, context);
        return {
          ok: false,
          error: failure(
            "INVALID_FILE",
            "The verified temporary Evidence file could not be read.",
            false
          )
        };
      }
      if (
        bytes.byteLength !== descriptor.byteSize ||
        bytes.byteLength !== attachment.byteSize
      ) {
        return {
          ok: false,
          error: failure(
            "INVALID_FILE",
            "The temporary Evidence file size changed before upload.",
            false
          )
        };
      }
      const checksum = (await this.digestBytes(bytes)).toLowerCase();
      assertProviderRequestActive(context);
      if (
        !CHECKSUM_PATTERN.test(checksum) ||
        checksum !== descriptor.checksumSha256 ||
        checksum !== attachment.checksumSha256
      ) {
        return {
          ok: false,
          error: failure(
            "INVALID_FILE",
            "The temporary Evidence file checksum changed before upload.",
            false
          )
        };
      }

      // Copy into a tightly sized ArrayBuffer for React Native fetch. Both the
      // source and transfer copy are zeroed after the request resolves.
      body = new Uint8Array(bytes).buffer;
      let response: Response;
      try {
        response = await this.fetchImpl(target.url, {
          method: target.method,
          headers: target.requiredHeaders,
          body,
          ...(context ? { signal: context.signal } : {})
        });
        assertProviderRequestActive(context);
      } catch (error) {
        rethrowProviderCancellation(error, context);
        return offline();
      }

      // A conflict means the immutable object already exists. It is not
      // labelled stored here; the coordinator immediately calls `/complete`,
      // whose server-side stream/checksum is the only success boundary.
      if (response.status === 409 || response.status === 412) {
        return {
          ok: true,
          value: { outcome: "already-present" }
        };
      }
      if (!response.ok) {
        if (response.status === 413) {
          return {
            ok: false,
            error: failure(
              "INVALID_FILE",
              "The Evidence file exceeds the cloud upload limit.",
              false
            )
          };
        }
        if (response.status === 429) {
          return {
            ok: false,
            error: failure(
              "RATE_LIMITED",
              "The upload service is busy. Heldat will retry.",
              true
            )
          };
        }
        return {
          ok: false,
          error: failure(
            "STORAGE_UNAVAILABLE",
            response.status >= 400 && response.status < 500
              ? "The signed upload target expired or was rejected."
              : "The cloud file store did not accept the Evidence bytes.",
            true
          )
        };
      }
      return {
        ok: true,
        value: { outcome: "uploaded" }
      };
    } finally {
      bytes?.fill(0);
      if (body) new Uint8Array(body).fill(0);
    }
  }

  private async apiRequest<T>(
    url: string,
    body: string,
    guard: (value: unknown) => value is T,
    context?: ProviderRequestContext
  ): Promise<Result<T>> {
    assertProviderRequestActive(context);
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
          "Sign in before uploading Evidence.",
          false
        )
      };
    }

    let response: Response;
    try {
        response = await this.fetchImpl(url, {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body,
          ...(context ? { signal: context.signal } : {})
        });
      assertProviderRequestActive(context);
    } catch (error) {
      rethrowProviderCancellation(error, context);
      return offline();
    }

    let payload: unknown;
    try {
      payload = JSON.parse(await response.text()) as unknown;
      assertProviderRequestActive(context);
    } catch (error) {
      rethrowProviderCancellation(error, context);
      return malformed();
    }
    if (!response.ok) {
      const error = errorFromPayload(payload);
      return error ? { ok: false, error } : malformed();
    }
    return guard(payload)
      ? { ok: true, value: payload }
      : malformed();
  }
}
